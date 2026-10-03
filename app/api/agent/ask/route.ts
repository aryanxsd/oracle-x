import { runAgent } from "@/lib/server/cortex-agent"
import { entityId, errorResponse, question } from "@/lib/server/guards"
import { isReadOnly, readOnlyResponse } from "@/lib/server/read-only"

export const dynamic = "force-dynamic"
export const maxDuration = 600

/**
 * POST /api/agent/ask  { entityId, question }
 *
 * Server-side proxy to the ORACLE Orchestrator via the Cortex Agents REST API.
 * The Snowflake token is attached here and never sent to the browser; the
 * agent's server-sent events are streamed through unchanged so the UI can
 * render progress (planning, tool use, specialists, synthesis).
 * Refused with 403 in read-only mode, before any Snowflake call.
 */
export async function POST(req: Request) {
  if (isReadOnly()) return readOnlyResponse()
  try {
    const body = await req.json().catch(() => ({}))
    const id = entityId(body.entityId)
    const q = question(body.question)
    const upstream = await runAgent(
      "ORCHESTRATOR",
      [{ role: "user", content: [{ type: "text", text: `Entity under investigation: ${id}. ${q}` }] }],
      { stream: true, signal: req.signal },
    )
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "")
      // Log server-side only; the upstream body may contain request ids, never return it raw.
      console.error(new Date().toISOString(), "[oracle-x] agent run failed", upstream.status, detail.slice(0, 500))
      const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status === 429 ? 429 : 502
      const message =
        upstream.status === 429 ? "ORACLE is busy — please try again in a moment" : "ORACLE is unavailable right now"
      return Response.json({ error: message }, { status })
    }
    return new Response(upstream.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
    })
  } catch (e) {
    return errorResponse(e, "Agent request")
  }
}
