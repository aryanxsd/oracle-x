import { getConnectionStatus } from "@/lib/server/queries"
import { errorResponse } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/** GET /api/health — confirms the server can reach Snowflake. Returns no credentials. */
export async function GET() {
  try {
    const s = await getConnectionStatus()
    return Response.json({ ok: true, role: s.role, warehouse: s.warehouse })
  } catch (e) {
    return errorResponse(e, "Health check")
  }
}
