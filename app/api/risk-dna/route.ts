import { getIdentity } from "@/lib/server/investigation"
import { getRiskDna } from "@/lib/server/dna"
import { entityId, errorResponse } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/** GET /api/risk-dna?entity=M044 — every Risk DNA snapshot for the entity (empty list if none). */
export async function GET(req: Request) {
  try {
    const id = entityId(new URL(req.url).searchParams.get("entity"))
    if (!(await getIdentity(id))) return Response.json({ error: `Entity ${id} was not found.` }, { status: 404 })
    return Response.json(await getRiskDna(id), { headers: { "Cache-Control": "private, max-age=60" } })
  } catch (e) {
    return errorResponse(e, "Risk DNA")
  }
}
