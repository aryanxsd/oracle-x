import { getIdentity } from "@/lib/server/investigation"
import { getToolCalls, getTrace, latestCompletedRun } from "@/lib/server/trace"
import { entityId, errorResponse, InputError, runId } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/**
 * GET /api/agent-trace?entity=M044[&run=ID][&part=tools]
 * Trace of an existing council run (latest completed by default). part=tools returns per-call tool
 * names and backend outcome classes only. Never starts a council.
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const id = entityId(u.searchParams.get("entity"))
    const runRaw = u.searchParams.get("run")
    const run = runRaw ? runId(runRaw) : null
    const part = u.searchParams.get("part")
    if (part != null && part !== "tools") throw new InputError("Unknown part")
    if (!(await getIdentity(id))) return Response.json({ error: `Entity ${id} was not found.` }, { status: 404 })
    const target = run ?? (await latestCompletedRun(id))
    if (!target) return Response.json({ entityId: id, trace: null })
    const trace = await getTrace(target)
    if (!trace || trace.entityId !== id) return Response.json({ error: "Council run not found" }, { status: 404 })
    const headers = { "Cache-Control": "private, max-age=60" }
    if (part === "tools") return Response.json({ runId: target, calls: await getToolCalls(target) }, { headers })
    return Response.json({ entityId: id, trace }, { headers })
  } catch (e) {
    return errorResponse(e, "Agent trace")
  }
}
