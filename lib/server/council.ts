import "server-only"
import { querySnowflake, submitSnowflakeAsync } from "@/lib/snowflake"
import { parseBrief, type Brief } from "@/lib/brief"

/**
 * Full ORACLE X council, driven by the EXISTING Snowflake engine:
 *   start  → CALL ORACLE_X.AGENTS.SP_RUN_COUNCIL(entity, question, run_id)  (submitted async, not awaited)
 *   status → CASES.COUNCIL_RUNS (phase, timings) + CASES.COUNCIL_TRANSCRIPTS (which specialists answered)
 * No council logic lives here; this module only starts the procedure and reads its state.
 */

/** Standard full-council request (same wording as evaluation case A). */
export const FULL_COUNCIL_QUESTION =
  "Convene the full ORACLE X Investigation Council on {ENTITY}: investigator findings, independent risk analysis, " +
  "compliance analysis, skeptic challenges, DO_NOTHING / MONITOR / BLOCK comparison, unresolved questions and a " +
  "final evidence-grounded finding."

/** A run older than this that never finished is reported as stalled rather than running. */
const STALE_AFTER_SECONDS = 20 * 60

export type StageKey = "INVESTIGATOR" | "RISK_ANALYST" | "COMPLIANCE" | "SKEPTIC" | "SCENARIO" | "ORACLE"
export type StageState = "idle" | "running" | "done" | "failed"

export interface StageDetail {
  durationSeconds: number | null
  tools: string[]
  brief: Brief | null
}

export interface CouncilStatus {
  runId: string
  entityId: string
  status: "RUNNING" | "COMPLETED" | "FAILED" | "STALLED"
  phase: string | null
  startedAt: string | null
  finishedAt: string | null
  elapsedSeconds: number | null
  stages: Record<StageKey, StageState>
  stageDetails: Partial<Record<StageKey, StageDetail>>
  finalResponse: string | null
  error: string | null
}

function toIso(v: unknown): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : String(v)
}

export function newRunId(entityId: string, now = new Date()): string {
  const ts = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `UI-${entityId}-${ts}-${rand}`
}

/**
 * SP_RUN_COUNCIL inserts its COUNCIL_RUNS row only once the procedure starts executing, so for a
 * few seconds after submission the database cannot see the new run. This in-process reservation
 * covers that window: repeat or concurrent starts for the same entity get the same run id.
 * (Single app instance; the COUNCIL_RUNS check below remains the cross-instance safeguard.)
 */
const RESERVATION_MS = 2 * 60 * 1000
const reservations = new Map<string, { runId: string; at: number; pending?: Promise<{ runId: string; reused: boolean }> }>()

/** Test hook: clear in-process reservations. */
export function _resetCouncilReservations() {
  reservations.clear()
}

/**
 * Starts a council run, or returns the one already running for this entity
 * (prevents duplicate 5–7 minute runs and duplicate cost from repeated clicks).
 */
export async function startCouncil(entityId: string): Promise<{ runId: string; reused: boolean }> {
  const held = reservations.get(entityId)
  if (held && Date.now() - held.at < RESERVATION_MS) {
    if (held.pending) await held.pending.catch(() => undefined)
    const again = reservations.get(entityId)
    if (again && !again.pending) return { runId: again.runId, reused: true }
  }

  const pending = (async () => {
    const running = await querySnowflake(
      `SELECT council_run_id FROM ORACLE_X.CASES.COUNCIL_RUNS
        WHERE entity_id = ? AND UPPER(status) = 'RUNNING' AND execution_mode = 'PHASED_ASYNC'
          AND started_at > DATEADD(second, -?, CURRENT_TIMESTAMP()::TIMESTAMP_NTZ)
        ORDER BY started_at DESC LIMIT 1`,
      { binds: [entityId, STALE_AFTER_SECONDS] },
    )
    if (running[0]?.COUNCIL_RUN_ID) return { runId: String(running[0].COUNCIL_RUN_ID), reused: true }

    const runId = newRunId(entityId)
    await submitSnowflakeAsync("CALL ORACLE_X.AGENTS.SP_RUN_COUNCIL(?, ?, ?)", {
      binds: [entityId, FULL_COUNCIL_QUESTION.replace("{ENTITY}", entityId), runId],
    })
    return { runId, reused: false }
  })()

  reservations.set(entityId, { runId: "", at: Date.now(), pending })
  try {
    const result = await pending
    reservations.set(entityId, { runId: result.runId, at: Date.now() })
    return result
  } catch (e) {
    reservations.delete(entityId)
    throw e
  }
}

/** Maps the backend's phase text and transcript rows onto the six pipeline stages. */
export function deriveStages(
  status: string,
  phase: string | null,
  answered: Record<string, string>,
): Record<StageKey, StageState> {
  const s = status.toUpperCase()
  const p = (phase ?? "").toUpperCase()
  const failed = s === "FAILED"
  const st = (role: StageKey, activeNow: boolean): StageState => {
    const t = answered[role]
    if (t) return t.toLowerCase() === "error" || t.toUpperCase() === "FAILED" ? "failed" : "done"
    if (failed) return "idle"
    return activeNow ? "running" : "idle"
  }
  const phase1 = p.startsWith("PHASE_1")
  const phase2 = p.startsWith("PHASE_2")
  return {
    INVESTIGATOR: st("INVESTIGATOR", phase1),
    RISK_ANALYST: st("RISK_ANALYST", phase1 || phase2),
    SCENARIO: st("SCENARIO", phase1 || phase2),
    COMPLIANCE: st("COMPLIANCE", phase2),
    SKEPTIC: st("SKEPTIC", p.startsWith("PHASE_3")),
    ORACLE:
      s === "COMPLETED" ? "done" : failed ? "failed" : p.startsWith("PHASE_4") ? "running" : "idle",
  }
}

export async function getCouncilStatus(runId: string): Promise<CouncilStatus | null> {
  const rows = await querySnowflake(
    `SELECT council_run_id, entity_id, status, current_phase, started_at, finished_at, total_seconds,
            DATEDIFF(second, started_at, COALESCE(finished_at, CURRENT_TIMESTAMP()::TIMESTAMP_NTZ)) AS elapsed,
            IFF(UPPER(status) = 'COMPLETED', final_response, NULL) AS final_response,
            IFF(UPPER(status) = 'FAILED', LEFT(error_message, 300), NULL) AS error_message
       FROM ORACLE_X.CASES.COUNCIL_RUNS WHERE council_run_id = ?`,
    { binds: [runId] },
  )
  const r = rows[0]
  if (!r) return null

  const transcripts = await querySnowflake(
    `SELECT agent_role,
            MAX_BY(status, started_at) AS status,
            MAX_BY(duration_ms, started_at) AS duration_ms,
            MAX_BY(tools_used, started_at) AS tools_used,
            MAX_BY(answer_text, started_at) AS answer_text
       FROM ORACLE_X.CASES.COUNCIL_TRANSCRIPTS WHERE council_run_id = ? GROUP BY agent_role`,
    { binds: [runId] },
  )
  const answered: Record<string, string> = {}
  const details: Partial<Record<StageKey, StageDetail>> = {}
  for (const t of transcripts) {
    const role = String(t.AGENT_ROLE).toUpperCase() as StageKey
    answered[role] = String(t.STATUS ?? "")
    details[role] = {
      durationSeconds: t.DURATION_MS == null ? null : Math.round(Number(t.DURATION_MS) / 1000),
      tools: t.TOOLS_USED ? String(t.TOOLS_USED).split(/,\s*/).filter(Boolean) : [],
      brief: parseBrief(t.ANSWER_TEXT),
    }
  }

  const elapsed = r.ELAPSED == null ? null : Number(r.ELAPSED)
  let status = String(r.STATUS).toUpperCase() as CouncilStatus["status"]
  if (status === "RUNNING" && elapsed !== null && elapsed > STALE_AFTER_SECONDS) status = "STALLED"

  return {
    runId: r.COUNCIL_RUN_ID,
    entityId: r.ENTITY_ID,
    status,
    phase: r.CURRENT_PHASE ?? null,
    startedAt: toIso(r.STARTED_AT),
    finishedAt: toIso(r.FINISHED_AT),
    elapsedSeconds: elapsed,
    stages: deriveStages(status, r.CURRENT_PHASE ?? null, answered),
    stageDetails: details,
    finalResponse: r.FINAL_RESPONSE ?? null,
    error: status === "FAILED" ? "The council could not finish this run." : status === "STALLED" ? "This run stopped reporting progress." : null,
  }
}

/** Most recent full-council run for an entity (any status), or null. */
export async function getLatestCouncilRunId(entityId: string): Promise<string | null> {
  const rows = await querySnowflake(
    `SELECT council_run_id FROM ORACLE_X.CASES.COUNCIL_RUNS
      WHERE entity_id = ? AND execution_mode = 'PHASED_ASYNC' ORDER BY started_at DESC LIMIT 1`,
    { binds: [entityId] },
  )
  return rows[0]?.COUNCIL_RUN_ID ? String(rows[0].COUNCIL_RUN_ID) : null
}
