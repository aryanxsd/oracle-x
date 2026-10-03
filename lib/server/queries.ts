import "server-only"
import { querySnowflake } from "@/lib/snowflake"

/**
 * Allow-listed, read-only queries used by the application shell.
 * Values from the browser are always passed as bind parameters.
 * Additional page queries are added here as each screen is implemented.
 */

export interface RadarBand {
  band: string
  entities: number
  entitiesDedup: number
}

export async function getRadarBands(): Promise<RadarBand[]> {
  const rows = await querySnowflake(`
    SELECT b.band_name AS BAND,
           COUNT_IF(s.risk_band = b.band_name) AS ENTITIES,
           COUNT_IF(s.risk_band_dedup = b.band_name) AS ENTITIES_DEDUP
    FROM (SELECT column1 AS band_name FROM VALUES ('CRITICAL'),('ELEVATED'),('WATCH'),('NORMAL')) b
    CROSS JOIN (SELECT risk_band, risk_band_dedup FROM ORACLE_X.INTEL.V_ENTITY_RISK_INTELLIGENCE) s
    GROUP BY b.band_name`)
  const order = ["CRITICAL", "ELEVATED", "WATCH", "NORMAL"]
  return rows
    .map((r) => ({ band: String(r.BAND), entities: Number(r.ENTITIES), entitiesDedup: Number(r.ENTITIES_DEDUP) }))
    .sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band))
}

export interface ResolvedEntity {
  entityId: string
  name: string
  type: string
  isInvestigationSubject: boolean
  staticRiskTier: string | null
}

export async function resolveEntity(q: string): Promise<ResolvedEntity[]> {
  const rows = await querySnowflake("CALL ORACLE_X.AGENTS.TOOL_RESOLVE_ENTITY(?)", { binds: [q] })
  const raw = rows[0] ? Object.values(rows[0])[0] : null
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw
  const matches: any[] = payload?.matches ?? []
  return matches.map((m) => ({
    entityId: m.entity_id,
    name: m.entity_name,
    type: m.entity_type,
    isInvestigationSubject: Boolean(m.is_investigation_subject),
    staticRiskTier: m.static_risk_tier ?? null,
  }))
}

export interface RecentRun {
  runId: string
  entityId: string
  question: string
  mode: string
  status: string
  startedAt: string | null
  totalSeconds: number | null
}

function toIso(v: unknown): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : String(v)
}

export async function getRecentRuns(limit = 6): Promise<RecentRun[]> {
  const rows = await querySnowflake(
    `SELECT council_run_id, entity_id, user_question, execution_mode, status, started_at, total_seconds
       FROM ORACLE_X.CASES.COUNCIL_RUNS ORDER BY started_at DESC LIMIT ?`,
    { binds: [Math.min(Math.max(limit, 1), 25)] },
  )
  return rows.map((r) => ({
    runId: r.COUNCIL_RUN_ID,
    entityId: r.ENTITY_ID,
    question: r.USER_QUESTION,
    mode: r.EXECUTION_MODE,
    status: r.STATUS,
    startedAt: toIso(r.STARTED_AT),
    totalSeconds: r.TOTAL_SECONDS == null ? null : Number(r.TOTAL_SECONDS),
  }))
}

export async function getConnectionStatus() {
  const rows = await querySnowflake(
    `SELECT CURRENT_ROLE() AS ROLE, CURRENT_WAREHOUSE() AS WAREHOUSE, CURRENT_DATABASE() AS DB`,
  )
  return { role: rows[0]?.ROLE ?? null, warehouse: rows[0]?.WAREHOUSE ?? null }
}
