// @vitest-environment jsdom
import fs from "fs"
import path from "path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, within } from "@testing-library/react"

vi.mock("server-only", () => ({}))

import { EvalRunList, EvalRunView, overallVerdict } from "../../components/eval/eval-views"
import { stageStatus, checkStatus, type EvalRunDetail, type ToolCall, type Trace } from "../../lib/trace-types"

afterEach(cleanup)

describe("status mapping (backend values only)", () => {
  it("transcript status → stage status; empty means not run unless the council is still running", () => {
    expect(stageStatus("OK", "COMPLETED")).toBe("COMPLETED")
    expect(stageStatus("error", "COMPLETED")).toBe("FAILED")
    expect(stageStatus(null, "RUNNING")).toBe("WORKING")
    expect(stageStatus(null, "COMPLETED")).toBe("NOT_RUN")
  })
  it("checks and overall verdicts are never guessed", () => {
    expect(checkStatus(true)).toBe("PASS")
    expect(checkStatus(false)).toBe("FAIL")
    expect(checkStatus(null)).toBe("UNKNOWN")
    expect(overallVerdict("PASS")).toBe("PASS")
    expect(overallVerdict("FAIL")).toBe("FAIL")
    expect(overallVerdict("PARTIAL")).toBe("WARNING")
    expect(overallVerdict(null)).toBe("UNKNOWN")
  })
})

const brief = (c: string[], x: string[] = []) => ({ conclusions: c, supporting: ["sup (test)"], contradictions: x, missing: ["gap (test)"], sources: ["RAW.T:1"] })
const TRACE: Trace = {
  runId: "RUN-T", entityId: "X001", entityName: "Test Co", question: "Question (test)?", mode: "PHASED_ASYNC", status: "COMPLETED", phase: "DONE",
  startedAt: "2026-01-01T00:00:00Z", phase1DoneAt: "2026-01-01T00:03:00Z", complianceDoneAt: "2026-01-01T00:05:00Z", skepticDoneAt: "2026-01-01T00:06:00Z", finishedAt: "2026-01-01T00:07:00Z",
  totalSeconds: 420, specialistsOk: 5, specialistsFailed: 0, finalResponse: "## 1. COUNCIL RUN\nx\n## 8. FINAL EVIDENCE-GROUNDED FINDING\nFinding text (test).\n## 9. SOURCES\n- **FACT:** a",
  stages: ["SKEPTIC", "INVESTIGATOR", "RISK_ANALYST", "SCENARIO", "COMPLIANCE"].map((role, i) => ({
    role, status: "COMPLETED" as const, backendStatus: "OK", startedAt: null, durationSeconds: 60 + i, offsetSeconds: i * 30, tools: role === "INVESTIGATOR" ? ["get_evidence", "get_bounded_graph"] : [],
    inputTokens: 10, outputTokens: 5, brief: brief([`${role} conclusion (test)`], role === "SKEPTIC" ? ["Challenge A (test)"] : []), calls: [],
  })),
  orchestratorCalls: [], toolCallsAvailable: false,
}
const CALLS: ToolCall[] = [
  { role: "INVESTIGATOR", seq: 1, name: "get_evidence", type: "generic", outcome: "SUCCESS", errorCode: null, graphHopsRequested: null, graphPathsRequested: null, graphPathsReturned: null },
  { role: "INVESTIGATOR", seq: 2, name: "get_bounded_graph", type: "generic", outcome: "GUARDRAIL_REJECTION", errorCode: "ORACLE_X_TOOL_REJECTED", graphHopsRequested: 15, graphPathsRequested: 100000, graphPathsReturned: 200 },
  { role: "INVESTIGATOR", seq: 3, name: "x", type: null, outcome: "TOOL_FAILURE", errorCode: "E1", graphHopsRequested: null, graphPathsRequested: null, graphPathsReturned: null },
]

describe("agent trace", () => {
  it("shows the full flow in order with specialist summaries, Skeptic challenges and the final finding", async () => {
    const { TraceFlow } = await import("../../components/trace/trace-view")
    await act(async () => {
      render(<TraceFlow t={TRACE} calls={Promise.resolve(CALLS)} />)
    })
    const ids = [...screen.getByTestId("trace-flow").querySelectorAll("li[data-testid^=flow-]")].map((e) => e.getAttribute("data-testid"))
    expect(ids).toEqual(["flow-question", "flow-orchestrator", "flow-plan", "flow-tools", "flow-INVESTIGATOR", "flow-RISK_ANALYST", "flow-COMPLIANCE", "flow-SKEPTIC", "flow-SCENARIO", "flow-synthesis", "flow-finding"])
    expect(screen.getByTestId("flow-question").textContent).toContain("Question (test)?")
    expect(screen.getByTestId("flow-INVESTIGATOR").textContent).toContain("INVESTIGATOR conclusion (test)")
    expect(within(screen.getByTestId("flow-SKEPTIC")).getByTestId("skeptic-challenges").textContent).toContain("Challenge A (test)")
    expect(screen.getByTestId("flow-finding").textContent).toContain("Finding text (test).")
  })
  it("separates guardrail blocks from failures", async () => {
    const { TraceFlow } = await import("../../components/trace/trace-view")
    await act(async () => {
      render(<TraceFlow t={TRACE} calls={Promise.resolve(CALLS)} />)
    })
    expect(screen.getByTestId("call-summary").textContent).toMatch(/3 tool calls:.*1 succeeded.*1 guardrail blocks \(intentional\).*1 failures/)
    const inv = screen.getByTestId("calls-INVESTIGATOR").textContent!
    expect(inv).toMatch(/Guardrail block \(intentional\).*get_bounded_graph.*15 hops \/ 100000 paths requested, 200 returned/)
    expect(screen.getByTestId("flow-INVESTIGATOR").querySelector(".ml-auto")!.textContent).toMatch(/Completed/)
  })
  it("tool-call outage only blanks that part", async () => {
    const { TraceFlow } = await import("../../components/trace/trace-view")
    await act(async () => {
      render(<TraceFlow t={TRACE} calls={Promise.resolve(null)} />)
    })
    expect(screen.getByTestId("flow-tools").textContent).toMatch(/unavailable/)
    expect(screen.getByTestId("flow-INVESTIGATOR").textContent).toContain("INVESTIGATOR conclusion (test)")
  })
  it("timeline uses real offsets and phase timestamps", async () => {
    const { TraceTimeline } = await import("../../components/trace/trace-view")
    render(<TraceTimeline t={TRACE} />)
    const t = screen.getByTestId("trace-timeline").textContent!
    expect(t).toMatch(/Data gathering & analysis done: 3 min 0s/)
    expect(t).toMatch(/Skeptic challenge done: 6 min 0s/)
    expect(t).toMatch(/Total: 7 min 0s/)
    expect(screen.getByTestId("bar-SYNTHESIS").textContent).toMatch(/60s/)
  })
})

const EV: EvalRunDetail = {
  evalRunId: "EVAL-T", caseId: "A", situation: "Full council (test)", entityId: "X001", councilRunId: "RUN-T", evaluatedAt: "2026-01-01", totalSeconds: 420, criteriaTotal: 3, criteriaPassed: 2,
  overallStatus: "FAIL", judgeModel: "judge-model", judgeScores: { correctness: 5, grounding: 4 }, notes: "n", specialistsConsulted: ["INVESTIGATOR"], toolsUsed: [], userQuestion: "Q?",
  judgeFocus: null, expectedSpecialists: [], expectedTools: [],
  results: [
    { criterion: "SPEC:SKEPTIC", method: "DETERMINISTIC", passed: true, score: null, detail: "All 5 consulted", evaluatedAt: null },
    { criterion: "FORBIDDEN:M044 is (fraudulent|guilty)", method: "DETERMINISTIC", passed: false, score: null, detail: "Found 'fraudulent'", evaluatedAt: null },
    { criterion: "JUDGE:GROUNDING", method: "LLM_JUDGE", passed: true, score: 4, detail: "Grounded", evaluatedAt: null },
  ],
}

describe("criterion labels", () => {
  it("translate stored keys without changing their meaning", async () => {
    const { criterionLabel } = await import("../../lib/trace-types")
    expect(criterionLabel("SPEC:RISK_ANALYST")).toBe("Specialist consulted: risk analyst")
    expect(criterionLabel("TOOL:policy_search|compliance_evidence_search")).toBe("Tool used: policy search or compliance evidence search")
    expect(criterionLabel("FACT:805,?229")).toBe("Required fact stated: 805,229")
    expect(criterionLabel("FORBIDDEN:M044 is (fraudulent|guilty)")).toBe("Forbidden claim not made")
    expect(criterionLabel("REQUIRED:(?i)^[ #*]*1[.):]")).toBe("Required report element present")
    expect(criterionLabel("REQUIRED:MODEL OUTPUT")).toBe("Required content: MODEL OUTPUT")
    expect(criterionLabel("GRAPH_BOUNDS")).toBe("Graph limits respected")
  })
})

describe("evaluation", () => {
  it("list shows backend counts and judge scores, never a percentage", () => {
    render(<EvalRunList runs={[EV]} />)
    expect(screen.getByTestId("counts-EVAL-T").textContent).toBe("2 of 3 checks passed")
    expect(screen.getByTestId("judge-scores").textContent).toMatch(/Correctness: 5.*Grounding: 4/)
    expect(document.body.textContent).not.toMatch(/\d+%/)
  })
  it("detail groups rule-based and AI judge checks, failures first, with technical details", () => {
    render(<EvalRunView r={{ ...EV, judgeScores: { correctness: 5, rationale: "**Why** (test)" } }} />)
    expect(screen.getByTestId("eval-attention").textContent).toMatch(/Forbidden claim not made.*Found 'fraudulent'/)
    expect(screen.getByTestId("method-DETERMINISTIC").textContent).toMatch(/Rule-based checks\s*1 of 2 passed/)
    expect(screen.getByTestId("method-LLM_JUDGE").textContent).toMatch(/AI judge evaluation\s*1 of 1 passed/)
    expect(screen.getByTestId("check-JUDGE:GROUNDING").textContent).toMatch(/PASS.*AI judge: grounding.*score 4/)
    const f = within(screen.getByTestId("method-DETERMINISTIC")).getByTestId("check-FORBIDDEN:M044 is (fraudulent|guilty)")
    expect(f.querySelector("[data-verdict]")!.getAttribute("data-verdict")).toBe("FAIL")
    expect(f.textContent).toContain("FORBIDDEN:M044 is (fraudulent|guilty)")
    expect(screen.getByTestId("judge-scores").textContent).toBe("Correctness: 5")
    expect(screen.getByTestId("judge-rationale").textContent).toContain("Why (test)")
  })
  it("all-pass message only when every stored check passed", () => {
    render(<EvalRunView r={{ ...EV, results: EV.results.filter((r) => r.passed) }} />)
    expect(screen.getByTestId("eval-all-pass")).toBeTruthy()
  })
  it("stored text is rendered as text", () => {
    render(<EvalRunView r={{ ...EV, results: [{ ...EV.results[0], detail: "<img src=x onerror=alert(1)>" }] }} />)
    expect(document.querySelector("img")).toBeNull()
  })
})

describe("source scans", () => {
  const ROOT = path.resolve(__dirname, "../..")
  const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8")
  const files = ["lib/server/trace.ts", "lib/server/evaluation.ts", "components/trace/trace-view.tsx", "components/eval/eval-views.tsx", "app/agent-trace/page.tsx", "app/evaluation/page.tsx", "app/evaluation/[runId]/page.tsx", "app/api/agent-trace/route.ts", "app/api/evaluation/route.ts", "app/api/evaluation/[runId]/route.ts", "app/page.tsx"]
  it("never calls the council or evaluator and never selects SQL text / inputs / raw responses", () => {
    for (const f of files) {
      const src = read(f)
      expect(src, f).not.toMatch(/SP_RUN_COUNCIL|SP_EVALUATE_RUN|startCouncil|\bCALL\s+ORACLE_X/)
      expect(src, f).not.toMatch(/sql_executed|tool_input|result_preview|raw_response|orchestrator_raw/i)
    }
  })
  it("no hardcoded M044 run ids or evaluation figures", () => {
    for (const f of files) expect(read(f), f).not.toMatch(/UI-M044-|41\/41|41 of 41|M73B?-|M7[12]-/)
  })
  it("investigation page links to Agent Trace and Evaluation", () => {
    const inv = read("app/investigations/[entityId]/page.tsx")
    expect(inv).toContain("View Agent Trace")
    expect(inv).toContain("View Evaluation")
  })
})
