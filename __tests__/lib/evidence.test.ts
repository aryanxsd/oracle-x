import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/snowflake", () => ({ querySnowflake: vi.fn() }))

import { querySnowflake } from "../../lib/snowflake"
import { _clearCache } from "../../lib/server/cache"
import { ClaimNotFound, getClaimDetail, getEvidenceOverview } from "../../lib/server/evidence"
import { GET } from "../../app/api/evidence/route"

const q = vi.mocked(querySnowflake)
beforeEach(() => {
  q.mockReset()
  _clearCache()
})

const CLAIMS = [
  { CLAIM_ID: "SIG-M044-01", EVIDENCE_ORIGIN: "SEEDED_SIGNAL", SIGNAL_TYPE: "TRANSACTION_ANOMALY", RISK_CLAIM: "Near-threshold", SUPPORTING_EVIDENCE: "RAW.TRANSACTIONS:T1", CONTRADICTING_EVIDENCE: "RAW.ANALYST_NOTES:N1", MISSING_EVIDENCE: "Source of funds" },
  { CLAIM_ID: "M044@2026-10-02:VELOCITY_ANOMALY", EVIDENCE_ORIGIN: "ENGINE_DIMENSION", SIGNAL_TYPE: "VELOCITY_ANOMALY", RISK_CLAIM: "Engine velocity" },
]
const BAL = { SUPPORTING_COUNT: 14, CONTRADICTING_COUNT: 18, NEUTRAL_COUNT: 2, MISSING_EVIDENCE_COUNT: 8, SUPPORTING_WEIGHT: 5.8, CONTRADICTING_WEIGHT: 7.4, NET_EVIDENCE_POSITION: -0.122, EVIDENCE_POSTURE: "CONTESTED", UNCERTAINTY_LEVEL: "HIGH" }

function fake(opts: { identity?: boolean; claims?: Record<string, unknown>[]; balance?: Record<string, unknown> | null; tool?: unknown; fail?: RegExp } = {}) {
  q.mockImplementation(async (sql: string): Promise<Record<string, any>[]> => {
    if (opts.fail?.test(sql)) throw new Error("SQL compilation error near ORACLE_X.INTEL secret")
    if (sql.includes("CORE.ENTITY_NODES")) return opts.identity === false ? [] : [{ NODE_ID: "M044", ENTITY_TYPE: "MERCHANT", DISPLAY_NAME: "x", ATTRIBUTES: {} }]
    if (sql.includes("EVIDENCE_SUMMARY_SNAPSHOT")) return opts.claims ?? CLAIMS
    if (sql.includes("V_EVIDENCE_BALANCE")) return opts.balance === null ? [] : [opts.balance ?? BAL]
    if (sql.includes("RISK_SIGNALS")) return [{ SIGNAL_ID: "SIG-M044-01", SIGNAL_STATUS: "ACTIVE", SEVERITY: "HIGH", SCORE: 85 }]
    if (sql.includes("TOOL_GET_EVIDENCE"))
      return [{ R: opts.tool ?? { status: "OK", source: "INTEL.EVIDENCE_CHAIN_SNAPSHOT", provenance: "p", claims: [
        { claim_id: "SIG-M044-01", source_table: "RAW.TRANSACTIONS", source_record_id: "T1" },
        { claim_id: "SIG-M044-09", source_table: "RAW.WIRE_TRANSFERS", source_record_id: "W9" },
      ] } }]
    throw new Error("unexpected " + sql)
  })
}
const call = (qs: string) => GET(new Request(`http://x/api/evidence?${qs}`))

describe("evidence layer", () => {
  it("returns backend balance and claims, with signal status joined from RISK_SIGNALS", async () => {
    fake()
    const o = await getEvidenceOverview("M044")
    expect(o.balance).toMatchObject({ supporting: 14, contradicting: 18, missing: 8, posture: "CONTESTED", uncertainty: "HIGH" })
    expect(o.claims[0]).toMatchObject({ claimId: "SIG-M044-01", status: "ACTIVE", severity: "HIGH", score: 85, contradicting: "RAW.ANALYST_NOTES:N1", missing: "Source of funds" })
    expect(o.claims[1].status).toBeNull()
    for (const [, opt] of q.mock.calls) expect(opt?.binds).toEqual(["M044"])
  })

  it("claim detail calls the backend tool with the claim's own signal type and keeps only that claim", async () => {
    fake()
    const d = await getClaimDetail("M044", "SIG-M044-01")
    const call = q.mock.calls.find(([s]) => s.includes("TOOL_GET_EVIDENCE"))!
    expect(call[0]).toBe("CALL ORACLE_X.AGENTS.TOOL_GET_EVIDENCE(?, 'DETAIL', ?, 100)")
    expect(call[1]?.binds).toEqual(["M044", "TRANSACTION_ANOMALY"])
    expect(d.records).toEqual([{ sourceTable: "RAW.TRANSACTIONS", sourceRecordId: "T1", supporting: null, counter: null, missing: null }])
  })

  it("rejects claims that do not belong to the entity without calling the tool", async () => {
    fake()
    await expect(getClaimDetail("M044", "SIG-M999-01")).rejects.toBeInstanceOf(ClaimNotFound)
    expect(q.mock.calls.some(([s]) => s.includes("TOOL_GET_EVIDENCE"))).toBe(false)
  })

  it("treats a REJECTED tool response as an error", async () => {
    fake({ tool: { status: "REJECTED", reason: "x" } })
    await expect(getClaimDetail("M044", "SIG-M044-01")).rejects.toThrow()
  })
})

describe("/api/evidence", () => {
  it("validates entity and claim before touching Snowflake", async () => {
    expect((await call("")).status).toBe(400)
    expect((await call("entity=%27or1")).status).toBe(400)
    expect((await call("entity=M044&claim=%27%3B%20drop")).status).toBe(400)
    expect(q).not.toHaveBeenCalled()
  })
  it("404 for unknown entity and unknown claim", async () => {
    fake({ identity: false })
    expect((await call("entity=M999")).status).toBe(404)
    fake()
    expect((await call("entity=M044&claim=SIG-X-1")).status).toBe(404)
  })
  it("summary returns backend balance values", async () => {
    fake()
    const j = await (await call("entity=M044")).json()
    expect(j.balance.supporting).toBe(14)
    expect(j.claims).toHaveLength(2)
  })
  it("empty evidence is returned as empty, not invented", async () => {
    fake({ claims: [], balance: null })
    const j = await (await call("entity=M044")).json()
    expect(j).toMatchObject({ claims: [], balance: null })
  })
  it("API failures are sanitized", async () => {
    fake({ fail: /EVIDENCE_SUMMARY_SNAPSHOT/ })
    const r = await call("entity=M044")
    expect(r.status).toBe(500)
    expect(await r.text()).not.toMatch(/ORACLE_X|compilation|secret|SELECT/i)
  })
})
