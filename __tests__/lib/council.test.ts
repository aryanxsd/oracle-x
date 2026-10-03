import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/snowflake", () => ({
  querySnowflake: vi.fn(),
  submitSnowflakeAsync: vi.fn(),
}))

import { querySnowflake, submitSnowflakeAsync } from "../../lib/snowflake"
import { _resetCouncilReservations, deriveStages, FULL_COUNCIL_QUESTION, getCouncilStatus, newRunId, startCouncil } from "../../lib/server/council"

const q = vi.mocked(querySnowflake)
const submit = vi.mocked(submitSnowflakeAsync)

beforeEach(() => {
  q.mockReset()
  submit.mockReset()
  _resetCouncilReservations()
})

describe("council run ids", () => {
  it("are valid for the run-id guard and carry the entity", () => {
    const id = newRunId("M044", new Date("2026-10-03T13:59:03Z"))
    expect(id).toMatch(/^UI-M044-20261003135903-[A-Z0-9]{1,4}$/)
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  })
})

describe("startCouncil", () => {
  it("submits the existing SP_RUN_COUNCIL with bind parameters only", async () => {
    q.mockResolvedValueOnce([]) // no run in progress
    submit.mockResolvedValueOnce("qid")
    const { runId, reused } = await startCouncil("M044")
    expect(reused).toBe(false)
    const [sql, opts] = submit.mock.calls[0]
    expect(sql).toBe("CALL ORACLE_X.AGENTS.SP_RUN_COUNCIL(?, ?, ?)")
    expect(opts?.binds).toEqual(["M044", FULL_COUNCIL_QUESTION.replace("{ENTITY}", "M044"), runId])
    expect(q.mock.calls[0][1]?.binds?.[0]).toBe("M044")
  })

  it("re-uses a run already in progress instead of starting another", async () => {
    q.mockResolvedValueOnce([{ COUNCIL_RUN_ID: "UI-M044-1" }])
    await expect(startCouncil("M044")).resolves.toEqual({ runId: "UI-M044-1", reused: true })
    expect(submit).not.toHaveBeenCalled()
  })

  it("concurrent and immediate repeat starts submit exactly once (before COUNCIL_RUNS has the row)", async () => {
    q.mockResolvedValue([]) // the backend row does not exist yet
    submit.mockResolvedValue("qid")
    const [a, b] = await Promise.all([startCouncil("M044"), startCouncil("M044")])
    const c = await startCouncil("M044")
    expect(submit).toHaveBeenCalledTimes(1)
    expect(b.runId).toBe(a.runId)
    expect(c).toEqual({ runId: a.runId, reused: true })
    expect([a.reused, b.reused].sort()).toEqual([false, true])
  })

  it("a failed submission does not block a retry", async () => {
    q.mockResolvedValue([])
    submit.mockRejectedValueOnce(new Error("submit failed")).mockResolvedValueOnce("qid")
    await expect(startCouncil("M044")).rejects.toThrow("submit failed")
    await expect(startCouncil("M044")).resolves.toMatchObject({ reused: false })
    expect(submit).toHaveBeenCalledTimes(2)
  })

  it("reservations are per entity", async () => {
    q.mockResolvedValue([])
    submit.mockResolvedValue("qid")
    const a = await startCouncil("M044")
    const b = await startCouncil("M187")
    expect(a.runId).not.toBe(b.runId)
    expect(submit).toHaveBeenCalledTimes(2)
  })
})

describe("deriveStages", () => {
  it("phase 1 runs investigator, risk analyst and scenario in parallel", () => {
    const s = deriveStages("RUNNING", "PHASE_1 (INVESTIGATOR | RISK_ANALYST | SCENARIO)", {})
    expect(s).toMatchObject({ INVESTIGATOR: "running", RISK_ANALYST: "running", SCENARIO: "running", COMPLIANCE: "idle", SKEPTIC: "idle", ORACLE: "idle" })
  })
  it("marks answered specialists done and the skeptic running in phase 3", () => {
    const s = deriveStages("RUNNING", "PHASE_3 (SKEPTIC)", { INVESTIGATOR: "success", RISK_ANALYST: "success", SCENARIO: "success", COMPLIANCE: "success" })
    expect(s.SKEPTIC).toBe("running")
    expect(s.COMPLIANCE).toBe("done")
    expect(s.ORACLE).toBe("idle")
  })
  it("completed run marks ORACLE done; failed run marks it failed", () => {
    expect(deriveStages("COMPLETED", "DONE", {}).ORACLE).toBe("done")
    expect(deriveStages("FAILED", "PHASE_2", {}).ORACLE).toBe("failed")
  })
})

describe("getCouncilStatus", () => {
  it("returns null for an unknown run", async () => {
    q.mockResolvedValueOnce([])
    await expect(getCouncilStatus("UI-X")).resolves.toBeNull()
  })

  it("never exposes the raw backend error message", async () => {
    q.mockResolvedValueOnce([{ COUNCIL_RUN_ID: "R1", ENTITY_ID: "M044", STATUS: "FAILED", CURRENT_PHASE: "PHASE_2", ELAPSED: 50, ERROR_MESSAGE: "internal: SQL compilation error at ORACLE_X.SECRET" }])
    q.mockResolvedValueOnce([])
    const s = await getCouncilStatus("R1")
    expect(s?.status).toBe("FAILED")
    expect(JSON.stringify(s)).not.toContain("SQL compilation")
    expect(s?.error).toBe("The council could not finish this run.")
  })

  it("reports a long-silent run as stalled", async () => {
    q.mockResolvedValueOnce([{ COUNCIL_RUN_ID: "R2", ENTITY_ID: "M044", STATUS: "RUNNING", CURRENT_PHASE: "PHASE_3 (SKEPTIC)", ELAPSED: 3600 }])
    q.mockResolvedValueOnce([])
    expect((await getCouncilStatus("R2"))?.status).toBe("STALLED")
  })

  it("binds the run id in both queries", async () => {
    q.mockResolvedValueOnce([{ COUNCIL_RUN_ID: "R3", ENTITY_ID: "M044", STATUS: "COMPLETED", CURRENT_PHASE: "DONE", ELAPSED: 330, FINAL_RESPONSE: "report" }])
    q.mockResolvedValueOnce([{ AGENT_ROLE: "SKEPTIC", STATUS: "success", DURATION_MS: 71805, TOOLS_USED: "get_evidence, get_bounded_graph", ANSWER_TEXT: "=== COUNCIL BRIEF ===\nCONCLUSIONS:\n- Claim X is overstated\nCONTRADICTIONS:\n- 90-day totals shown as 8-day\n=== END BRIEF ===\nlong detail" }])
    const s = await getCouncilStatus("R3")
    expect(q.mock.calls.every((c) => c[1]?.binds?.[0] === "R3")).toBe(true)
    expect(s?.finalResponse).toBe("report")
    expect(s?.stages.SKEPTIC).toBe("done")
    expect(s?.stageDetails.SKEPTIC).toEqual({
      durationSeconds: 72,
      tools: ["get_evidence", "get_bounded_graph"],
      brief: { conclusions: ["Claim X is overstated"], supporting: [], contradictions: ["90-day totals shown as 8-day"], missing: [], sources: [] },
    })
    expect(JSON.stringify(s)).not.toContain("long detail")
  })
})
