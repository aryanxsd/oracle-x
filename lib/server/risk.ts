import "server-only"
import { querySnowflake } from "@/lib/snowflake"
import { cached } from "@/lib/server/cache"
import { getEvents, getRiskSummary, getTimeline } from "@/lib/server/investigation"
import type { BandRange } from "@/lib/risk-style"

/**
 * Risk Intelligence + Time Machine loaders. They reuse the investigation readers (one mapping of the
 * frozen views, no second risk engine) and add a short read-through cache, because
 * V_ENTITY_RISK_INTELLIGENCE and V_ENTITY_RISK_TIMELINE each take several seconds and the backend
 * only re-scores daily.
 */
const TTL = 5 * 60_000

export const getRiskCached = (id: string) => cached(`risk:${id}`, TTL, () => getRiskSummary(id))
export const getTimelineCached = (id: string) => cached(`timeline:${id}`, TTL, () => getTimeline(id))
export const getEventsCached = (id: string) => cached(`events:${id}`, TTL, () => getEvents(id))

/** Band thresholds and actions exactly as configured in INTEL.V_RISK_BAND_CONFIG, lowest first. */
export function getBandConfig(): Promise<BandRange[]> {
  return cached("bands", TTL, async () => {
    const rows = await querySnowflake(`SELECT band, lower_bound, upper_bound, action FROM ORACLE_X.INTEL.V_RISK_BAND_CONFIG ORDER BY lower_bound`)
    return rows.map((r) => ({ band: String(r.BAND), lower: Number(r.LOWER_BOUND), upper: Number(r.UPPER_BOUND), action: r.ACTION == null ? null : String(r.ACTION) }))
  })
}
