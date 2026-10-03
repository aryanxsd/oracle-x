import { getIdentity } from "@/lib/server/investigation"
import { getCaseCharacteristics, getSimilarCases } from "@/lib/server/dna"
import { entityId, errorResponse, InputError } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/**
 * GET /api/similar-cases?entity=M044                       historical cases ranked by backend Risk DNA similarity
 * GET /api/similar-cases?entity=M044&part=characteristics  matching characteristic flags (slow backend view; separate call)
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const id = entityId(u.searchParams.get("entity"))
    const part = u.searchParams.get("part") ?? "cases"
    if (part !== "cases" && part !== "characteristics") throw new InputError("Unknown part")
    if (!(await getIdentity(id))) return Response.json({ error: `Entity ${id} was not found.` }, { status: 404 })
    const headers = { "Cache-Control": "private, max-age=60" }
    if (part === "characteristics") return Response.json(await getCaseCharacteristics(id), { headers })
    return Response.json(await getSimilarCases(id), { headers })
  } catch (e) {
    return errorResponse(e, "Similar investigations")
  }
}
