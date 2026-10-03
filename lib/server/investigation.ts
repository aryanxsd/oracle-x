import "server-only"
import { querySnowflake } from "@/lib/snowflake"

/**
 * Read-only investigation data for one entity, straight from the frozen ORACLE X backend:
 *   CORE.ENTITY_NODES                    identity
 *   INTEL.V_ENTITY_RISK_INTELLIGENCE     score, band, 8 dimensions, contributions, v2 dedup
 *   INTEL.V_RISK_MODEL_CONFIG            dimension weights / formulas / policy references
 *   INTEL.EVIDENCE_SUMMARY_SNAPSHOT      per-claim evidence chain (WHY)
 *   INTEL.V_EVIDENCE_BALANCE             evidence posture and completeness
 *   INTEL.V_ENTITY_RISK_TIMELINE         Time Machine (30d / 14d / 7d / today, band changes)
 *   INTEL.EARLY_WARNING_EVENTS           important events
 * No score, band or evidence is computed here; values are only reshaped for display.
 */

export interface Identity {
  entityId: string
  type: string
  name: string
  staticRiskTier: string | null
  attributes: Record<string, unknown>
  isInvestigationSubject: boolean
}

export interface Dimension {
  key: string
  label: string
  weight: number | null
  score: number
  contribution: number
  /** Present only for the three dimensions the v2 double-counting rules adjust. */
  scoreDedup: number | null
  dedupRule: "R1" | "R2" | "R3" | null
  dedupApplied: boolean
  formula: string | null
  policyReference: string | null
}

export interface RiskSummary {
  scoreDate: string | null
  overall: number
  band: string
  /** Recommended action for the band, from INTEL.V_RISK_BAND_CONFIG. */
  bandAction: string | null
  overallDedup: number | null
  bandDedup: string | null
  dedupAdjustment: number | null
  explanation: string
  dedupExplanation: string | null
  bindingComponent: string | null
  dimensions: Dimension[]
}

export type { EvidenceBalance, EvidenceClaim } from "@/lib/evidence-types"
import type { EvidenceBalance, EvidenceClaim } from "@/lib/evidence-types"

export interface TimelinePoint {
  date: string
  windowLabel: string | null
  overall: number
  band: string
  overallDedup: number | null
  bandDedup: string | null
  bandChanged: boolean
  topDriver: string | null
  delta1d: number | null
}

export interface Timeline {
  points: TimelinePoint[]
  abnormalStart: string | null
  abnormalStartDedup: string | null
  abnormalBeforeTimelineStart: boolean
}

export interface WarningEvent {
  eventId: string
  type: string
  detectedAt: string | null
  severity: string
  headline: string
  details: string | null
  isLeadingIndicator: boolean
  relatedSignalIds: string[]
}

export interface Investigation {
  identity: Identity
  risk: RiskSummary | null
  balance: EvidenceBalance | null
  claims: EvidenceClaim[]
  timeline: Timeline | null
  events: WarningEvent[]
}

/** Display names and backend column mapping for the eight frozen risk dimensions. */
export const DIMENSIONS = [
  { key: "TRANSACTION_ANOMALY", label: "Transaction anomaly", score: "TRANSACTION_SCORE", contrib: "CONTRIB_TRANSACTION", dedup: null, rule: null },
  { key: "VELOCITY_ANOMALY", label: "Velocity", score: "VELOCITY_SCORE", contrib: "CONTRIB_VELOCITY", dedup: null, rule: null },
  { key: "GEOGRAPHIC_ANOMALY", label: "Geography", score: "GEOGRAPHIC_SCORE", contrib: "CONTRIB_GEOGRAPHIC", dedup: null, rule: null },
  { key: "DEVICE_CLUSTERING", label: "Device clustering", score: "DEVICE_SCORE", contrib: "CONTRIB_DEVICE", dedup: null, rule: null },
  { key: "MERCHANT_RISK", label: "Merchant profile", score: "MERCHANT_SCORE", contrib: "CONTRIB_MERCHANT", dedup: null, rule: null },
  { key: "HISTORICAL_DEVIATION", label: "Change vs history", score: "HISTORICAL_SCORE", contrib: "CONTRIB_HISTORICAL", dedup: "HISTORICAL_SCORE_DEDUP", rule: "R1", applied: "DEDUP_R1_APPLIED" },
  { key: "ACCOUNT_BEHAVIOR", label: "Account behaviour", score: "ACCOUNT_BEHAVIOR_SCORE", contrib: "CONTRIB_ACCOUNT_BEHAVIOR", dedup: "ACCOUNT_BEHAVIOR_SCORE_DEDUP", rule: "R2", applied: "DEDUP_R2_APPLIED" },
  { key: "NETWORK_RELATIONSHIP_RISK", label: "Network relationships", score: "NETWORK_SCORE", contrib: "CONTRIB_NETWORK", dedup: "NETWORK_SCORE_DEDUP", rule: "R3", applied: "DEDUP_R3_APPLIED" },
] as const

function toIso(v: unknown): string | null {
  if (v == null || v === "") return null
  return v instanceof Date ? v.toISOString() : String(v)
}
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v))
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v))

export async function getIdentity(entityId: string): Promise<Identity | null> {
  const rows = await querySnowflake(
    `SELECT n.node_id, n.entity_type, n.display_name, n.risk_tier, n.attributes,
            IFF(s.entity_id IS NULL, FALSE, TRUE) AS is_subject
       FROM ORACLE_X.CORE.ENTITY_NODES n
       LEFT JOIN ORACLE_X.INTEL.INVESTIGATION_SUBJECTS s ON s.entity_id = n.node_id
      WHERE n.node_id = ?`,
    { binds: [entityId] },
  )
  const r = rows[0]
  if (!r) return null
  const attrs = typeof r.ATTRIBUTES === "string" ? JSON.parse(r.ATTRIBUTES) : (r.ATTRIBUTES ?? {})
  return {
    entityId: r.NODE_ID,
    type: r.ENTITY_TYPE,
    name: r.DISPLAY_NAME,
    staticRiskTier: str(r.RISK_TIER),
    attributes: attrs,
    isInvestigationSubject: Boolean(r.IS_SUBJECT),
  }
}

export async function getRiskSummary(entityId: string): Promise<RiskSummary | null> {
  const [rows, model, bands] = await Promise.all([
    querySnowflake(`SELECT * FROM ORACLE_X.INTEL.V_ENTITY_RISK_INTELLIGENCE WHERE entity_id = ?`, { binds: [entityId] }),
    querySnowflake(`SELECT dimension, weight, formula, policy_reference FROM ORACLE_X.INTEL.V_RISK_MODEL_CONFIG`),
    querySnowflake(`SELECT band, action FROM ORACLE_X.INTEL.V_RISK_BAND_CONFIG`),
  ])
  const r = rows[0]
  if (!r) return null
  const cfg = new Map(model.map((m) => [String(m.DIMENSION), m]))
  const actions = new Map(bands.map((b) => [String(b.BAND), String(b.ACTION)]))
  return {
    scoreDate: toIso(r.SCORE_DATE)?.slice(0, 10) ?? null,
    overall: Number(r.OVERALL_SCORE),
    band: String(r.RISK_BAND),
    bandAction: actions.get(String(r.RISK_BAND)) ?? null,
    overallDedup: num(r.OVERALL_SCORE_DEDUP),
    bandDedup: str(r.RISK_BAND_DEDUP),
    dedupAdjustment: num(r.DEDUP_ADJUSTMENT_POINTS),
    explanation: String(r.EXPLANATION ?? ""),
    dedupExplanation: str(r.DEDUP_EXPLANATION),
    bindingComponent: str(r.BINDING_TRANSACTION_COMPONENT),
    dimensions: DIMENSIONS.map((d) => {
      const c = cfg.get(d.key)
      return {
        key: d.key,
        label: d.label,
        weight: num(c?.WEIGHT),
        score: Number(r[d.score]),
        contribution: Number(r[d.contrib]),
        scoreDedup: d.dedup ? num(r[d.dedup]) : null,
        dedupRule: d.rule,
        dedupApplied: "applied" in d ? Boolean(r[d.applied]) : false,
        formula: str(c?.FORMULA),
        policyReference: str(c?.POLICY_REFERENCE),
      }
    }),
  }
}

export async function getEvidence(entityId: string): Promise<{ claims: EvidenceClaim[]; balance: EvidenceBalance | null }> {
  const [claims, bal] = await Promise.all([
    querySnowflake(
      `SELECT claim_id, evidence_origin, signal_type, risk_claim, observed_value, baseline_value, value_unit, calculation,
              policy_reference, document_reference, supporting_evidence, contradicting_evidence, missing_evidence,
              source_tables, source_record_ids, source_record_count, detected_at
         FROM ORACLE_X.INTEL.EVIDENCE_SUMMARY_SNAPSHOT WHERE entity_id = ?
        ORDER BY evidence_origin, signal_type, claim_id`,
      { binds: [entityId] },
    ),
    querySnowflake(`SELECT * FROM ORACLE_X.INTEL.V_EVIDENCE_BALANCE WHERE entity_id = ?`, { binds: [entityId] }),
  ])
  const b = bal[0]
  return {
    claims: claims.map((c) => ({
      claimId: c.CLAIM_ID,
      origin: c.EVIDENCE_ORIGIN,
      signalType: c.SIGNAL_TYPE,
      claim: c.RISK_CLAIM,
      observed: num(c.OBSERVED_VALUE),
      baseline: num(c.BASELINE_VALUE),
      unit: str(c.VALUE_UNIT),
      calculation: str(c.CALCULATION),
      policyReference: str(c.POLICY_REFERENCE),
      documentReference: str(c.DOCUMENT_REFERENCE),
      supporting: str(c.SUPPORTING_EVIDENCE),
      contradicting: str(c.CONTRADICTING_EVIDENCE),
      missing: str(c.MISSING_EVIDENCE),
      sourceTables: str(c.SOURCE_TABLES),
      sourceRecordIds: str(c.SOURCE_RECORD_IDS),
      sourceRecordCount: num(c.SOURCE_RECORD_COUNT),
      detectedAt: toIso(c.DETECTED_AT),
    })),
    balance: b
      ? {
          supporting: Number(b.SUPPORTING_COUNT),
          contradicting: Number(b.CONTRADICTING_COUNT),
          neutral: Number(b.NEUTRAL_COUNT),
          missing: Number(b.MISSING_EVIDENCE_COUNT),
          supportingWeight: Number(b.SUPPORTING_WEIGHT),
          contradictingWeight: Number(b.CONTRADICTING_WEIGHT),
          netPosition: Number(b.NET_EVIDENCE_POSITION),
          posture: String(b.EVIDENCE_POSTURE),
          uncertainty: String(b.UNCERTAINTY_LEVEL),
        }
      : null,
  }
}

export async function getTimeline(entityId: string): Promise<Timeline | null> {
  const rows = await querySnowflake(
    `SELECT score_date, window_label, overall_score, risk_band, overall_score_dedup, risk_band_dedup, band_changed,
            top_driver, score_delta_1d, abnormal_behavior_start, abnormal_behavior_start_dedup, abnormal_before_timeline_start
       FROM ORACLE_X.INTEL.V_ENTITY_RISK_TIMELINE WHERE entity_id = ? ORDER BY score_date`,
    { binds: [entityId] },
  )
  if (!rows.length) return null
  const last = rows[rows.length - 1]
  return {
    points: rows.map((r) => ({
      date: toIso(r.SCORE_DATE)!.slice(0, 10),
      windowLabel: str(r.WINDOW_LABEL),
      overall: Number(r.OVERALL_SCORE),
      band: String(r.RISK_BAND),
      overallDedup: num(r.OVERALL_SCORE_DEDUP),
      bandDedup: str(r.RISK_BAND_DEDUP),
      bandChanged: Boolean(r.BAND_CHANGED),
      topDriver: str(r.TOP_DRIVER),
      delta1d: num(r.SCORE_DELTA_1D),
    })),
    abnormalStart: toIso(last.ABNORMAL_BEHAVIOR_START)?.slice(0, 10) ?? null,
    abnormalStartDedup: toIso(last.ABNORMAL_BEHAVIOR_START_DEDUP)?.slice(0, 10) ?? null,
    abnormalBeforeTimelineStart: Boolean(last.ABNORMAL_BEFORE_TIMELINE_START),
  }
}

export async function getEvents(entityId: string): Promise<WarningEvent[]> {
  const rows = await querySnowflake(
    `SELECT event_id, event_type, detected_at, severity, headline, details, is_leading_indicator, related_signal_ids
       FROM ORACLE_X.INTEL.EARLY_WARNING_EVENTS WHERE entity_id = ? ORDER BY detected_at LIMIT 50`,
    { binds: [entityId] },
  )
  return rows.map((r) => ({
    eventId: r.EVENT_ID,
    type: r.EVENT_TYPE,
    detectedAt: toIso(r.DETECTED_AT),
    severity: String(r.SEVERITY),
    headline: String(r.HEADLINE),
    details: str(r.DETAILS),
    isLeadingIndicator: Boolean(r.IS_LEADING_INDICATOR),
    relatedSignalIds: str(r.RELATED_SIGNAL_IDS)?.split(/\s*,\s*/).filter(Boolean) ?? [],
  }))
}

/** Everything the investigation screen needs; null when the entity does not exist. */
export async function getInvestigation(entityId: string): Promise<Investigation | null> {
  const identity = await getIdentity(entityId)
  if (!identity) return null
  const [risk, evidence, timeline, events] = await Promise.all([
    getRiskSummary(entityId),
    getEvidence(entityId),
    getTimeline(entityId),
    getEvents(entityId),
  ])
  return { identity, risk, balance: evidence.balance, claims: evidence.claims, timeline, events }
}
