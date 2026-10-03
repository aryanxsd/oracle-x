import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/snowflake", () => ({ querySnowflake: vi.fn() }))

import { querySnowflake } from "../../lib/snowflake"
import { DIMENSIONS, getInvestigation, getRiskSummary, getTimeline } from "../../lib/server/investigation"
import { getWorklist } from "../../lib/server/worklist"

const q = vi.mocked(querySnowflake)
beforeEach(() => q.mockReset())

/** Row shaped like INTEL.V_ENTITY_RISK_INTELLIGENCE (column names only; values are test inputs). */
function riskRow(over: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = { ENTITY_ID: "M044", SCORE_DATE: "2026-10-02", OVERALL_SCORE: 66.68, RISK_BAND: "ELEVATED", OVERALL_SCORE_DEDUP: 55.56, RISK_BAND_DEDUP: "ELEVATED", DEDUP_ADJUSTMENT_POINTS: 11.12, EXPLANATION: "x", DEDUP_EXPLANATION: "y", BINDING_TRANSACTION_COMPONENT: "STRUCTURING", DEDUP_R1_APPLIED: true, DEDUP_R2_APPLIED: false, DEDUP_R3_APPLIED: true }
  for (const d of DIMENSIONS) {
    r[d.score] = 10
    r[d.contrib] = 1
    if (d.dedup) r[d.dedup] = 5
  }
  return { ...r, ...over }
}

describe("getRiskSummary", () => {
  it("binds the entity id and maps v2 only for the three adjusted dimensions", async () => {
    q.mockResolvedValueOnce([riskRow()])
      .mockResolvedValueOnce([{ DIMENSION: "TRANSACTION_ANOMALY", WEIGHT: 0.2, FORMULA: "f", POLICY_REFERENCE: "p" }])
      .mockResolvedValueOnce([{ BAND: "ELEVATED", ACTION: "Open/continue investigation" }])
    const r = (await getRiskSummary("M044"))!
    expect(q.mock.calls[0][1]?.binds).toEqual(["M044"])
    expect(r.overall).toBe(66.68)
    expect(r.overallDedup).toBe(55.56)
    expect(r.bandAction).toBe("Open/continue investigation")
    expect(r.dimensions).toHaveLength(8)
    const withV2 = r.dimensions.filter((d) => d.scoreDedup != null).map((d) => d.key)
    expect(withV2).toEqual(["HISTORICAL_DEVIATION", "ACCOUNT_BEHAVIOR", "NETWORK_RELATIONSHIP_RISK"])
    expect(r.dimensions.find((d) => d.key === "ACCOUNT_BEHAVIOR")!.dedupApplied).toBe(false)
    expect(r.dimensions[0].weight).toBe(0.2)
  })

  it("returns null when the entity has no score", async () => {
    q.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await expect(getRiskSummary("C04901")).resolves.toBeNull()
  })
})

describe("getTimeline", () => {
  it("normalises dates and reads the abnormal-behaviour start from the backend", async () => {
    q.mockResolvedValueOnce([
      { SCORE_DATE: new Date("2026-09-02T00:00:00Z"), WINDOW_LABEL: "30_DAYS_AGO", OVERALL_SCORE: 13.06, RISK_BAND: "NORMAL", BAND_CHANGED: false, ABNORMAL_BEHAVIOR_START: new Date("2026-09-22T00:00:00Z") },
      { SCORE_DATE: new Date("2026-10-02T00:00:00Z"), WINDOW_LABEL: "TODAY", OVERALL_SCORE: 66.68, RISK_BAND: "ELEVATED", BAND_CHANGED: false, ABNORMAL_BEHAVIOR_START: new Date("2026-09-22T00:00:00Z"), ABNORMAL_BEHAVIOR_START_DEDUP: new Date("2026-09-23T00:00:00Z") },
    ])
    const t = (await getTimeline("M044"))!
    expect(t.points.map((p) => p.date)).toEqual(["2026-09-02", "2026-10-02"])
    expect(t.abnormalStart).toBe("2026-09-22")
    expect(t.abnormalStartDedup).toBe("2026-09-23")
  })

  it("returns null with no history", async () => {
    q.mockResolvedValueOnce([])
    await expect(getTimeline("M044")).resolves.toBeNull()
  })
})

describe("getInvestigation", () => {
  it("returns null for an unknown entity without further queries", async () => {
    q.mockResolvedValueOnce([])
    await expect(getInvestigation("M999")).resolves.toBeNull()
    expect(q).toHaveBeenCalledTimes(1)
    expect(q.mock.calls[0][1]?.binds).toEqual(["M999"])
  })

  it("every query binds the entity id (no string concatenation)", async () => {
    q.mockResolvedValueOnce([{ NODE_ID: "M044", ENTITY_TYPE: "MERCHANT", DISPLAY_NAME: "n", ATTRIBUTES: "{}", IS_SUBJECT: true }])
    q.mockResolvedValue([])
    await getInvestigation("M044")
    for (const [sql, opts] of q.mock.calls) {
      expect(sql).not.toContain("M044")
      if (/\?/.test(sql)) expect(opts?.binds).toContain("M044")
    }
  })
})

describe("getWorklist", () => {
  it("clamps the limit and binds it", async () => {
    q.mockResolvedValueOnce([])
    await getWorklist(500)
    expect(q.mock.calls[0][1]?.binds).toEqual([50])
  })
})
