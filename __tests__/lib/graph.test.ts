import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/snowflake", () => ({ querySnowflake: vi.fn() }))

import { querySnowflake } from "../../lib/snowflake"
import { getDirectGraph, getPathGraph, GraphNotFound, GraphRejected, parsePath } from "../../lib/server/graph"
import { radialLayout } from "../../lib/graph-layout"
import { GET } from "../../app/api/graph/route"

const q = vi.mocked(querySnowflake)
beforeEach(() => q.mockReset())

const call = (qs: string) => GET(new Request(`http://x/api/graph?${qs}`))

describe("parsePath", () => {
  it("splits backend path strings into hops", () => {
    expect(parsePath("M044 -[SHARED_DEVICE]-> D2999 -[USED_BY]-> C10")).toEqual([
      { source: "M044", relationship: "SHARED_DEVICE", target: "D2999" },
      { source: "D2999", relationship: "USED_BY", target: "C10" },
    ])
    expect(parsePath("M044")).toEqual([])
  })
})

describe("getDirectGraph", () => {
  it("binds entity and clamps perType; 404 when entity unknown", async () => {
    q.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await expect(getDirectGraph("M999", 999)).rejects.toBeInstanceOf(GraphNotFound)
    expect(q.mock.calls[1][1]?.binds).toEqual(["M999", 25])
  })

  it("maps neighbours to nodes/edges and reports truncation", async () => {
    q.mockResolvedValueOnce([{ NODE_ID: "M044", ENTITY_TYPE: "MERCHANT", DISPLAY_NAME: "Shop", ATTRIBUTES: '{"is_flagged":true}' }])
      .mockResolvedValueOnce([{ NEIGHBOR_ID: "M187", NEIGHBOR_TYPE: "MERCHANT", RELATIONSHIP_TYPE: "SHARED_DEVICE_HISTORY", DIRECTION: "OUTGOING", LINK_CONFIDENCE: 0.7, RELATIONSHIP_IS_CONCURRENT: false, EVIDENCE_REFERENCE: "a || b" }])
      .mockResolvedValueOnce([{ RELATIONSHIP_TYPE: "SHARED_DEVICE_HISTORY", NEIGHBOR_TYPE: "MERCHANT", TOTAL: 3 }])
      .mockResolvedValueOnce([])
    const g = await getDirectGraph("M044")
    expect(g.nodes.map((n) => n.id)).toEqual(["M044", "M187"])
    expect(g.nodes[0].flagged).toBe(true)
    expect(g.edges[0]).toMatchObject({ source: "M044", target: "M187", confidence: 0.7, concurrent: false, evidence: ["a", "b"] })
    expect(g.truncated).toBe(true)
    expect(g.totalDirect).toBe(3)
  })
})

describe("getPathGraph", () => {
  it("clamps hops/paths before calling the bounded tool", async () => {
    q.mockResolvedValueOnce([{ R: JSON.stringify({ status: "OK", paths: [{ path: "M044 -[X]-> D1", hops: 1, evidence: "n=5" }], paths_matching: 1, paths_returned: 1, truncated: false }) }])
      .mockResolvedValueOnce([{ NODE_ID: "D1", ENTITY_TYPE: "DEVICE" }])
      .mockResolvedValueOnce([])
    const g = await getPathGraph("M044", { hops: 15, paths: 100000, through: "D1" })
    expect(q.mock.calls[0][1]?.binds).toEqual(["M044", 3, 200, "", "D1"])
    expect(g.edges[0].observations).toBe(5)
    expect(g.nodes.find((n) => n.id === "D1")?.hop).toBe(1)
  })

  it("maps backend REJECTED to GraphRejected", async () => {
    q.mockResolvedValueOnce([{ R: { status: "REJECTED", reason: "entity_id is mandatory" } }])
    await expect(getPathGraph("M044", { hops: 1, paths: 1 })).rejects.toBeInstanceOf(GraphRejected)
  })
})

describe("/api/graph validation", () => {
  it("rejects missing entity, bad endType, bad through, unknown mode", async () => {
    expect((await call("")).status).toBe(400)
    expect((await call("entity=M044&mode=paths&endType=ROBOT")).status).toBe(400)
    expect((await call("entity=M044&mode=paths&through=x;drop")).status).toBe(400)
    expect((await call("entity=M044&mode=weird")).status).toBe(400)
    expect(q).not.toHaveBeenCalled()
  })
  it("returns 400 for backend rejection and 404 for unknown entity", async () => {
    q.mockResolvedValueOnce([{ R: { status: "REJECTED", reason: "nope" } }])
    expect((await call("entity=M044&mode=paths&hops=2")).status).toBe(400)
    q.mockResolvedValue([])
    expect((await call("entity=M999")).status).toBe(404)
  })
})

describe("radialLayout", () => {
  it("places centre at origin and positions every node", () => {
    const nodes = [
      { id: "A", type: "MERCHANT", name: "A", riskTier: null, flagged: false, hop: 0 },
      { id: "B", type: "DEVICE", name: "B", riskTier: null, flagged: false, hop: 1 },
    ]
    const pos = radialLayout(nodes, "A", [])
    expect(pos.get("A")).toEqual({ x: 0, y: 0 })
    const b = pos.get("B")!
    expect(Math.round(Math.hypot(b.x, b.y))).toBe(300)
  })
})
