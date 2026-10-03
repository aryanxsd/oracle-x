import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/snowflake", () => ({ querySnowflake: vi.fn() }))

import { querySnowflake } from "../../lib/snowflake"
import { _clearCache } from "../../lib/server/cache"
import { getCaseCharacteristics, getRiskDna, getSimilarCases } from "../../lib/server/dna"
import { GET as dnaGET } from "../../app/api/risk-dna/route"
import { GET as simGET } from "../../app/api/similar-cases/route"

const q = vi.mocked(querySnowflake)
beforeEach(() => {
  q.mockReset()
  _clearCache()
})

const dnaRow = (id: string, asOf: string, src: string, caseId: string | null, v: number) => ({
  DNA_ID: id, ENTITY_ID: "X", AS_OF_DATE: asOf, DNA_SOURCE: src, RELATED_CASE_ID: caseId,
  TRANSACTION_DIMENSION: v, VELOCITY_DIMENSION: v, GEOGRAPHIC_DIMENSION: v, NETWORK_DIMENSION: v, MERCHANT_DIMENSION: v, HISTORICAL_DIMENSION: v, DOCUMENT_DIMENSION: null,
  SEASONALITY_CONTEXT: 0.5, RAW_FEATURES: JSON.stringify({ velocity: v }),
})

function fake(o: { identity?: boolean; scores?: Record<string, unknown>[]; dna?: Record<string, unknown>[]; fail?: RegExp } = {}) {
  q.mockImplementation(async (sql: string): Promise<Record<string, any>[]> => {
    if (o.fail?.test(sql)) throw new Error("SQL compilation error ORACLE_X.INTEL secret")
    if (sql.includes("INFORMATION_SCHEMA.VIEWS")) return [{ TABLE_NAME: "V_SIMILAR_CASE_SCORES", COMMENT: "Cosine (backend comment)" }]
    if (sql.includes("V_SIMILAR_CASE_SCORES"))
      return o.scores ?? [
        { CASE_ID: "CASE-A", HISTORICAL_ENTITY_ID: "M900", HISTORICAL_OUTCOME: "SAR_FILED", DNA_PROFILE_SIMILARITY: "0.8123", SIMILARITY_RANK: 1, INTERPRETATION_NOTE: "note", SUBJECT_AS_OF_DATE: "2026-01-10" },
        { CASE_ID: "CASE-B", HISTORICAL_ENTITY_ID: "C900", HISTORICAL_OUTCOME: "CLOSED_LEGITIMATE", DNA_PROFILE_SIMILARITY: 0.5, SIMILARITY_RANK: 2, INTERPRETATION_NOTE: "note", SUBJECT_AS_OF_DATE: "2026-01-10" },
      ]
    if (sql.includes("V_SIMILAR_INVESTIGATION_INPUT"))
      return [
        { ROW_ROLE: "QUERY_SUBJECT", ENTITY_ID: "M044", HAS_SHARED_DEVICE: true, USES_CORAL_BAY: false },
        { ROW_ROLE: "HISTORICAL_CASE", CASE_ID: "CASE-A", HAS_SHARED_DEVICE: true, USES_CORAL_BAY: true, SIGNAL_TYPES: "DEVICE_LINK" },
      ]
    if (sql.includes("V_RISK_DNA") && sql.includes("HISTORICAL_CASE_SNAPSHOT")) return [dnaRow("D-A", "2025-01-01", "HISTORICAL_CASE_SNAPSHOT", "CASE-A", 0.3)]
    if (sql.includes("V_RISK_DNA")) return o.dna ?? [dnaRow("D-2", "2026-01-10", "COMPUTED_FROM_RAW", null, 0.7), dnaRow("D-1", "2025-12-01", "COMPUTED_FROM_RAW", null, 0.1)]
    if (sql.includes("CASES.INVESTIGATIONS")) return [{ CASE_ID: "CASE-A", CLOSED_AT: "2025-02-01", SUMMARY: "sum", RISK_SCORE_AT_OPEN: 71 }]
    if (sql.includes("EVIDENCE_ITEMS")) return [{ EVIDENCE_ID: "EV-1", CASE_ID: "CASE-A", EVIDENCE_TYPE: "DEVICE_LINK", STANCE: "SUPPORTS", DESCRIPTION: "d", SOURCE_REFERENCE: "RAW.X:1", CONFIDENCE: 0.9, IS_VERIFIED: true }]
    if (sql.includes("BLAST_RADIUS_CACHE")) return [{ RECORD_KIND: "IMPACTED_ENTITY", IMPACTED_ENTITY_ID: "M900", IMPACTED_ENTITY_TYPE: "MERCHANT", HOP_DISTANCE: 1 }]
    if (sql.includes("CORE.ENTITY_NODES"))
      return o.identity === false ? [] : [{ NODE_ID: "M044", ENTITY_TYPE: "MERCHANT", DISPLAY_NAME: "x", ATTRIBUTES: {} }, { NODE_ID: "M900", DISPLAY_NAME: "Past Co" }]
    throw new Error("unexpected " + sql)
  })
}

describe("Risk DNA layer", () => {
  it("returns every snapshot newest first with backend values (missing stays null)", async () => {
    fake()
    const d = await getRiskDna("M044")
    expect(q.mock.calls[0][1]?.binds).toEqual(["M044"])
    expect(d.snapshots.map((s) => s.asOf)).toEqual(["2026-01-10", "2025-12-01"])
    expect(d.snapshots[0].dims).toMatchObject({ transaction: 0.7, historical: 0.7, document: null })
    expect(d.snapshots[0].features).toEqual({ velocity: 0.7 })
  })
})

describe("Similar investigations layer", () => {
  it("uses the backend similarity and rank verbatim and joins case context", async () => {
    fake()
    const s = await getSimilarCases("M044")
    expect(s.cases.map((c) => [c.caseId, c.rank, c.similarity])).toEqual([["CASE-A", 1, 0.8123], ["CASE-B", 2, 0.5]])
    expect(s.methodology).toBe("Cosine (backend comment)")
    const a = s.cases[0]
    expect(a).toMatchObject({ historicalEntityName: "Past Co", riskScoreAtOpen: 71, summary: "sum", connectedHop: 1, dnaAsOf: "2025-01-01" })
    expect(a.evidence).toHaveLength(1)
    // CASE-B has no backend detail: nothing is invented.
    expect(s.cases[1]).toMatchObject({ dna: null, evidence: [], connectedHop: null, historicalEntityName: null })
    // The slow characteristics view is never on the case-list path.
    expect(q.mock.calls.some(([sql]) => sql.includes("V_SIMILAR_INVESTIGATION_INPUT"))).toBe(false)
    for (const [sql, o] of q.mock.calls) if (/\?/.test(sql)) expect(o?.binds?.length).toBeGreaterThan(0)
  })
  it("characteristics come from the backend flags for subject and cases", async () => {
    fake()
    const c = await getCaseCharacteristics("M044")
    const call = q.mock.calls.find(([sql]) => sql.includes("V_SIMILAR_INVESTIGATION_INPUT"))!
    expect(call[1]?.binds).toEqual(["M044"])
    expect(c.subject).toMatchObject({ HAS_SHARED_DEVICE: true, USES_CORAL_BAY: false })
    expect(c.byCase["CASE-A"]).toMatchObject({ flags: { HAS_SHARED_DEVICE: true, USES_CORAL_BAY: true }, signalTypes: "DEVICE_LINK" })
    expect(c.byCase["CASE-B"]).toBeUndefined()
  })
  it("no similar cases → empty list and no follow-up queries", async () => {
    fake({ scores: [] })
    const s = await getSimilarCases("M044")
    expect(s.cases).toEqual([])
    expect(q.mock.calls.some(([sql]) => sql.includes("EVIDENCE_ITEMS"))).toBe(false)
  })
})

describe("routes", () => {
  const get = (h: typeof dnaGET, qs: string) => h(new Request(`http://x/api?${qs}`))
  it("malformed → 400 before Snowflake", async () => {
    for (const h of [dnaGET, simGET]) {
      expect((await get(h, "")).status).toBe(400)
      expect((await get(h, "entity=%27or1")).status).toBe(400)
    }
    expect((await get(simGET, "entity=M044&part=sql")).status).toBe(400)
    expect(q).not.toHaveBeenCalled()
  })
  it("characteristics part", async () => {
    fake()
    const j = await (await get(simGET, "entity=M044&part=characteristics")).json()
    expect(j.subject.HAS_SHARED_DEVICE).toBe(true)
  })
  it("unknown → 404", async () => {
    fake({ identity: false })
    expect((await get(dnaGET, "entity=M999")).status).toBe(404)
    expect((await get(simGET, "entity=M999")).status).toBe(404)
  })
  it("empty DNA is returned empty", async () => {
    fake({ dna: [] })
    expect((await (await get(dnaGET, "entity=M044")).json()).snapshots).toEqual([])
  })
  it("Snowflake errors are sanitized", async () => {
    fake({ fail: /V_RISK_DNA|V_SIMILAR_CASE_SCORES/ })
    for (const r of [await get(dnaGET, "entity=M044"), await get(simGET, "entity=M044")]) {
      expect(r.status).toBe(500)
      expect(await r.text()).not.toMatch(/ORACLE_X|compilation|secret|SELECT/i)
    }
  })
})
