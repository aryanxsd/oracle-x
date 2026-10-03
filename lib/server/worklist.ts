import "server-only"
import { querySnowflake } from "@/lib/snowflake"

/**
 * Investigation worklist: investigation subjects plus the highest-scored entities from the
 * frozen risk engine, with each entity's latest council run. Ordering is by the backend score.
 */
export interface WorklistItem {
  entityId: string
  name: string
  type: string
  score: number
  band: string
  scoreDedup: number | null
  bandDedup: string | null
  isSubject: boolean
  lastRunId: string | null
  lastRunStatus: string | null
  lastRunAt: string | null
}

const toIso = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v))

export async function getWorklist(limit = 12): Promise<WorklistItem[]> {
  const rows = await querySnowflake(
    `WITH runs AS (
       SELECT entity_id, council_run_id, status, started_at
         FROM ORACLE_X.CASES.COUNCIL_RUNS
        WHERE execution_mode = 'PHASED_ASYNC'
        QUALIFY ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY started_at DESC) = 1)
     SELECT r.entity_id, n.display_name, n.entity_type, r.overall_score, r.risk_band, r.overall_score_dedup, r.risk_band_dedup,
            s.entity_id IS NOT NULL AS is_subject, runs.council_run_id, runs.status AS run_status, runs.started_at AS run_at
       FROM ORACLE_X.INTEL.V_ENTITY_RISK_INTELLIGENCE r
       JOIN ORACLE_X.CORE.ENTITY_NODES n ON n.node_id = r.entity_id
       LEFT JOIN ORACLE_X.INTEL.INVESTIGATION_SUBJECTS s ON s.entity_id = r.entity_id
       LEFT JOIN runs ON runs.entity_id = r.entity_id
      ORDER BY is_subject DESC, r.overall_score DESC
      LIMIT ?`,
    { binds: [Math.min(Math.max(limit, 1), 50)] },
  )
  return rows.map((r) => ({
    entityId: r.ENTITY_ID,
    name: r.DISPLAY_NAME,
    type: r.ENTITY_TYPE,
    score: Number(r.OVERALL_SCORE),
    band: String(r.RISK_BAND),
    scoreDedup: r.OVERALL_SCORE_DEDUP == null ? null : Number(r.OVERALL_SCORE_DEDUP),
    bandDedup: r.RISK_BAND_DEDUP ?? null,
    isSubject: Boolean(r.IS_SUBJECT),
    lastRunId: r.COUNCIL_RUN_ID ?? null,
    lastRunStatus: r.RUN_STATUS ?? null,
    lastRunAt: toIso(r.RUN_AT),
  }))
}
