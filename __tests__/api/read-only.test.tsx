// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("server-only", () => ({}))

// Every path that could reach Snowflake is mocked so the tests can prove none is touched.
const { startCouncil, runScenarios, runAgent, getIdentity, querySnowflake, submitSnowflakeAsync } = vi.hoisted(() => ({
  startCouncil: vi.fn(),
  runScenarios: vi.fn(),
  runAgent: vi.fn(),
  getIdentity: vi.fn(),
  querySnowflake: vi.fn(),
  submitSnowflakeAsync: vi.fn(),
}))
vi.mock("@/lib/server/council", () => ({ startCouncil }))
vi.mock("@/lib/server/cortex-agent", () => ({ runAgent }))
vi.mock("@/lib/server/investigation", () => ({ getIdentity }))
vi.mock("@/lib/server/impact", () => ({ runScenarios, getLatestScenarios: vi.fn(), ScenarioRejected: class extends Error {} }))
vi.mock("@/lib/snowflake", () => ({ querySnowflake, submitSnowflakeAsync }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/investigations/M044", useSearchParams: () => new URLSearchParams() }))

import { POST as councilPOST } from "../../app/api/council/route"
import { POST as scenariosPOST } from "../../app/api/scenarios/route"
import { POST as askPOST } from "../../app/api/agent/ask/route"
import { isReadOnly, READ_ONLY_MESSAGE } from "../../lib/server/read-only"
import { CouncilRunner } from "../../components/oracle/council-runner"
import { ScenarioCompare } from "../../components/impact/scenario-compare"

const post = (body: unknown) => new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const ORIGINAL = process.env.ORACLE_X_READ_ONLY

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  cleanup()
  if (ORIGINAL === undefined) delete process.env.ORACLE_X_READ_ONLY
  else process.env.ORACLE_X_READ_ONLY = ORIGINAL
})

describe("isReadOnly", () => {
  it("is enabled only by the exact value true (case/whitespace tolerant)", () => {
    for (const v of ["true", "TRUE", " true "]) {
      process.env.ORACLE_X_READ_ONLY = v
      expect(isReadOnly()).toBe(true)
    }
    for (const v of ["", "false", "1", "yes"]) {
      process.env.ORACLE_X_READ_ONLY = v
      expect(isReadOnly()).toBe(false)
    }
    delete process.env.ORACLE_X_READ_ONLY
    expect(isReadOnly()).toBe(false)
  })
})

describe("read-only mode blocks mutating endpoints before Snowflake", () => {
  const cases = [
    { name: "POST /api/council", call: () => councilPOST(post({ entityId: "M044" })) },
    { name: "POST /api/scenarios", call: () => scenariosPOST(post({ entityId: "M044" })) },
    { name: "POST /api/agent/ask", call: () => askPOST(post({ entityId: "M044", question: "What is happening?" })) },
  ]
  for (const c of cases) {
    it(`${c.name} returns 403 and makes no Snowflake call`, async () => {
      process.env.ORACLE_X_READ_ONLY = "true"
      const r = await c.call()
      expect(r.status).toBe(403)
      expect(await r.json()).toEqual({ error: READ_ONLY_MESSAGE })
      for (const fn of [startCouncil, runScenarios, runAgent, getIdentity, querySnowflake, submitSnowflakeAsync]) expect(fn).not.toHaveBeenCalled()
    })
  }

  it("with the flag off, the council route still reaches its handler (behaviour unchanged)", async () => {
    delete process.env.ORACLE_X_READ_ONLY
    startCouncil.mockResolvedValue({ runId: "RUN-1", reused: false })
    const r = await councilPOST(post({ entityId: "M044" }))
    expect(r.status).toBe(202)
    expect(startCouncil).toHaveBeenCalledWith("M044")
  })
})

describe("read-only mode hides the action buttons", () => {
  const SET = { entityId: "M044", runId: "S1", runAt: null, runBy: null, assumptions: null, windowStart: null, windowEnd: null, horizonDays: null, provenance: null, baseline: null, scenarios: [] }
  const withQuery = (node: React.ReactNode) => <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>

  it("CouncilRunner shows no start button when read-only", async () => {
    await act(async () => {
      render(withQuery(<CouncilRunner entityId="M044" initialRunId={null} readOnly />))
    })
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByTestId("council-read-only")).toBeTruthy()
  })
  it("CouncilRunner keeps its start button by default", async () => {
    await act(async () => {
      render(withQuery(<CouncilRunner entityId="M044" initialRunId={null} />))
    })
    expect(screen.getByRole("button", { name: /Investigate M044 with the council/ })).toBeTruthy()
  })
  it("ScenarioCompare shows no re-run button when read-only", () => {
    render(<ScenarioCompare entityId="M044" initial={SET} readOnly />)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByTestId("scenario-read-only")).toBeTruthy()
  })
  it("ScenarioCompare keeps its re-run button by default", () => {
    render(<ScenarioCompare entityId="M044" initial={SET} />)
    expect(screen.getByRole("button", { name: /Re-run scenarios/ })).toBeTruthy()
  })
})
