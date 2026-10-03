import { getCouncilStatus } from "@/lib/server/council"
import { errorResponse, runId } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/** GET /api/council/{runId} — current phase, per-specialist state and (when done) the final report. */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const id = runId((await params).runId)
    const status = await getCouncilStatus(id)
    if (!status) return Response.json({ error: "Run not found" }, { status: 404 })
    return Response.json(status, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    return errorResponse(e, "Council status")
  }
}
