import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/snowflake", () => ({ querySnowflake: vi.fn() }))

import { querySnowflake } from "../../lib/snowflake"
import { _clearCache } from "../../lib/server/cache"
import { getToolCalls, getTrace, latestCompletedRun } from "../../lib/server/trace"
import { getEvalRun, listEvalRuns } from "../../lib/server/evaluation"
import { GET as traceGET } from "../../app/api/agent-trace/route"
import { GET as evalListGET } from "../../app/api/evaluation/route"
import { GET as evalGET } from "../../app/api/evaluation/[runId]/route"

const q = vi.mocked(querySnowflake)
beforeEach(() => {
  q.mockReset()
  _clearCache()
})

function fake(o: { identity?: boolean; run?: Record<string, unknown> | null; evalRun?: Record<string, unknown> | null; fail?: RegExp } = {}) {
  q.mockImplementation(async (sql: string): Promise<Record<string, any>[]> => {
    if (o.fail?.test(sql)) throw new Error("SQL compilation error ORACLE_X.EVAL secret")
    if (/\bCALL\b|INSERT|UPDATE|DELETE|MERGE|CREATE/i.test(sql)) throw new Error("write or procedure attempted: " + sql)
    if (sql.includes("V_AGENT_TOOL_CALLS"))
      return [{ AGENT_ROLE: "investigator", SEQ: 0, TOOL_NAME: "get_bounded_graph", TOOL_TYPE: "generic", OUTCOME_CLASS: "GUARDRAIL_REJECTION", TOOL_ERROR_CODE: "ORACLE_X_TOOL_REJECTED", GRAPH_HOPS_REQUESTED: 15, GRAPH_PATHS_REQUESTED: 1, GRAPH_PATHS_RETURNED: null }]
    if (sql.includes("COUNCIL_TRANSCRIPTS"))
      return [{ AGENT_ROLE: "skeptic", STATUS: "OK", STARTED_AT: "2026-01-01T00:05:00Z", DURATION_MS: 61000, TOOLS_USED: "get_evidence", INPUT_TOKENS: 1, OUTPUT_TOKENS: 2, ANSWER_TEXT: "=== COUNCIL BRIEF ===\nCONTRADICTIONS: c1\n=== END BRIEF ===\nRAW_SECRET_TEXT" }]
    if (sql.includes("COUNCIL_RUNS") && sql.includes("council_run_id = ?"))
      return o.run === null ? [] : [{ COUNCIL_RUN_ID: "RUN-1", ENTITY_ID: "X001", STATUS: "COMPLETED", EXECUTION_MODE: "PHASED_ASYNC", STARTED_AT: "2026-01-01T00:00:00Z", TOTAL_SECONDS: 400, FINAL_RESPONSE: "## 8. FINAL EVIDENCE-GROUNDED FINDING\nf", ...o.run }]
    if (sql.includes("COUNCIL_RUNS"))
      return [
        { COUNCIL_RUN_ID: "RUN-2", EXECUTION_MODE: "INTERACTIVE", STATUS: "COMPLETED", STARTED_AT: "2026-01-02" },
        { COUNCIL_RUN_ID: "RUN-1", EXECUTION_MODE: "PHASED_ASYNC", STATUS: "COMPLETED", STARTED_AT: "2026-01-01" },
      ]
    if (sql.includes("EVAL_RESULTS")) return [{ CRITERION: "c1", METHOD: "DETERMINISTIC", PASSED: true, SCORE: null, DETAIL: "ok" }]
    if (sql.includes("EVAL_RUNS") && sql.includes("eval_run_id = ?"))
      return o.evalRun === null ? [] : [{ EVAL_RUN_ID: "E-1", CASE_ID: "A", COUNCIL_RUN_ID: "RUN-1", CRITERIA_TOTAL: 1, CRITERIA_PASSED: 1, OVERALL_STATUS: "PASS", JUDGE_SCORES: '{"grounding":5}', SPECIALISTS_CONSULTED: '["SKEPTIC"]', ENTITY_ID: "X001" }]
    if (sql.includes("EVAL_RUNS")) return [{ EVAL_RUN_ID: "E-1", CASE_ID: "A", COUNCIL_RUN_ID: "RUN-1", CRITERIA_TOTAL: 1, CRITERIA_PASSED: 1, OVERALL_STATUS: "PASS", JUDGE_SCORES: { grounding: 5 } }]
    if (sql.includes("CORE.ENTITY_NODES")) return o.identity === false ? [] : [{ NODE_ID: "X001", ENTITY_TYPE: "MERCHANT", DISPLAY_NAME: "x", ATTRIBUTES: {} }]
    throw new Error("unexpected " + sql)
  })
}

describe("trace layer", () => {
  it("defaults to the latest completed full-council run", async () => {
    fake()
    expect(await latestCompletedRun("X001")).toBe("RUN-1")
  })
  it("reads the run and one brief per specialist, never raw answers", async () => {
    fake()
    const t = (await getTrace("RUN-1"))!
    expect(q.mock.calls.every(([, o]) => !o?.binds || o.binds[0] === "RUN-1")).toBe(true)
    expect(t.stages[0]).toMatchObject({ role: "SKEPTIC", status: "COMPLETED", durationSeconds: 61, offsetSeconds: 300 })
    expect(t.stages[0].brief?.contradictions).toEqual(["c1"])
    expect(JSON.stringify(t)).not.toContain("RAW_SECRET_TEXT")
    for (const [sql] of q.mock.calls) expect(sql).not.toMatch(/orchestrator_raw|raw_response/i)
  })
  it("tool calls select only names and outcome classes", async () => {
    fake()
    const c = await getToolCalls("RUN-1")
    const sql = q.mock.calls[0][0]
    expect(sql).not.toMatch(/sql_executed|tool_input|result_preview/i)
    expect(c[0]).toMatchObject({ role: "INVESTIGATOR", name: "get_bounded_graph", outcome: "GUARDRAIL_REJECTION", graphHopsRequested: 15 })
  })
})

describe("evaluation layer", () => {
  it("lists stored runs, optionally for one council run (bound)", async () => {
    fake()
    expect((await listEvalRuns())[0]).toMatchObject({ evalRunId: "E-1", criteriaPassed: 1, judgeScores: { grounding: 5 } })
    _clearCache()
    await listEvalRuns("RUN-1")
    expect(q.mock.calls.at(-1)?.[1]?.binds).toEqual(["RUN-1"])
  })
  it("detail parses stored arrays/objects and keeps check results verbatim", async () => {
    fake()
    const r = (await getEvalRun("E-1"))!
    expect(r.judgeScores).toEqual({ grounding: 5 })
    expect(r.specialistsConsulted).toEqual(["SKEPTIC"])
    expect(r.results).toEqual([{ criterion: "c1", method: "DETERMINISTIC", passed: true, score: null, detail: "ok", evaluatedAt: null }])
  })
})

describe("routes", () => {
  const trace = (qs: string) => traceGET(new Request(`http://x/api/agent-trace?${qs}`))
  const evalOne = (id: string) => evalGET(new Request(`http://x/api/evaluation/${id}`), { params: Promise.resolve({ runId: id }) })
  it("invalid input → 400 before Snowflake", async () => {
    expect((await trace("")).status).toBe(400)
    expect((await trace("entity=%27x")).status).toBe(400)
    expect((await trace("entity=X001&run=bad%20id")).status).toBe(400)
    expect((await trace("entity=X001&part=sql")).status).toBe(400)
    expect((await evalOne("bad id;")).status).toBe(400)
    expect((await evalListGET(new Request("http://x/api/evaluation?council=%27x"))).status).toBe(400)
    expect(q).not.toHaveBeenCalled()
  })
  it("unknown entity / run / evaluation → 404; a run of another entity is 404 too", async () => {
    fake({ identity: false })
    expect((await trace("entity=M999")).status).toBe(404)
    fake({ run: null, evalRun: null })
    expect((await trace("entity=X001&run=NO-RUN")).status).toBe(404)
    expect((await evalOne("NO-EVAL")).status).toBe(404)
    _clearCache()
    fake({ run: { ENTITY_ID: "OTHER" } })
    expect((await trace("entity=X001&run=RUN-1")).status).toBe(404)
  })
  it("returns trace, tool calls and evaluation", async () => {
    fake()
    expect((await (await trace("entity=X001")).json()).trace.runId).toBe("RUN-1")
    expect((await (await trace("entity=X001&run=RUN-1&part=tools")).json()).calls).toHaveLength(1)
    expect((await (await evalOne("E-1")).json()).results).toHaveLength(1)
  })
  it("Snowflake errors are sanitized", async () => {
    fake({ fail: /COUNCIL_RUNS|EVAL_RUNS/ })
    for (const r of [await trace("entity=X001&run=RUN-1"), await evalOne("E-1"), await evalListGET(new Request("http://x/api/evaluation"))]) {
      expect(r.status).toBe(500)
      expect(await r.text()).not.toMatch(/ORACLE_X|compilation|secret|SELECT/i)
    }
  })
})
