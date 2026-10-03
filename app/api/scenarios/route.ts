import { getIdentity } from "@/lib/server/investigation"
import { getLatestScenarios, runScenarios, ScenarioRejected } from "@/lib/server/impact"
import { entityId, errorResponse } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/** GET /api/scenarios?entity=M044 — the latest stored DO_NOTHING / MONITOR / BLOCK run (null if none). */
export async function GET(req: Request) {
  try {
    const id = entityId(new URL(req.url).searchParams.get("entity"))
    if (!(await getIdentity(id))) return Response.json({ error: `Entity ${id} was not found.` }, { status: 404 })
    return Response.json({ entityId: id, scenarios: await getLatestScenarios(id) }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    return errorResponse(e, "Scenarios")
  }
}

/**
 * POST /api/scenarios { entityId } — re-runs AGENTS.TOOL_RUN_SCENARIOS. Explicit user action only;
 * the backend stores the results in CASES.SCENARIO_RUNS. Concurrent requests share one run.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = entityId(typeof body?.entityId === "string" ? body.entityId : null)
    if (!(await getIdentity(id))) return Response.json({ error: `Entity ${id} was not found.` }, { status: 404 })
    return Response.json({ entityId: id, scenarios: await runScenarios(id) }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    if (e instanceof ScenarioRejected) return Response.json({ error: e.message }, { status: 400 })
    return errorResponse(e, "Scenario run")
  }
}
