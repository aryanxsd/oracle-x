import "server-only"
import { querySnowflake } from "@/lib/snowflake"
import { cached } from "@/lib/server/cache"
import { parseBrief } from "@/lib/brief"
import type { BriefSummary, CaseFile, CaseFileSummary, CaseList, CouncilCase, CouncilCaseSummary } from "@/lib/case-types"

/**
 * Case Files, read from the frozen backend only (no council or evaluator is ever started here):
 *   CASES.COUNCIL_RUNS          council reports (FINAL_RESPONSE = nine-section markdown report)
 *   CASES.COUNCIL_TRANSCRIPTS   specialist briefs — parsed on the server, raw answers never sent to the browser
 *   CASES.CASE_FILES            historical case files
 *   CASES.INVESTIGATIONS / EVIDENCE_ITEMS / CONTRADICTIONS   context for historical case files
 *   CORE.ENTITY_NODES           display names
 */
const TTL = 5 * 60_000
const toIso = (v: unknown) => (v == null || v === "" ? null : v instanceof Date ? v.toISOString() : String(v))
const num = (v: unknown) => (v == null || v === "" ? null : Number(v))
const str = (v: unknown) => (v == null || v === "" ? null : String(v))

const councilSummary = (r: Record<string, unknown>): CouncilCaseSummary => ({
  kind: "council",
  id: String(r.COUNCIL_RUN_ID),
  entityId: String(r.ENTITY_ID),
  mode: str(r.EXECUTION_MODE),
  status: String(r.STATUS ?? "").toUpperCase(),
  startedAt: toIso(r.STARTED_AT),
  totalSeconds: num(r.TOTAL_SECONDS),
  specialistsOk: num(r.SPECIALISTS_OK),
  specialistsFailed: num(r.SPECIALISTS_FAILED),
  title: str(r.TITLE),
})

const fileSummary = (r: Record<string, unknown>): CaseFileSummary => ({
  kind: "file",
  id: String(r.CASE_FILE_ID),
  caseId: str(r.CASE_ID),
  subjectId: str(r.SUBJECT_ENTITY_ID),
  title: str(r.TITLE),
  generatedAt: toIso(r.GENERATED_AT),
  status: str(r.FILE_STATUS),
  version: num(r.VERSION),
  recommendation: str(r.RECOMMENDATION),
  completenessPct: num(r.EVIDENCE_COMPLETENESS_PCT),
})

const COUNCIL_COLS = `r.council_run_id, r.entity_id, r.execution_mode, r.status, r.started_at, r.total_seconds, r.specialists_ok, r.specialists_failed,
  REGEXP_SUBSTR(r.final_response, '^# ([^\\n]+)', 1, 1, 'me', 1) AS title`

/** Council reports for the entity (newest first) and all historical case files. Report bodies are not loaded. */
export function listCases(entityId: string): Promise<CaseList> {
  return cached(`cases:list:${entityId}`, TTL, async () => {
    const [runs, files] = await Promise.all([
      querySnowflake(`SELECT ${COUNCIL_COLS} FROM ORACLE_X.CASES.COUNCIL_RUNS r WHERE r.entity_id = ? ORDER BY r.started_at DESC LIMIT 50`, { binds: [entityId] }),
      querySnowflake(
        `SELECT f.case_file_id, f.case_id, f.version, f.generated_at, f.title, f.recommendation, f.evidence_completeness_pct, f.file_status, i.subject_entity_id
           FROM ORACLE_X.CASES.CASE_FILES f LEFT JOIN ORACLE_X.CASES.INVESTIGATIONS i ON i.case_id = f.case_id
          ORDER BY f.generated_at DESC LIMIT 50`,
      ),
    ])
    return { entityId, council: runs.map(councilSummary), files: files.map(fileSummary) }
  })
}

export function getCouncilCase(runId: string): Promise<CouncilCase | null> {
  return cached(`cases:council:${runId}`, TTL, async () => {
    const rows = await querySnowflake(
      `SELECT ${COUNCIL_COLS}, r.user_question, r.finished_at,
              IFF(UPPER(r.status) = 'COMPLETED', r.final_response, NULL) AS final_response, n.display_name
         FROM ORACLE_X.CASES.COUNCIL_RUNS r LEFT JOIN ORACLE_X.CORE.ENTITY_NODES n ON n.node_id = r.entity_id
        WHERE r.council_run_id = ?`,
      { binds: [runId] },
    )
    const r = rows[0]
    if (!r) return null
    return { ...councilSummary(r), entityName: str(r.DISPLAY_NAME), question: str(r.USER_QUESTION), finishedAt: toIso(r.FINISHED_AT), finalResponse: str(r.FINAL_RESPONSE) }
  })
}

/** One brief per specialist for one run (latest answer per role). Only the parsed brief leaves the server. */
export function getCaseBriefs(runId: string): Promise<BriefSummary[]> {
  return cached(`cases:briefs:${runId}`, TTL, async () => {
    const rows = await querySnowflake(
      `SELECT agent_role, MAX_BY(status, started_at) AS status, MAX_BY(duration_ms, started_at) AS duration_ms,
              MAX_BY(tools_used, started_at) AS tools_used, MAX_BY(answer_text, started_at) AS answer_text
         FROM ORACLE_X.CASES.COUNCIL_TRANSCRIPTS WHERE council_run_id = ? GROUP BY agent_role`,
      { binds: [runId] },
    )
    return rows.map((t) => ({
      role: String(t.AGENT_ROLE).toUpperCase(),
      status: str(t.STATUS),
      durationSeconds: t.DURATION_MS == null ? null : Math.round(Number(t.DURATION_MS) / 1000),
      tools: t.TOOLS_USED ? String(t.TOOLS_USED).split(/,\s*/).filter(Boolean) : [],
      brief: parseBrief(t.ANSWER_TEXT),
    }))
  })
}

export function getCaseFile(caseFileId: string): Promise<CaseFile | null> {
  return cached(`cases:file:${caseFileId}`, TTL, async () => {
    const rows = await querySnowflake(
      `SELECT f.case_file_id, f.case_id, f.version, f.generated_at, f.generated_by, f.title, f.executive_summary, f.narrative, f.recommendation,
              f.evidence_completeness_pct, f.file_status, i.subject_entity_id, i.typology, i.outcome, i.opened_at, i.closed_at, i.lead_analyst,
              i.key_indicators, i.deciding_factors, n.display_name
         FROM ORACLE_X.CASES.CASE_FILES f
         LEFT JOIN ORACLE_X.CASES.INVESTIGATIONS i ON i.case_id = f.case_id
         LEFT JOIN ORACLE_X.CORE.ENTITY_NODES n ON n.node_id = i.subject_entity_id
        WHERE f.case_file_id = ?`,
      { binds: [caseFileId] },
    )
    const r = rows[0]
    if (!r) return null
    const caseId = str(r.CASE_ID)
    const [ev, contra] = caseId
      ? await Promise.all([
          querySnowflake(
            `SELECT evidence_id, evidence_type, stance, description, source_reference, confidence, is_verified, collected_at, collected_by
               FROM ORACLE_X.CASES.EVIDENCE_ITEMS WHERE case_id = ? ORDER BY collected_at, evidence_id`,
            { binds: [caseId] },
          ),
          querySnowflake(
            `SELECT contradiction_id, claim, counter_claim, resolution, resolution_status, raised_by, resolved_at
               FROM ORACLE_X.CASES.CONTRADICTIONS WHERE case_id = ? ORDER BY contradiction_id`,
            { binds: [caseId] },
          ),
        ])
      : [[], []]
    return {
      ...fileSummary(r),
      generatedBy: str(r.GENERATED_BY),
      executiveSummary: str(r.EXECUTIVE_SUMMARY),
      narrative: str(r.NARRATIVE),
      subjectName: str(r.DISPLAY_NAME),
      typology: str(r.TYPOLOGY),
      outcome: str(r.OUTCOME),
      openedAt: toIso(r.OPENED_AT),
      closedAt: toIso(r.CLOSED_AT),
      leadAnalyst: str(r.LEAD_ANALYST),
      keyIndicators: str(r.KEY_INDICATORS),
      decidingFactors: str(r.DECIDING_FACTORS),
      evidence: ev.map((e) => ({
        evidenceId: String(e.EVIDENCE_ID),
        type: str(e.EVIDENCE_TYPE),
        stance: str(e.STANCE),
        description: str(e.DESCRIPTION),
        source: str(e.SOURCE_REFERENCE),
        confidence: num(e.CONFIDENCE),
        verified: e.IS_VERIFIED == null ? null : Boolean(e.IS_VERIFIED),
        collectedAt: toIso(e.COLLECTED_AT),
        collectedBy: str(e.COLLECTED_BY),
      })),
      contradictions: contra.map((c) => ({
        id: String(c.CONTRADICTION_ID),
        claim: str(c.CLAIM),
        counterClaim: str(c.COUNTER_CLAIM),
        resolution: str(c.RESOLUTION),
        status: str(c.RESOLUTION_STATUS),
        raisedBy: str(c.RAISED_BY),
        resolvedAt: toIso(c.RESOLVED_AT),
      })),
    }
  })
}
