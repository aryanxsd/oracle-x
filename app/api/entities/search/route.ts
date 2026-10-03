import { resolveEntity } from "@/lib/server/queries"
import { errorResponse, searchText } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/** GET /api/entities/search?q=Harborview — resolves names/ids via AGENTS.TOOL_RESOLVE_ENTITY. */
export async function GET(req: Request) {
  try {
    const q = searchText(new URL(req.url).searchParams.get("q"))
    return Response.json({ matches: await resolveEntity(q) })
  } catch (e) {
    return errorResponse(e, "Entity search")
  }
}
