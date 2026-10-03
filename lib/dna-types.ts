/**
 * Risk DNA + Similar Investigations shapes (types and presentation metadata only).
 * Dimension meanings are taken from the INTEL.V_RISK_DNA view definition; nothing here scores,
 * ranks or compares profiles — similarity comes from INTEL.V_SIMILAR_CASE_SCORES as is.
 */

export interface DnaDimensionMeta {
  key: DnaKey
  label: string
  /** What the backend builds this dimension from (V_RISK_DNA definition). */
  meaning: string
  /** Evidence claim signal types whose WHY chain covers the same underlying feature. Empty = no WHY claim exists. */
  signalTypes: string[]
  /** RAW_FEATURES keys the backend builds this dimension from. */
  features: string[]
}

export type DnaKey = "transaction" | "velocity" | "geographic" | "network" | "merchant" | "historical" | "document"

export const DNA_DIMENSIONS: DnaDimensionMeta[] = [
  { key: "transaction", label: "Transaction", meaning: "Near-threshold activity: transactions just under the reporting threshold.", signalTypes: ["TRANSACTION_ANOMALY"], features: ["near_threshold"] },
  { key: "velocity", label: "Velocity", meaning: "How fast activity is happening compared with the entity's own baseline.", signalTypes: ["VELOCITY_ANOMALY"], features: ["velocity"] },
  { key: "geographic", label: "Geographic", meaning: "How dispersed activity is across locations.", signalTypes: ["GEOGRAPHIC_ANOMALY"], features: ["geo_dispersion"] },
  { key: "network", label: "Network", meaning: "Average of flagged-device exposure and high-risk counterparty exposure.", signalTypes: ["NETWORK_RELATIONSHIP_RISK", "DEVICE_CLUSTERING"], features: ["flagged_device", "high_risk_counterparty"] },
  { key: "merchant", label: "Merchant", meaning: "Recent changes to the merchant's profile (for example new branches or signatories).", signalTypes: ["MERCHANT_RISK"], features: ["profile_change"] },
  { key: "historical", label: "Historical", meaning: "Cross-border wire burst: deviation from the entity's own wire history.", signalTypes: [], features: ["cross_border_burst"] },
  { key: "document", label: "Document", meaning: "Share of the entity's evidence that is still missing.", signalTypes: [], features: [] },
]

export const FEATURE_LABEL: Record<string, string> = {
  near_threshold: "Near-threshold",
  velocity: "Velocity",
  geo_dispersion: "Geographic dispersion",
  flagged_device: "Flagged device",
  high_risk_counterparty: "High-risk counterparty",
  profile_change: "Profile change",
  cross_border_burst: "Cross-border burst",
  seasonality: "Seasonality",
}

export interface DnaSnapshot {
  dnaId: string
  asOf: string | null
  source: string
  relatedCaseId: string | null
  dims: Record<DnaKey, number | null>
  seasonality: number | null
  features: Record<string, number>
}

export interface RiskDna {
  entityId: string
  snapshots: DnaSnapshot[]
}

/** Characteristic flags from INTEL.V_SIMILAR_INVESTIGATION_INPUT, grouped for "Why similar?". */
export const CHARACTERISTICS: { col: string; label: string; group: "signals" | "relationships" }[] = [
  { col: "HAS_NEAR_THRESHOLD_PATTERN", label: "Near-threshold transactions", group: "signals" },
  { col: "HAS_CROSS_BORDER_WIRES", label: "Cross-border wires", group: "signals" },
  { col: "HAS_GEOGRAPHIC_ANOMALY", label: "Geographic anomaly", group: "signals" },
  { col: "HAS_PROFILE_CHANGE", label: "Profile change", group: "signals" },
  { col: "HAS_SEASONALITY", label: "Seasonal business", group: "signals" },
  { col: "HAS_SHARED_DEVICE", label: "Shared device", group: "relationships" },
  { col: "HAS_HIGH_RISK_COUNTERPARTY", label: "High-risk counterparty", group: "relationships" },
  { col: "USES_CORAL_BAY", label: "Wires to Coral Bay Trading", group: "relationships" },
]

export type Flags = Record<string, boolean | null>

export interface CaseEvidence {
  evidenceId: string
  type: string | null
  stance: string | null
  description: string | null
  source: string | null
  confidence: number | null
  verified: boolean | null
  collectedAt: string | null
}

export interface SimilarCase {
  caseId: string
  rank: number
  /** Backend cosine similarity of the 7-dimension Risk DNA profiles (0–1), exactly as returned. */
  similarity: number
  interpretationNote: string | null
  historicalEntityId: string
  historicalEntityName: string | null
  outcome: string | null
  typology: string | null
  keyIndicators: string | null
  decidingFactors: string | null
  openedAt: string | null
  closedAt: string | null
  summary: string | null
  riskScoreAtOpen: number | null
  dna: Record<DnaKey, number | null> | null
  dnaAsOf: string | null
  evidence: CaseEvidence[]
  /** Hop distance of the historical subject in the current entity's blast radius, if it appears there. */
  connectedHop: number | null
}

export interface SimilarCases {
  entityId: string
  subjectAsOf: string | null
  subjectDna: Record<DnaKey, number | null> | null
  methodology: string
  cases: SimilarCase[]
}

/**
 * Characteristic flags (INTEL.V_SIMILAR_INVESTIGATION_INPUT). Loaded separately because that view
 * is slow to compile; the case list never waits for it.
 */
export interface CaseCharacteristics {
  subject: Flags | null
  byCase: Record<string, { flags: Flags; signalTypes: string | null }>
}

export const OUTCOME_LABEL: Record<string, string> = {
  SAR_FILED: "Suspicious activity report filed",
  CLOSED_LEGITIMATE: "Closed — legitimate",
  CLOSED_INSUFFICIENT_EVIDENCE: "Closed — insufficient evidence",
  CLOSED_CONFIRMED_FRAUD: "Closed — confirmed fraud",
}

export const fmtDim = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2))
