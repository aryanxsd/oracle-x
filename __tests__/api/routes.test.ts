import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/server/cortex-agent", () => ({ runAgent: vi.fn() }))
vi.mock("../../lib/server/queries", () => ({
  getRadarBands: vi.fn(),
  resolveEntity: vi.fn(),
  getRecentRuns: vi.fn(),
  getConnectionStatus: vi.fn(),
}))
vi.mock("../../lib/server/council", () => ({ startCouncil: vi.fn(), getCouncilStatus: vi.fn() }))

import { runAgent } from "../../lib/server/cortex-agent"
import { getConnectionStatus, getRadarBands, resolveEntity } from "../../lib/server/queries"
import { getCouncilStatus, startCouncil } from "../../lib/server/council"
import { POST as askPOST } from "../../app/api/agent/ask/route"
import { GET as radarGET } from "../../app/api/radar/route"
import { GET as searchGET } from "../../app/api/entities/search/route"
import { GET as healthGET } from "../../app/api/health/route"
import { POST as councilPOST } from "../../app/api/council/route"
import { GET as councilGET } from "../../app/api/council/[runId]/route"

const json = (body: unknown) =>
  new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/agent/ask", () => {
  it("rejects invalid entity ids before calling Snowflake", async () => {
    const r = await askPOST(json({ entityId: "M044; DROP TABLE t", question: "what is the risk?" }))
    expect(r.status).toBe(400)
    expect(runAgent).not.toHaveBeenCalled()
  })

  it("rejects empty or oversized questions", async () => {
    expect((await askPOST(json({ entityId: "M044", question: "" }))).status).toBe(400)
    expect((await askPOST(json({ entityId: "M044", question: "x".repeat(2001) }))).status).toBe(400)
    expect(runAgent).not.toHaveBeenCalled()
  })

  it("streams the agent's server-sent events through unchanged", async () => {
    vi.mocked(runAgent).mockResolvedValueOnce(new Response("event: response.text.delta\ndata: {\"text\":\"hi\"}\n\n", { status: 200 }))
    const r = await askPOST(json({ entityId: "m044", question: "what is the risk?" }))
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toBe("text/event-stream")
    expect(await r.text()).toContain("response.text.delta")
    const [agent, messages] = vi.mocked(runAgent).mock.calls[0]
    expect(agent).toBe("ORCHESTRATOR")
    expect(messages[0].content[0].text).toContain("M044")
  })

  it("hides upstream auth failures and error bodies from the browser", async () => {
    vi.mocked(runAgent).mockResolvedValueOnce(new Response('{"message":"Invalid OAuth access token abc123"}', { status: 401 }))
    const r = await askPOST(json({ entityId: "M044", question: "what is the risk?" }))
    expect(r.status).toBe(502)
    const t = await r.text()
    expect(t).not.toContain("abc123")
    expect(t).not.toContain("OAuth")
  })

  it("returns a generic 500 when credentials are missing, without details", async () => {
    vi.mocked(runAgent).mockRejectedValueOnce(new Error("No Snowflake REST credential: SNOWFLAKE_SECRET_ORACLE_X_PAT_SECRET_STRING"))
    const r = await askPOST(json({ entityId: "M044", question: "what is the risk?" }))
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain("SNOWFLAKE_SECRET")
  })
})

describe("read-only routes", () => {
  it("radar returns bands and hides query errors", async () => {
    vi.mocked(getRadarBands).mockResolvedValueOnce([{ band: "ELEVATED", entities: 1, entitiesDedup: 1 }])
    expect(await (await radarGET()).json()).toEqual({ bands: [{ band: "ELEVATED", entities: 1, entitiesDedup: 1 }] })
    vi.mocked(getRadarBands).mockRejectedValueOnce(new Error("Query failed: object ORACLE_X.INTEL.X does not exist"))
    const r = await radarGET()
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain("ORACLE_X.INTEL")
  })

  it("entity search validates length before querying", async () => {
    expect((await searchGET(new Request("http://x/api/entities/search?q=a"))).status).toBe(400)
    expect(resolveEntity).not.toHaveBeenCalled()
    vi.mocked(resolveEntity).mockResolvedValueOnce([])
    expect((await searchGET(new Request("http://x/api/entities/search?q=Harborview"))).status).toBe(200)
    expect(resolveEntity).toHaveBeenCalledWith("Harborview")
  })

  it("health exposes only role and warehouse", async () => {
    vi.mocked(getConnectionStatus).mockResolvedValueOnce({ role: "ORACLE_X_ADMIN", warehouse: "ORACLE_X_WH" })
    expect(await (await healthGET()).json()).toEqual({ ok: true, role: "ORACLE_X_ADMIN", warehouse: "ORACLE_X_WH" })
  })
})

describe("council routes", () => {
  it("start validates the entity and returns 202 for a new run", async () => {
    expect((await councilPOST(json({ entityId: "../x" }))).status).toBe(400)
    vi.mocked(startCouncil).mockResolvedValueOnce({ runId: "UI-M044-1", reused: false })
    const r = await councilPOST(json({ entityId: "M044" }))
    expect(r.status).toBe(202)
    expect(startCouncil).toHaveBeenCalledWith("M044")
  })

  it("status validates the run id and 404s unknown runs", async () => {
    const p = (runId: string) => ({ params: Promise.resolve({ runId }) })
    expect((await councilGET(new Request("http://x"), p("a b;c"))).status).toBe(400)
    vi.mocked(getCouncilStatus).mockResolvedValueOnce(null)
    expect((await councilGET(new Request("http://x"), p("UI-M044-1"))).status).toBe(404)
  })
})
