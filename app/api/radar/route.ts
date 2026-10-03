import { getRadarBands } from "@/lib/server/queries"
import { errorResponse } from "@/lib/server/guards"

export const dynamic = "force-dynamic"

/** GET /api/radar — Early Warning Radar band counts from INTEL.V_ENTITY_RISK_INTELLIGENCE. */
export async function GET() {
  try {
    return Response.json({ bands: await getRadarBands() })
  } catch (e) {
    return errorResponse(e, "Radar")
  }
}
