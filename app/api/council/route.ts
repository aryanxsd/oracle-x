import { startCouncil } from "@/lib/server/council"
import { entityId, errorResponse } from "@/lib/server/guards"
import { isReadOnly, readOnlyResponse } from "@/lib/server/read-only"

export const dynamic = "force-dynamic"

/**
 * POST /api/council  { entityId }
 * Starts AGENTS.SP_RUN_COUNCIL asynchronously and returns immediately with the run id.
 * Poll GET /api/council/{runId} for progress. Re-uses a run already in progress for the entity.
 * Refused with 403 in read-only mode, before any Snowflake call.
 */
export async function POST(req: Request) {
  if (isReadOnly()) return readOnlyResponse()
  try {
    const body = await req.json().catch(() => ({}))
    const id = entityId(body.entityId)
    const { runId, reused } = await startCouncil(id)
    return Response.json({ runId, reused }, { status: reused ? 200 : 202 })
  } catch (e) {
    return errorResponse(e, "Council start")
  }
}
