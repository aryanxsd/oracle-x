import { getIdentity } from "@/lib/server/investigation"
import { getBlastRadius } from "@/lib/server/impact"
import { entityId, errorResponse } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/** GET /api/blast-radius?entity=M044 — latest INTEL.BLAST_RADIUS_CACHE computation (null if none). */
export async function GET(req: Request) {
  try {
    const id = entityId(new URL(req.url).searchParams.get("entity"))
    if (!(await getIdentity(id))) return Response.json({ error: `Entity ${id} was not found.` }, { status: 404 })
    return Response.json({ entityId: id, blastRadius: await getBlastRadius(id) }, { headers: { "Cache-Control": "private, max-age=60" } })
  } catch (e) {
    return errorResponse(e, "Blast radius")
  }
}
