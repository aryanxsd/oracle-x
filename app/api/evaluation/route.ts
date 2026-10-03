import { listEvalRuns } from "@/lib/server/evaluation"
import { errorResponse, runId } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/** GET /api/evaluation[?council=RUN_ID] — stored evaluation runs (never starts the evaluator). */
export async function GET(req: Request) {
  try {
    const c = new URL(req.url).searchParams.get("council")
    return Response.json({ runs: await listEvalRuns(c ? runId(c) : null) }, { headers: { "Cache-Control": "private, max-age=60" } })
  } catch (e) {
    return errorResponse(e, "Evaluation")
  }
}
