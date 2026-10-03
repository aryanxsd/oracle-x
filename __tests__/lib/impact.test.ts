import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/snowflake", () => ({ querySnowflake: vi.fn() }))

import { querySnowflake } from "../../lib/snowflake"
import { _clearCache } from "../../lib/server/cache"
import { _resetScenarioRuns, getBlastRadius, getLatestScenarios, runScenarios, ScenarioRejected } from "../../lib/server/impact"
import { GET as blastGET } from "../../app/api/blast-radius/route"
import { GET as scnGET, POST as scnPOST } from "../../app/api/scenarios/route"

const q = vi.mocked(querySnowflake)
beforeEach(() => {
  q.mockReset()
  _clearCache()
  _resetScenarioRuns()
})

const BLAST = [
  { RECORD_KIND: "SUMMARY_METRIC", COMPUTED_AT: "2026-10-03T02:15:08Z", MAX_DEPTH: 2, MODEL_VERSION: "v-test", WINDOW_START: "2026-09-03", WINDOW_END: "2026-10-03", METHODOLOGY: "count x", METRIC_NAME: "customers_affected", METRIC_VALUE: "11" },
  { RECORD_KIND: "SUMMARY_METRIC", COMPUTED_AT: "2026-10-03T02:15:08Z", METRIC_NAME: "risk_exposure", METRIC_VALUE: 123.45, METHODOLOGY: "sum y" },
  { RECORD_KIND: "IMPACTED_ENTITY", COMPUTED_AT: "2026-10-03T02:15:12Z", METHODOLOGY: "within 2 hops", IMPACTED_ENTITY_ID: "D1", IMPACTED_ENTITY_TYPE: "DEVICE", HOP_DISTANCE: 1, PATH: "X -[R]-> D1", EXPOSURE_USD: 50, IMPACT_SCORE: 100, DISPLAY_NAME: "Dev" },
  { RECORD_KIND: "IMPACTED_ENTITY", COMPUTED_AT: "2026-10-03T02:15:12Z", IMPACTED_ENTITY_ID: "C1", IMPACTED_ENTITY_TYPE: "CUSTOMER", HOP_DISTANCE: 2, PATH: null, EXPOSURE_USD: null, IMPACT_SCORE: 35 },
]
const runRow = (name: string, metrics: Record<string, unknown>) => ({
  SCENARIO_RUN_ID: `RUN-1-${name}`, SCENARIO_NAME: name, RUN_AT: "2026-10-03T08:46:00Z", RUN_BY: "tool", BASELINE_RISK_SCORE: 60, SIMULATED_RISK_SCORE: 60, DELTA: 0, NARRATIVE: `${name} narrative`,
  IMPACTED_SIGNALS: JSON.stringify(metrics), PARAMETERS: JSON.stringify({ assumptions: "Assume run-rate persists (test).", horizon_days: 30, window_start: "2026-09-03", window_end: "2026-10-03" }),
})
const RUNS = [runRow("BLOCK", { amount_at_risk_prevented_usd: 7, legitimate_customers_disrupted: 3 }), runRow("DO_NOTHING", { amount_at_risk_next_30d_usd: 7 }), runRow("MONITOR", { evidence_gaps_addressed: 2 })]

function fake(o: { identity?: boolean; blast?: unknown[]; runs?: unknown[]; tool?: unknown; fail?: RegExp } = {}) {
  q.mockImplementation(async (sql: string): Promise<Record<string, any>[]> => {
    if (o.fail?.test(sql)) throw new Error("SQL compilation error ORACLE_X.CASES secret")
    if (sql.includes("BLAST_RADIUS_CACHE")) return (o.blast ?? BLAST) as Record<string, any>[]
    if (sql.includes("CORE.ENTITY_NODES")) return o.identity === false ? [] : [{ NODE_ID: "M044", ENTITY_TYPE: "MERCHANT", DISPLAY_NAME: "x", ATTRIBUTES: {} }]
    if (sql.includes("SCENARIO_RUNS")) return (o.runs ?? RUNS) as Record<string, any>[]
    if (sql.includes("TOOL_RUN_SCENARIOS")) return [{ R: o.tool ?? { status: "OK", run_id: "RUN-2", assumptions: "fresh", provenance: "SCENARIO OUTPUT (test)", baseline: { card_volume_30d_usd: 99 } } }]
    throw new Error("unexpected " + sql)
  })
}

describe("blast radius", () => {
  it("maps backend metrics and entities verbatim, latest computation per record kind", async () => {
    fake()
    const b = (await getBlastRadius("M044"))!
    expect(q.mock.calls[0][1]?.binds).toEqual(["M044"])
    expect(q.mock.calls[0][0]).toMatch(/QUALIFY b\.computed_at = MAX\(b\.computed_at\) OVER \(PARTITION BY b\.record_kind\)/)
    expect(b.metrics).toEqual([{ name: "customers_affected", value: 11, methodology: "count x" }, { name: "risk_exposure", value: 123.45, methodology: "sum y" }])
    expect(b.entities.map((e) => [e.id, e.hop, e.exposureUsd, e.impactScore])).toEqual([["D1", 1, 50, 100], ["C1", 2, null, 35]])
    expect(b.entityMethodology).toBe("within 2 hops")
    expect(b.modelVersion).toBe("v-test")
  })
  it("returns null when nothing has been computed", async () => {
    fake({ blast: [] })
    expect(await getBlastRadius("M044")).toBeNull()
  })
})

describe("scenarios", () => {
  it("reads only the latest stored run, with assumptions separated from outputs", async () => {
    fake()
    const s = (await getLatestScenarios("M044"))!
    expect(q.mock.calls[0][0]).toMatch(/QUALIFY run_at = MAX\(run_at\) OVER \(\)/)
    expect(q.mock.calls[0][0]).not.toMatch(/TOOL_RUN_SCENARIOS/)
    expect(s.runId).toBe("RUN-1")
    expect(s.assumptions).toBe("Assume run-rate persists (test).")
    expect(s.horizonDays).toBe(30)
    expect(s.baseline).toBeNull()
    expect(s.scenarios.map((x) => x.name).sort()).toEqual(["BLOCK", "DO_NOTHING", "MONITOR"])
    expect(s.scenarios.find((x) => x.name === "BLOCK")!.metrics).toEqual({ amount_at_risk_prevented_usd: 7, legitimate_customers_disrupted: 3 })
  })
  it("no stored run → null", async () => {
    fake({ runs: [] })
    expect(await getLatestScenarios("M044")).toBeNull()
  })
  it("re-run calls the backend tool once for concurrent requests and returns its baseline", async () => {
    fake()
    const [a, b] = await Promise.all([runScenarios("M044"), runScenarios("M044")])
    expect(q.mock.calls.filter(([s]) => s.includes("TOOL_RUN_SCENARIOS"))).toHaveLength(1)
    const call = q.mock.calls.find(([s]) => s.includes("TOOL_RUN_SCENARIOS"))!
    expect(call[1]?.binds).toEqual(["M044", ""])
    expect(a).toBe(b)
    expect(a.runId).toBe("RUN-2")
    expect(a.baseline).toEqual({ card_volume_30d_usd: 99 })
    expect(a.provenance).toBe("SCENARIO OUTPUT (test)")
  })
  it("REJECTED from the tool becomes a 400-class error", async () => {
    fake({ tool: { status: "REJECTED", reason: "Scenarios are only available for scored merchants" } })
    await expect(runScenarios("C00001")).rejects.toBeInstanceOf(ScenarioRejected)
  })
})

describe("routes", () => {
  const get = (h: typeof blastGET, qs: string) => h(new Request(`http://x/api?${qs}`))
  const post = (body: unknown) => scnPOST(new Request("http://x/api/scenarios", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }))
  it("validate input before Snowflake", async () => {
    expect((await get(blastGET, "")).status).toBe(400)
    expect((await get(blastGET, "entity=%27or1")).status).toBe(400)
    expect((await get(scnGET, "entity=M044;drop")).status).toBe(400)
    expect((await post({ entityId: 42 })).status).toBe(400)
    expect((await post("not json")).status).toBe(400)
    expect(q).not.toHaveBeenCalled()
  })
  it("unknown entity → 404 and no tool call", async () => {
    fake({ identity: false })
    expect((await get(blastGET, "entity=M999")).status).toBe(404)
    expect((await get(scnGET, "entity=M999")).status).toBe(404)
    expect((await post({ entityId: "M999" })).status).toBe(404)
    expect(q.mock.calls.some(([s]) => s.includes("TOOL_RUN_SCENARIOS"))).toBe(false)
  })
  it("empty states return null rather than invented values", async () => {
    fake({ blast: [], runs: [] })
    expect((await (await get(blastGET, "entity=M044")).json()).blastRadius).toBeNull()
    expect((await (await get(scnGET, "entity=M044")).json()).scenarios).toBeNull()
  })
  it("GET never runs the scenario tool", async () => {
    fake()
    await get(scnGET, "entity=M044")
    expect(q.mock.calls.some(([s]) => s.includes("TOOL_RUN_SCENARIOS"))).toBe(false)
  })
  it("Snowflake errors are sanitized", async () => {
    fake({ fail: /BLAST_RADIUS_CACHE|SCENARIO_RUNS|TOOL_RUN/ })
    for (const r of [await get(blastGET, "entity=M044"), await get(scnGET, "entity=M044"), await post({ entityId: "M044" })]) {
      expect(r.status).toBe(500)
      expect(await r.text()).not.toMatch(/ORACLE_X|compilation|secret|SELECT|CALL/i)
    }
  })
  it("tool rejection → 400 with the backend reason", async () => {
    fake({ tool: { status: "REJECTED", reason: "Scenarios are only available for scored merchants" } })
    const r = await post({ entityId: "M044" })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/scored merchants/)
  })
})
