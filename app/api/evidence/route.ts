import { getIdentity } from "@/lib/server/investigation"
import { ClaimNotFound, getClaimDetail, getEvidenceOverview } from "@/lib/server/evidence"
import { entityId, errorResponse, InputError } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

const CLAIM_RE = /^[A-Z0-9][A-Z0-9@:_-]{2,80}$/

/**
 * GET /api/evidence?entity=M044            evidence balance + every claim (summary level)
 * GET /api/evidence?entity=M044&claim=ID   source records behind one claim (TOOL_GET_EVIDENCE DETAIL)
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const id = entityId(u.searchParams.get("entity"))
    const claimRaw = u.searchParams.get("claim")
    if (claimRaw != null && !CLAIM_RE.test(claimRaw)) throw new InputError("Invalid claim id")
    if (!(await getIdentity(id))) return Response.json({ error: `Entity ${id} was not found.` }, { status: 404 })
    const headers = { "Cache-Control": "private, max-age=60" }
    if (claimRaw) return Response.json(await getClaimDetail(id, claimRaw), { headers })
    return Response.json({ entityId: id, ...(await getEvidenceOverview(id)) }, { headers })
  } catch (e) {
    if (e instanceof ClaimNotFound) return Response.json({ error: "Claim not found" }, { status: 404 })
    return errorResponse(e, "Evidence")
  }
}
