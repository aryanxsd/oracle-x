import { getEvalRun } from "@/lib/server/evaluation"
import { errorResponse, InputError } from "@/lib/server/guards"
import { EVAL_RUN_ID_RE } from "@/lib/trace-types"

export const dynamic = "force-dynamic"

/** GET /api/evaluation/{runId} — one stored evaluation run with every criterion result. */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const id = decodeURIComponent((await params).runId)
    if (!EVAL_RUN_ID_RE.test(id)) throw new InputError("Invalid evaluation run id")
    const r = await getEvalRun(id)
    return r ? Response.json(r, { headers: { "Cache-Control": "private, max-age=60" } }) : Response.json({ error: "Evaluation run not found" }, { status: 404 })
  } catch (e) {
    return errorResponse(e, "Evaluation")
  }
}
