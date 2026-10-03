import "server-only"
import { querySnowflake } from "@/lib/snowflake"
import { cached } from "@/lib/server/cache"
import { parseBrief } from "@/lib/brief"
import { stageStatus, type ToolCall, type Trace, type TraceRunOption } from "@/lib/trace-types"

/**
 * Agent Trace from existing council records only (never starts a council):
 *   CASES.COUNCIL_RUNS          question, mode, status, phase timestamps, final response
 *   CASES.COUNCIL_TRANSCRIPTS   one consultation per specialist (status, timing, tools, tokens, brief)
 *   EVAL.V_AGENT_TOOL_CALLS     per-call tool name and backend outcome class (SUCCESS / GUARDRAIL_REJECTION / TOOL_FAILURE)
 * Only safe columns are selected: no SQL text, tool inputs, raw responses or result previews leave Snowflake.
 */
const TTL = 5 * 60_000
const toIso = (v: unknown) => (v == null || v === "" ? null : v instanceof Date ? v.toISOString() : String(v))
const num = (v: unknown) => (v == null || v === "" ? null : Number(v))
const str = (v: unknown) => (v == null || v === "" ? null : String(v))

export function listTraceRuns(entityId: string): Promise<TraceRunOption[]> {
  return cached(`trace:runs:${entityId}`, TTL, async () => {
    const rows = await querySnowflake(
      `SELECT council_run_id, execution_mode, status, started_at FROM ORACLE_X.CASES.COUNCIL_RUNS WHERE entity_id = ? ORDER BY started_at DESC LIMIT 50`,
      { binds: [entityId] },
    )
    return rows.map((r) => ({ runId: String(r.COUNCIL_RUN_ID), mode: str(r.EXECUTION_MODE), status: String(r.STATUS ?? "").toUpperCase(), startedAt: toIso(r.STARTED_AT) }))
  })
}

/** Run + specialist stages. Per-call tool data is loaded separately (getToolCalls) because its view is heavier. */
export function getTrace(runId: string): Promise<Trace | null> {
  return cached(`trace:${runId}`, TTL, async () => {
    const [runs, tx] = await Promise.all([
      querySnowflake(
        `SELECT r.council_run_id, r.entity_id, r.user_question, r.execution_mode, r.status, r.current_phase, r.started_at, r.phase1_done_at,
                r.compliance_done_at, r.skeptic_done_at, r.finished_at, r.total_seconds, r.specialists_ok, r.specialists_failed,
                IFF(UPPER(r.status) = 'COMPLETED', r.final_response, NULL) AS final_response, n.display_name
           FROM ORACLE_X.CASES.COUNCIL_RUNS r LEFT JOIN ORACLE_X.CORE.ENTITY_NODES n ON n.node_id = r.entity_id
          WHERE r.council_run_id = ?`,
        { binds: [runId] },
      ),
      querySnowflake(
        `SELECT agent_role, MAX_BY(status, started_at) AS status, MAX(started_at) AS started_at, MAX_BY(duration_ms, started_at) AS duration_ms,
                MAX_BY(tools_used, started_at) AS tools_used, MAX_BY(input_tokens, started_at) AS input_tokens, MAX_BY(output_tokens, started_at) AS output_tokens,
                MAX_BY(answer_text, started_at) AS answer_text
           FROM ORACLE_X.CASES.COUNCIL_TRANSCRIPTS WHERE council_run_id = ? GROUP BY agent_role`,
        { binds: [runId] },
      ),
    ])
    const r = runs[0]
    if (!r) return null
    const runStatus = String(r.STATUS ?? "").toUpperCase()
    const start = r.STARTED_AT ? new Date(toIso(r.STARTED_AT)!).getTime() : null
    return {
      runId: String(r.COUNCIL_RUN_ID),
      entityId: String(r.ENTITY_ID),
      entityName: str(r.DISPLAY_NAME),
      question: str(r.USER_QUESTION),
      mode: str(r.EXECUTION_MODE),
      status: runStatus,
      phase: str(r.CURRENT_PHASE),
      startedAt: toIso(r.STARTED_AT),
      phase1DoneAt: toIso(r.PHASE1_DONE_AT),
      complianceDoneAt: toIso(r.COMPLIANCE_DONE_AT),
      skepticDoneAt: toIso(r.SKEPTIC_DONE_AT),
      finishedAt: toIso(r.FINISHED_AT),
      totalSeconds: num(r.TOTAL_SECONDS),
      specialistsOk: num(r.SPECIALISTS_OK),
      specialistsFailed: num(r.SPECIALISTS_FAILED),
      finalResponse: str(r.FINAL_RESPONSE),
      stages: tx.map((t) => {
        const at = toIso(t.STARTED_AT)
        return {
          role: String(t.AGENT_ROLE).toUpperCase(),
          status: stageStatus(str(t.STATUS), runStatus),
          backendStatus: str(t.STATUS),
          startedAt: at,
          durationSeconds: t.DURATION_MS == null ? null : Math.round(Number(t.DURATION_MS) / 1000),
          offsetSeconds: start != null && at ? Math.round((new Date(at).getTime() - start) / 1000) : null,
          tools: t.TOOLS_USED ? String(t.TOOLS_USED).split(/,\s*/).filter(Boolean) : [],
          inputTokens: num(t.INPUT_TOKENS),
          outputTokens: num(t.OUTPUT_TOKENS),
          brief: parseBrief(t.ANSWER_TEXT),
          calls: [],
        }
      }),
      orchestratorCalls: [],
      toolCallsAvailable: false,
    }
  })
}

/** Per-call tool names and outcome classes for one run. Never selects SQL text, inputs or result previews. */
export function getToolCalls(runId: string): Promise<ToolCall[]> {
  return cached(`trace:calls:${runId}`, TTL, async () => {
    const rows = await querySnowflake(
      `SELECT agent_role, seq, tool_name, tool_type, outcome_class, tool_error_code, graph_hops_requested, graph_paths_requested, graph_paths_returned
         FROM ORACLE_X.EVAL.V_AGENT_TOOL_CALLS WHERE council_run_id = ? ORDER BY agent_role, seq`,
      { binds: [runId] },
    )
    return rows.map((c) => ({
      role: String(c.AGENT_ROLE).toUpperCase(),
      seq: Number(c.SEQ),
      name: String(c.TOOL_NAME ?? "unknown"),
      type: str(c.TOOL_TYPE),
      outcome: String(c.OUTCOME_CLASS ?? "UNKNOWN"),
      errorCode: str(c.TOOL_ERROR_CODE),
      graphHopsRequested: num(c.GRAPH_HOPS_REQUESTED),
      graphPathsRequested: num(c.GRAPH_PATHS_REQUESTED),
      graphPathsReturned: num(c.GRAPH_PATHS_RETURNED),
    }))
  })
}

/** Most recent completed full-council run for the entity (the default trace). */
export async function latestCompletedRun(entityId: string): Promise<string | null> {
  const runs = await listTraceRuns(entityId)
  return (runs.find((r) => r.status === "COMPLETED" && r.mode === "PHASED_ASYNC") ?? runs.find((r) => r.status === "COMPLETED") ?? runs[0])?.runId ?? null
}
