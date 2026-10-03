import { GraphNotFound, GraphRejected, getDirectGraph, getPathGraph, NODE_TYPES } from "@/lib/server/graph"
import { entityId, errorResponse, graphBounds, InputError } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/**
 * GET /api/graph?entity=M044[&mode=direct|paths][&hops=1..3][&paths=1..200][&through=D2999][&endType=CUSTOMER][&perType=1..25]
 *
 * mode=direct (default): 1-hop relationships from INTEL.V_ENTITY_NEIGHBORS.
 * mode=paths: bounded paths from AGENTS.TOOL_GET_BOUNDED_GRAPH. A start entity is always required and
 * hops/paths are clamped to the backend limits (3 / 200) before the call; the backend clamps again.
 */
export async function GET(req: Request) {
  let id = ""
  try {
    const u = new URL(req.url)
    id = entityId(u.searchParams.get("entity"))
    const mode = u.searchParams.get("mode") ?? "direct"
    if (mode === "direct") {
      const perType = Number(u.searchParams.get("perType") ?? 6)
      return Response.json(await getDirectGraph(id, Number.isFinite(perType) ? perType : 6), { headers: { "Cache-Control": "no-store" } })
    }
    if (mode !== "paths") throw new InputError("Unknown graph mode")

    const hopsRaw = u.searchParams.get("hops")
    const pathsRaw = u.searchParams.get("paths")
    const { hops, paths } = graphBounds(hopsRaw == null ? null : Number(hopsRaw), pathsRaw == null ? null : Number(pathsRaw))
    const throughRaw = u.searchParams.get("through")
    const through = throughRaw ? entityId(throughRaw) : null
    const endTypeRaw = u.searchParams.get("endType")
    const endType = endTypeRaw ? endTypeRaw.toUpperCase() : null
    if (endType && !(NODE_TYPES as readonly string[]).includes(endType)) throw new InputError("Unknown entity type")

    return Response.json(await getPathGraph(id, { hops, paths, through, endType }), { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    if (e instanceof GraphNotFound) return Response.json({ error: `Entity ${id} was not found.` }, { status: 404 })
    if (e instanceof GraphRejected) return Response.json({ error: e.message }, { status: 400 })
    return errorResponse(e, "Graph")
  }
}
