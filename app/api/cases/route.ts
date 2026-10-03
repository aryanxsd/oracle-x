import { getIdentity } from "@/lib/server/investigation"
import { listCases } from "@/lib/server/cases"
import { entityId, errorResponse } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/** GET /api/cases?entity=M044 — council reports for the entity and the historical case files (no report bodies). */
export async function GET(req: Request) {
  try {
    const id = entityId(new URL(req.url).searchParams.get("entity"))
    if (!(await getIdentity(id))) return Response.json({ error: `Entity ${id} was not found.` }, { status: 404 })
    return Response.json(await listCases(id), { headers: { "Cache-Control": "private, max-age=60" } })
  } catch (e) {
    return errorResponse(e, "Case files")
  }
}
