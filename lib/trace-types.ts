/**
 * Agent Trace + Evaluation shapes (types and pure helpers only). Everything comes from
 * CASES.COUNCIL_RUNS / COUNCIL_TRANSCRIPTS, EVAL.V_AGENT_TOOL_CALLS and EVAL.EVAL_RUNS / EVAL_RESULTS /
 * EVAL_CASES. Nothing here scores, judges or re-classifies — outcome classes and pass/fail are the
 * backend's.
 */
import type { Brief } from "@/lib/brief"

export type StageStatus = "COMPLETED" | "WORKING" | "FAILED" | "NOT_RUN"

export interface ToolCall {
  role: string
  seq: number
  name: string
  type: string | null
  /** Backend outcome class from EVAL.V_AGENT_TOOL_CALLS: SUCCESS | GUARDRAIL_REJECTION | TOOL_FAILURE. */
  outcome: string
  errorCode: string | null
  graphHopsRequested: number | null
  graphPathsRequested: number | null
  graphPathsReturned: number | null
}

export interface TraceStage {
  role: string
  status: StageStatus
  backendStatus: string | null
  startedAt: string | null
  durationSeconds: number | null
  /** Offset from the council start, for the timeline. */
  offsetSeconds: number | null
  tools: string[]
  inputTokens: number | null
  outputTokens: number | null
  brief: Brief | null
  calls: ToolCall[]
}

export interface Trace {
  runId: string
  entityId: string
  entityName: string | null
  question: string | null
  mode: string | null
  status: string
  phase: string | null
  startedAt: string | null
  phase1DoneAt: string | null
  complianceDoneAt: string | null
  skepticDoneAt: string | null
  finishedAt: string | null
  totalSeconds: number | null
  specialistsOk: number | null
  specialistsFailed: number | null
  finalResponse: string | null
  stages: TraceStage[]
  orchestratorCalls: ToolCall[]
  /** Whether per-call tool data could be read (it lives in a separate, slower view). */
  toolCallsAvailable: boolean
}

export interface TraceRunOption {
  runId: string
  mode: string | null
  status: string
  startedAt: string | null
}

export interface EvalRunSummary {
  evalRunId: string
  caseId: string | null
  situation: string | null
  entityId: string | null
  councilRunId: string | null
  evaluatedAt: string | null
  totalSeconds: number | null
  criteriaTotal: number | null
  criteriaPassed: number | null
  overallStatus: string | null
  judgeModel: string | null
  judgeScores: Record<string, unknown> | null
}

export interface EvalResult {
  criterion: string
  method: string | null
  passed: boolean | null
  score: number | null
  detail: string | null
  evaluatedAt: string | null
}

export interface EvalRunDetail extends EvalRunSummary {
  notes: string | null
  specialistsConsulted: string[]
  toolsUsed: string[]
  userQuestion: string | null
  judgeFocus: string | null
  expectedSpecialists: string[]
  expectedTools: string[]
  results: EvalResult[]
}

export const EVAL_RUN_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/

/**
 * Plain-language name for a stored criterion key (e.g. "SPEC:SKEPTIC", "FACT:66.68", "FORBIDDEN:<regex>").
 * The key itself is always shown verbatim under "View technical details".
 */
export function criterionLabel(c: string): string {
  const [kind, ...rest] = c.split(":")
  const v = rest.join(":")
  switch (kind) {
    case "SPEC":
      return `Specialist consulted: ${v.replace(/_/g, " ").toLowerCase()}`
    case "TOOL":
      return `Tool used: ${v.replace(/\|/g, " or ").replace(/_/g, " ")}`
    case "FACT":
      return `Required fact stated: ${v.replace(/\?/g, "")}`
    case "FORBIDDEN":
      return "Forbidden claim not made"
    case "REQUIRED":
      return /^[A-Za-z ]+$/.test(v) ? `Required content: ${v}` : "Required report element present"
    case "JUDGE":
      return `AI judge: ${v.replace(/_/g, " ").toLowerCase()}`
    case "GRAPH_BOUNDS":
      return "Graph limits respected"
    case "NO_TOOL_FAILURES":
      return "No tool failures"
    case "SKEPTIC_CONSULTED":
      return "Skeptic challenged the findings"
    default:
      return c.replace(/_/g, " ").toLowerCase().replace(/^./, (x) => x.toUpperCase())
  }
}

/** PASS / FAIL straight from the backend boolean; anything else is shown as "Not determined", never guessed. */
export function checkStatus(passed: boolean | null): "PASS" | "FAIL" | "UNKNOWN" {
  return passed === true ? "PASS" : passed === false ? "FAIL" : "UNKNOWN"
}

/** Map a transcript row's own status to a display state; a guardrail block inside a stage is not a failure. */
export function stageStatus(backendStatus: string | null, runStatus: string): StageStatus {
  const s = (backendStatus ?? "").toUpperCase()
  if (!s) return runStatus.toUpperCase() === "RUNNING" ? "WORKING" : "NOT_RUN"
  if (s === "ERROR" || s === "FAILED" || s === "FAILURE") return "FAILED"
  if (s === "RUNNING" || s === "STARTED" || s === "QUEUED") return "WORKING"
  return "COMPLETED"
}
