import { getRecentRuns } from "@/lib/server/queries"
import { errorResponse } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/** GET /api/investigations/recent — latest council runs from CASES.COUNCIL_RUNS. */
export async function GET() {
  try {
    return Response.json({ runs: await getRecentRuns(6) })
  } catch (e) {
    return errorResponse(e, "Recent investigations")
  }
}
