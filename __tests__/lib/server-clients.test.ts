import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/snowflake", () => ({
  getSnowflakeBaseUrl: vi.fn(() => "https://acct.snowflakecomputing.com/"),
  getRestApiAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer server-side-token", "X-Snowflake-Authorization-Token-Type": "OAUTH" })),
  querySnowflake: vi.fn(),
}))

import { querySnowflake } from "../../lib/snowflake"
import { AGENTS, agentRunUrl, runAgent } from "../../lib/server/cortex-agent"
import { getRecentRuns, resolveEntity } from "../../lib/server/queries"

describe("Cortex Agent REST client", () => {
  const fetchMock = vi.fn(async () => new Response("ok"))
  beforeEach(() => vi.stubGlobal("fetch", fetchMock))
  afterEach(() => vi.unstubAllGlobals())

  it("only targets allow-listed ORACLE_X agents", () => {
    expect(Object.values(AGENTS)).toEqual(["ORACLE_ORCHESTRATOR", "ORACLE_INVESTIGATOR"])
    expect(agentRunUrl("https://a.snowflakecomputing.com/", "ORCHESTRATOR")).toBe(
      "https://a.snowflakecomputing.com/api/v2/databases/ORACLE_X/schemas/AGENTS/agents/ORACLE_ORCHESTRATOR:run",
    )
  })

  it("attaches the server-side token and requests a stream", async () => {
    await runAgent("ORCHESTRATOR", [{ role: "user", content: [{ type: "text", text: "q" }] }])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain("ORACLE_ORCHESTRATOR:run")
    const h = init.headers as Record<string, string>
    expect(h.Authorization).toBe("Bearer server-side-token")
    expect(h.Accept).toBe("text/event-stream")
    expect(JSON.parse(String(init.body))).toMatchObject({ stream: true })
  })
})

describe("SQL parameter binding", () => {
  it("entity search passes user text as a bind, never in the SQL", async () => {
    vi.mocked(querySnowflake).mockResolvedValueOnce([{ TOOL_RESOLVE_ENTITY: JSON.stringify({ matches: [] }) }])
    const evil = "x'); DROP TABLE t; --"
    await resolveEntity(evil)
    const [sql, opts] = vi.mocked(querySnowflake).mock.calls.at(-1)!
    expect(sql).toBe("CALL ORACLE_X.AGENTS.TOOL_RESOLVE_ENTITY(?)")
    expect(sql).not.toContain("DROP")
    expect(opts?.binds).toEqual([evil])
  })

  it("recent runs clamps and binds the limit", async () => {
    vi.mocked(querySnowflake).mockResolvedValueOnce([])
    await getRecentRuns(10_000)
    expect(vi.mocked(querySnowflake).mock.calls.at(-1)![1]?.binds).toEqual([25])
  })
})
