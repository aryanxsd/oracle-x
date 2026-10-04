/**
 * Blast-radius and scenario shapes shared by server and client (types + presentation metadata only).
 * Every value is a backend value from INTEL.BLAST_RADIUS_CACHE, CASES.SCENARIO_RUNS or
 * AGENTS.TOOL_RUN_SCENARIOS; nothing here computes impact or scenario results.
 */
import type { Provenance } from "@/lib/risk-style"

export interface BlastMetric {
  name: string
  value: number
  methodology: string | null
}

export interface ImpactedEntity {
  id: string
  type: string
  name: string | null
  hop: number
  path: string | null
  exposureUsd: number | null
  impactScore: number | null
}

export interface BlastRadius {
  rootId: string
  computedAt: string | null
  windowStart: string | null
  windowEnd: string | null
  maxDepth: number | null
  modelVersion: string | null
  entityMethodology: string | null
  metrics: BlastMetric[]
  entities: ImpactedEntity[]
}

export type ScenarioName = "DO_NOTHING" | "MONITOR" | "BLOCK"
export const SCENARIO_ORDER: ScenarioName[] = ["DO_NOTHING", "MONITOR", "BLOCK"]

export interface Scenario {
  name: string
  runId: string
  narrative: string | null
  metrics: Record<string, unknown>
  baselineRiskScore: number | null
  simulatedRiskScore: number | null
  delta: number | null
}

export interface ScenarioSet {
  entityId: string
  runId: string | null
  runAt: string | null
  runBy: string | null
  assumptions: string | null
  windowStart: string | null
  windowEnd: string | null
  horizonDays: number | null
  provenance: string | null
  /** Observed baseline returned by the tool; only present right after a run (it is not stored in SCENARIO_RUNS). */
  baseline: Record<string, unknown> | null
  scenarios: Scenario[]
}

/** Plain-language labels for blast-radius summary metrics; provenance follows each metric's methodology text. */
export const BLAST_METRIC_META: Record<string, { label: string; usd?: boolean; kind: Provenance; tier: "direct" | "indirect" | "exposure" }> = {
  customers_affected: { label: "Customers", kind: "FACT", tier: "direct" },
  direct_accounts: { label: "Accounts (direct)", kind: "FACT", tier: "direct" },
  transactions_affected: { label: "Transactions", kind: "FACT", tier: "direct" },
  devices_affected: { label: "Devices", kind: "FACT", tier: "direct" },
  indirect_accounts: { label: "Accounts (indirect)", kind: "FACT", tier: "indirect" },
  merchants_connected: { label: "Connected merchants", kind: "FACT", tier: "indirect" },
  transaction_volume_exposure: { label: "Card transaction volume", usd: true, kind: "FACT", tier: "exposure" },
  wire_volume_exposure: { label: "Outbound wire volume", usd: true, kind: "FACT", tier: "exposure" },
  risk_exposure: { label: "Amount at risk", usd: true, kind: "MODEL OUTPUT", tier: "exposure" },
}

/** Plain-language labels for TOOL_RUN_SCENARIOS metric keys. Unknown keys are still shown, humanised. */
export const SCENARIO_METRIC_META: Record<string, { label: string; usd?: boolean; text?: boolean; kind: Provenance }> = {
  amount_at_risk_next_30d_usd: { label: "Amount at risk, next 30 days", usd: true, kind: "SCENARIO OUTPUT" },
  amount_at_risk_prevented_usd: { label: "Amount at risk prevented", usd: true, kind: "SCENARIO OUTPUT" },
  amount_at_risk_under_enhanced_monitoring_usd: { label: "Amount at risk under enhanced monitoring", usd: true, kind: "SCENARIO OUTPUT" },
  legitimate_customers_disrupted: { label: "Customers with no risk flags disrupted", kind: "SCENARIO OUTPUT" },
  risk_flagged_customers_blocked: { label: "Risk-flagged customers blocked", kind: "SCENARIO OUTPUT" },
  legitimate_volume_disrupted_usd: { label: "Legitimate-looking volume disrupted", usd: true, kind: "SCENARIO OUTPUT" },
  legitimate_card_volume_disrupted_usd: { label: "…of which card volume", usd: true, kind: "SCENARIO OUTPUT" },
  documented_supplier_wires_blocked_usd: { label: "…of which documented supplier wires", usd: true, kind: "SCENARIO OUTPUT" },
  evidence_gaps_addressed: { label: "Evidence gaps addressed", kind: "SCENARIO OUTPUT" },
  open_evidence_gaps: { label: "Open evidence gaps today", kind: "MODEL OUTPUT" },
  high_or_critical_dimensions: { label: "Risk dimensions scoring 50 or more", kind: "MODEL OUTPUT" },
  evidence_posture: { label: "Evidence posture", text: true, kind: "MODEL OUTPUT" },
  policy_alignment: { label: "Policy alignment", text: true, kind: "POLICY" },
}

export const BASELINE_META: Record<string, { label: string; usd?: boolean; text?: boolean; kind: Provenance }> = {
  card_volume_30d_usd: { label: "Card volume, last 30 days", usd: true, kind: "FACT" },
  risk_flagged_card_volume_30d_usd: { label: "Risk-flagged card volume", usd: true, kind: "FACT" },
  high_risk_jurisdiction_wires_30d_usd: { label: "Wires to high-risk jurisdictions", usd: true, kind: "FACT" },
  documented_supplier_wires_30d_usd: { label: "Wires to documented suppliers", usd: true, kind: "FACT" },
  amount_at_risk_30d_usd: { label: "Amount at risk, last 30 days", usd: true, kind: "MODEL OUTPUT" },
  risk_score: { label: "Risk score", kind: "MODEL OUTPUT" },
  risk_band: { label: "Risk band", text: true, kind: "MODEL OUTPUT" },
  evidence_posture: { label: "Evidence posture", text: true, kind: "MODEL OUTPUT" },
  open_evidence_gaps: { label: "Open evidence gaps", kind: "MODEL OUTPUT" },
}

export const SCENARIO_LABEL: Record<string, { label: string; action: string }> = {
  DO_NOTHING: { label: "Do nothing", action: "No action taken" },
  MONITOR: { label: "Monitor", action: "Keep the case open, monitor closely, request missing documents" },
  BLOCK: { label: "Block", action: "Suspend merchant settlement and stored-value sales" },
}

/**
 * Whole-dollar USD by default. With `cents`, a value that has a fractional part keeps exactly two
 * decimals (1234.56 → "$1,234.56"); whole values still render without decimals.
 */
export function fmtUsd(v: unknown, opts: { cents?: boolean } = {}): string {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return "—"
  const digits = opts.cents && !Number.isInteger(n) ? 2 : 0
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtCount(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"
}
