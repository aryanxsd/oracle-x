import "server-only"
import { querySnowflake } from "@/lib/snowflake"
import { cached } from "@/lib/server/cache"
import type { EvalRunDetail, EvalRunSummary } from "@/lib/trace-types"

/**
 * Evaluation, read from the existing evaluator's stored results only (the evaluator itself is never invoked):
 *   EVAL.EVAL_RUNS     one row per evaluated council run (criteria passed/total, judge scores, overall status)
 *   EVAL.EVAL_RESULTS  one row per criterion (method DETERMINISTIC / LLM_JUDGE, passed, score, detail)
 *   EVAL.EVAL_CASES    the test situation each run was evaluated against
 */
const TTL = 5 * 60_000
const toIso = (v: unknown) => (v == null || v === "" ? null : v instanceof Date ? v.toISOString() : String(v))
const num = (v: unknown) => (v == null || v === "" ? null : Number(v))
const str = (v: unknown) => (v == null || v === "" ? null : String(v))
const arr = (v: unknown): string[] => {
  const a = typeof v === "string" ? safeJson(v) : v
  return Array.isArray(a) ? a.map(String) : []
}
const obj = (v: unknown): Record<string, unknown> | null => {
  const o = typeof v === "string" ? safeJson(v) : v
  return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

const SUMMARY_COLS = `r.eval_run_id, r.case_id, r.council_run_id, r.evaluated_at, r.total_seconds, r.criteria_total, r.criteria_passed,
  r.overall_status, r.judge_model, r.judge_scores, c.situation, c.entity_id`

const summary = (r: Record<string, unknown>): EvalRunSummary => ({
  evalRunId: String(r.EVAL_RUN_ID),
  caseId: str(r.CASE_ID),
  situation: str(r.SITUATION),
  entityId: str(r.ENTITY_ID),
  councilRunId: str(r.COUNCIL_RUN_ID),
  evaluatedAt: toIso(r.EVALUATED_AT),
  totalSeconds: num(r.TOTAL_SECONDS),
  criteriaTotal: num(r.CRITERIA_TOTAL),
  criteriaPassed: num(r.CRITERIA_PASSED),
  overallStatus: str(r.OVERALL_STATUS),
  judgeModel: str(r.JUDGE_MODEL),
  judgeScores: obj(r.JUDGE_SCORES),
})

/** Evaluation runs, newest first; optionally only those for one council run. */
export function listEvalRuns(councilRunId?: string | null): Promise<EvalRunSummary[]> {
  return cached(`eval:list:${councilRunId ?? "*"}`, TTL, async () => {
    const rows = await querySnowflake(
      `SELECT ${SUMMARY_COLS} FROM ORACLE_X.EVAL.EVAL_RUNS r LEFT JOIN ORACLE_X.EVAL.EVAL_CASES c ON c.case_id = r.case_id
        ${councilRunId ? "WHERE r.council_run_id = ?" : ""} ORDER BY r.evaluated_at DESC LIMIT 100`,
      councilRunId ? { binds: [councilRunId] } : undefined,
    )
    return rows.map(summary)
  })
}

export function getEvalRun(evalRunId: string): Promise<EvalRunDetail | null> {
  return cached(`eval:run:${evalRunId}`, TTL, async () => {
    const [runs, results] = await Promise.all([
      querySnowflake(
        `SELECT ${SUMMARY_COLS}, r.notes, r.specialists_consulted, r.tools_used, c.user_question, c.judge_focus, c.expected_specialists, c.expected_tools
           FROM ORACLE_X.EVAL.EVAL_RUNS r LEFT JOIN ORACLE_X.EVAL.EVAL_CASES c ON c.case_id = r.case_id WHERE r.eval_run_id = ?`,
        { binds: [evalRunId] },
      ),
      querySnowflake(
        `SELECT criterion, method, passed, score, detail, evaluated_at FROM ORACLE_X.EVAL.EVAL_RESULTS WHERE eval_run_id = ? ORDER BY method, criterion`,
        { binds: [evalRunId] },
      ),
    ])
    const r = runs[0]
    if (!r) return null
    return {
      ...summary(r),
      notes: str(r.NOTES),
      specialistsConsulted: arr(r.SPECIALISTS_CONSULTED),
      toolsUsed: arr(r.TOOLS_USED),
      userQuestion: str(r.USER_QUESTION),
      judgeFocus: str(r.JUDGE_FOCUS),
      expectedSpecialists: arr(r.EXPECTED_SPECIALISTS),
      expectedTools: arr(r.EXPECTED_TOOLS),
      results: results.map((x) => ({
        criterion: String(x.CRITERION),
        method: str(x.METHOD),
        passed: x.PASSED == null ? null : Boolean(x.PASSED),
        score: num(x.SCORE),
        detail: str(x.DETAIL),
        evaluatedAt: toIso(x.EVALUATED_AT),
      })),
    }
  })
}
