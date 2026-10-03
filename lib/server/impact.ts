import "server-only"
import { querySnowflake } from "@/lib/snowflake"
import { cached, invalidate } from "@/lib/server/cache"
import type { BlastRadius, Scenario, ScenarioSet } from "@/lib/impact-types"

/**
 * Blast radius + scenarios, read from the frozen backend only:
 *   INTEL.BLAST_RADIUS_CACHE         precomputed summary metrics and impacted entities (latest computation)
 *   CORE.ENTITY_NODES                display names of impacted entities
 *   CASES.SCENARIO_RUNS              stored DO_NOTHING / MONITOR / BLOCK results (latest run)
 *   AGENTS.TOOL_RUN_SCENARIOS        re-runs the deterministic scenario comparison on explicit request
 * No impact or scenario value is computed here.
 */
const TTL = 5 * 60_000
const toIso = (v: unknown) => (v == null || v === "" ? null : v instanceof Date ? v.toISOString() : String(v))
const num = (v: unknown) => (v == null || v === "" ? null : Number(v))
const obj = (v: unknown): Record<string, unknown> => {
  if (v == null) return {}
  if (typeof v === "string") {
    try {
      return JSON.parse(v)
    } catch {
      return {}
    }
  }
  return v as Record<string, unknown>
}

export function getBlastRadius(entityId: string): Promise<BlastRadius | null> {
  return cached(`blast:${entityId}`, TTL, async () => {
    const rows = await querySnowflake(
      `SELECT b.record_kind, b.computed_at, b.max_depth, b.model_version, b.window_start, b.window_end, b.methodology,
              b.metric_name, b.metric_value, b.impacted_entity_id, b.impacted_entity_type, b.hop_distance, b.path,
              b.exposure_usd, b.impact_score, n.display_name
         FROM ORACLE_X.INTEL.BLAST_RADIUS_CACHE b
         LEFT JOIN ORACLE_X.CORE.ENTITY_NODES n ON n.node_id = b.impacted_entity_id
        WHERE b.root_entity_id = ?
      QUALIFY b.computed_at = MAX(b.computed_at) OVER (PARTITION BY b.record_kind)
        ORDER BY b.record_kind, b.hop_distance, b.impact_score DESC NULLS LAST, b.exposure_usd DESC NULLS LAST, b.impacted_entity_id`,
      { binds: [entityId] },
    )
    if (!rows.length) return null
    const metrics = rows.filter((r) => r.RECORD_KIND === "SUMMARY_METRIC")
    const ents = rows.filter((r) => r.RECORD_KIND === "IMPACTED_ENTITY")
    const any = metrics[0] ?? rows[0]
    return {
      rootId: entityId,
      computedAt: toIso(any.COMPUTED_AT),
      windowStart: toIso(any.WINDOW_START),
      windowEnd: toIso(any.WINDOW_END),
      maxDepth: num(any.MAX_DEPTH),
      modelVersion: any.MODEL_VERSION ?? null,
      entityMethodology: ents[0]?.METHODOLOGY ?? null,
      metrics: metrics.map((m) => ({ name: String(m.METRIC_NAME), value: Number(m.METRIC_VALUE), methodology: m.METHODOLOGY ?? null })),
      entities: ents.map((e) => ({
        id: String(e.IMPACTED_ENTITY_ID),
        type: String(e.IMPACTED_ENTITY_TYPE),
        name: e.DISPLAY_NAME ?? null,
        hop: Number(e.HOP_DISTANCE),
        path: e.PATH ?? null,
        exposureUsd: num(e.EXPOSURE_USD),
        impactScore: num(e.IMPACT_SCORE),
      })),
    }
  })
}

function toScenarioSet(entityId: string, rows: Record<string, unknown>[]): ScenarioSet {
  const params = obj(rows[0]?.PARAMETERS)
  const runOf = (id: unknown) => String(id ?? "").replace(/-(DO_NOTHING|MONITOR|BLOCK)$/, "")
  return {
    entityId,
    runId: rows[0] ? runOf(rows[0].SCENARIO_RUN_ID) : null,
    runAt: toIso(rows[0]?.RUN_AT),
    runBy: (rows[0]?.RUN_BY as string) ?? null,
    assumptions: typeof params.assumptions === "string" ? params.assumptions : null,
    windowStart: toIso(params.window_start),
    windowEnd: toIso(params.window_end),
    horizonDays: num(params.horizon_days),
    provenance: null,
    baseline: null,
    scenarios: rows.map(
      (r): Scenario => ({
        name: String(r.SCENARIO_NAME),
        runId: String(r.SCENARIO_RUN_ID),
        narrative: (r.NARRATIVE as string) ?? null,
        metrics: obj(r.IMPACTED_SIGNALS),
        baselineRiskScore: num(r.BASELINE_RISK_SCORE),
        simulatedRiskScore: num(r.SIMULATED_RISK_SCORE),
        delta: num(r.DELTA),
      }),
    ),
  }
}

/** The most recent stored scenario run for the entity (all scenarios written by that run). */
export function getLatestScenarios(entityId: string): Promise<ScenarioSet | null> {
  return cached(`scenarios:${entityId}`, TTL, async () => {
    const rows = await querySnowflake(
      `SELECT scenario_run_id, scenario_name, parameters, baseline_risk_score, simulated_risk_score, delta, impacted_signals, narrative, run_at, run_by
         FROM ORACLE_X.CASES.SCENARIO_RUNS
        WHERE entity_id = ?
      QUALIFY run_at = MAX(run_at) OVER ()
        ORDER BY scenario_name`,
      { binds: [entityId] },
    )
    return rows.length ? toScenarioSet(entityId, rows) : null
  })
}

export class ScenarioRejected extends Error {
  status = 400
}

/** One run at a time per entity in this process: the tool writes to CASES.SCENARIO_RUNS. */
const inflight = new Map<string, Promise<ScenarioSet>>()

export function _resetScenarioRuns() {
  inflight.clear()
}

/**
 * Re-runs AGENTS.TOOL_RUN_SCENARIOS (explicit user action only). The backend generates the run id
 * and stores the three scenarios in CASES.SCENARIO_RUNS; concurrent requests share one call.
 */
export function runScenarios(entityId: string): Promise<ScenarioSet> {
  const held = inflight.get(entityId)
  if (held) return held
  const p = (async () => {
    const rows = await querySnowflake("CALL ORACLE_X.AGENTS.TOOL_RUN_SCENARIOS(?, ?)", { binds: [entityId, ""] })
    const raw = rows[0] ? Object.values(rows[0])[0] : null
    const res = typeof raw === "string" ? JSON.parse(raw) : raw
    if (res?.status === "REJECTED") throw new ScenarioRejected(String(res.reason ?? "Scenarios are not available for this entity"))
    if (!res || res.status !== "OK") throw new Error("Unexpected scenario tool response")
    invalidate(`scenarios:${entityId}`)
    const stored = await getLatestScenarios(entityId)
    const base: ScenarioSet = stored ?? toScenarioSet(entityId, [])
    return { ...base, runId: String(res.run_id ?? base.runId), assumptions: res.assumptions ?? base.assumptions, provenance: res.provenance ?? null, baseline: obj(res.baseline) }
  })()
  inflight.set(entityId, p)
  p.finally(() => inflight.delete(entityId)).catch(() => {})
  return p
}
