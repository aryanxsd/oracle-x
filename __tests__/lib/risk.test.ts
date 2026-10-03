import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/snowflake", () => ({ querySnowflake: vi.fn() }))

import { querySnowflake } from "../../lib/snowflake"
import { _clearCache } from "../../lib/server/cache"
import { DIMENSIONS } from "../../lib/server/investigation"
import { getBandConfig, getRiskCached } from "../../lib/server/risk"
import { GET } from "../../app/api/risk/route"

const q = vi.mocked(querySnowflake)
beforeEach(() => {
  q.mockReset()
  _clearCache()
})

const BANDS = [
  { BAND: "NORMAL", LOWER_BOUND: 0, UPPER_BOUND: 25, ACTION: "a0" },
  { BAND: "WATCH", LOWER_BOUND: 25, UPPER_BOUND: 50, ACTION: "a1" },
  { BAND: "ELEVATED", LOWER_BOUND: 50, UPPER_BOUND: 75, ACTION: "a2" },
  { BAND: "CRITICAL", LOWER_BOUND: 75, UPPER_BOUND: 1000, ACTION: "a3" },
]

/** Route SQL to fixture rows by object name, so Promise.all order does not matter. */
function fake(opts: { identity?: boolean; risk?: Record<string, unknown> | null; timeline?: Record<string, unknown>[]; fail?: RegExp } = {}) {
  q.mockImplementation(async (sql: string) => {
    if (opts.fail?.test(sql)) throw new Error("SQL compilation error: secret detail ORACLE_X.INTEL.X")
    if (sql.includes("CORE.ENTITY_NODES")) return opts.identity === false ? [] : [{ NODE_ID: "M044", ENTITY_TYPE: "MERCHANT", DISPLAY_NAME: "x", ATTRIBUTES: {} }]
    if (sql.includes("V_RISK_BAND_CONFIG")) return BANDS
    if (sql.includes("V_RISK_MODEL_CONFIG")) return []
    if (sql.includes("V_ENTITY_RISK_INTELLIGENCE")) return opts.risk ? [opts.risk] : []
    if (sql.includes("V_ENTITY_RISK_TIMELINE")) return opts.timeline ?? []
    if (sql.includes("EARLY_WARNING_EVENTS")) return []
    throw new Error("unexpected " + sql)
  })
}
const call = (qs: string) => GET(new Request(`http://x/api/risk?${qs}`))

describe("v1/v2 column semantics", () => {
  it("only historical, account behaviour and network have *_SCORE_DEDUP columns", () => {
    expect(DIMENSIONS.filter((d) => d.dedup).map((d) => d.dedup)).toEqual(["HISTORICAL_SCORE_DEDUP", "ACCOUNT_BEHAVIOR_SCORE_DEDUP", "NETWORK_SCORE_DEDUP"])
    expect(DIMENSIONS.filter((d) => !d.dedup)).toHaveLength(5)
  })
})

describe("getBandConfig", () => {
  it("returns backend thresholds and actions ordered by lower bound", async () => {
    fake()
    const b = await getBandConfig()
    expect(b.map((x) => [x.band, x.lower, x.upper, x.action])).toEqual(BANDS.map((x) => [x.BAND, x.LOWER_BOUND, x.UPPER_BOUND, x.ACTION]))
    expect(q.mock.calls[0][0]).toMatch(/ORDER BY lower_bound/i)
  })
})

describe("read-through cache", () => {
  it("reuses a result instead of re-querying the slow view", async () => {
    fake({ risk: { OVERALL_SCORE: 66.68, RISK_BAND: "ELEVATED" } })
    await getRiskCached("M044")
    const n = q.mock.calls.length
    await getRiskCached("M044")
    expect(q.mock.calls.length).toBe(n)
  })
  it("does not cache failures", async () => {
    fake({ fail: /V_ENTITY_RISK_INTELLIGENCE/ })
    await expect(getRiskCached("M044")).rejects.toThrow()
    fake({ risk: { OVERALL_SCORE: 1, RISK_BAND: "NORMAL" } })
    expect((await getRiskCached("M044"))?.overall).toBe(1)
  })
})

describe("/api/risk", () => {
  it("validates input before touching Snowflake", async () => {
    expect((await call("")).status).toBe(400)
    expect((await call("entity=%27or1")).status).toBe(400)
    expect((await call("entity=M044&part=sql")).status).toBe(400)
    expect(q).not.toHaveBeenCalled()
  })
  it("404 for an unknown entity", async () => {
    fake({ identity: false })
    expect((await call("entity=M999")).status).toBe(404)
  })
  it("summary returns backend score and band config with bound parameters", async () => {
    fake({ risk: { OVERALL_SCORE: 66.68, RISK_BAND: "ELEVATED", OVERALL_SCORE_DEDUP: 55.56, RISK_BAND_DEDUP: "ELEVATED" } })
    const r = await call("entity=m044")
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.risk.overall).toBe(66.68)
    expect(j.risk.overallDedup).toBe(55.56)
    expect(j.bands).toHaveLength(4)
    for (const [sql, o] of q.mock.calls) if (/WHERE/.test(sql)) expect(o?.binds).toEqual(["M044"])
  })
  it("empty timeline returns null rather than invented history", async () => {
    fake({ timeline: [] })
    const j = await (await call("entity=M044&part=timeline")).json()
    expect(j.timeline).toBeNull()
    expect(j.events).toEqual([])
  })
  it("Snowflake errors are sanitized", async () => {
    fake({ fail: /V_ENTITY_RISK_TIMELINE/ })
    const r = await call("entity=M044&part=timeline")
    expect(r.status).toBe(500)
    const txt = await r.text()
    expect(txt).not.toMatch(/ORACLE_X|compilation|secret/i)
  })
})
