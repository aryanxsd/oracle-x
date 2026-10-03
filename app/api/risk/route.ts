import { getIdentity } from "@/lib/server/investigation"
import { getBandConfig, getEventsCached, getRiskCached, getTimelineCached } from "@/lib/server/risk"
import { entityId, errorResponse, InputError } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/**
 * GET /api/risk?entity=M044[&part=summary|timeline]
 *
 * summary (default): current v1/v2 score, eight dimensions and band configuration.
 * timeline: daily history, 30/14/7/today snapshots, pattern start and early-warning events.
 * Values are the backend's own; nothing is recalculated.
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const id = entityId(u.searchParams.get("entity"))
    const part = u.searchParams.get("part") ?? "summary"
    if (part !== "summary" && part !== "timeline") throw new InputError("Unknown part")
    if (!(await getIdentity(id))) return Response.json({ error: `Entity ${id} was not found.` }, { status: 404 })

    const headers = { "Cache-Control": "private, max-age=60" }
    if (part === "summary") {
      const [risk, bands] = await Promise.all([getRiskCached(id), getBandConfig()])
      return Response.json({ entityId: id, risk, bands }, { headers })
    }
    const [timeline, events] = await Promise.all([getTimelineCached(id), getEventsCached(id)])
    return Response.json({ entityId: id, timeline, events }, { headers })
  } catch (e) {
    return errorResponse(e, "Risk")
  }
}
