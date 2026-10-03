/**
 * Presentation-only styling for risk bands and provenance labels.
 * Band membership and thresholds always come from the backend
 * (INTEL.V_RISK_BAND_CONFIG); this file only decides colours and wording.
 */

export type RiskBand = "CRITICAL" | "ELEVATED" | "WATCH" | "NORMAL"

export const BAND_STYLE: Record<RiskBand, { label: string; dot: string; chip: string; plain: string }> = {
  CRITICAL: { label: "Critical", dot: "bg-band-critical", chip: "bg-band-critical/12 text-band-critical ring-band-critical/30", plain: "Act now" },
  ELEVATED: { label: "Elevated", dot: "bg-band-elevated", chip: "bg-band-elevated/12 text-band-elevated ring-band-elevated/30", plain: "Investigate" },
  WATCH: { label: "Watch", dot: "bg-band-watch", chip: "bg-band-watch/15 text-band-watch-fg ring-band-watch/35", plain: "Keep an eye on" },
  NORMAL: { label: "Normal", dot: "bg-band-normal", chip: "bg-band-normal/12 text-band-normal ring-band-normal/30", plain: "No concern" },
}

export function asBand(v: string | null | undefined): RiskBand | null {
  const u = (v ?? "").toUpperCase()
  return u in BAND_STYLE ? (u as RiskBand) : null
}

/** One row of INTEL.V_RISK_BAND_CONFIG (lower inclusive, upper exclusive). */
export interface BandRange {
  band: string
  lower: number
  upper: number
  action: string | null
}

/**
 * Colour lookup against the backend-supplied band ranges. Used only to tint dimension bars; an
 * entity's actual band is always the backend's RISK_BAND column, never this function.
 */
export function bandForScore(score: number, bands: BandRange[]): RiskBand | null {
  const b = bands.find((r) => score >= r.lower && score < r.upper)
  return asBand(b?.band)
}

export type Provenance = "FACT" | "MODEL OUTPUT" | "NARRATIVE EVIDENCE" | "POLICY" | "SCENARIO OUTPUT"

export const PROVENANCE_STYLE: Record<Provenance, { short: string; help: string; chip: string }> = {
  FACT: { short: "Fact", help: "Taken directly from bank records", chip: "bg-slate-900/5 text-slate-700 ring-slate-900/10 dark:bg-white/10 dark:text-slate-200" },
  "MODEL OUTPUT": { short: "Model", help: "Calculated by the ORACLE X risk model", chip: "bg-indigo-500/10 text-indigo-700 ring-indigo-500/20 dark:text-indigo-300" },
  "NARRATIVE EVIDENCE": { short: "Narrative", help: "Analyst notes, KYC reviews or SAR narratives", chip: "bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300" },
  POLICY: { short: "Policy", help: "A rule from the (fictional) SFCA rulebook", chip: "bg-teal-500/10 text-teal-800 ring-teal-500/25 dark:text-teal-300" },
  "SCENARIO OUTPUT": { short: "Scenario", help: "A projection under stated assumptions — not a prediction", chip: "bg-fuchsia-500/10 text-fuchsia-800 ring-fuchsia-500/25 dark:text-fuchsia-300" },
}

/** The council pipeline, in the order the backend executes it. */
export const COUNCIL_STAGES = [
  { key: "INVESTIGATOR", label: "Investigator", role: "Gathers the facts" },
  { key: "RISK_ANALYST", label: "Risk Analyst", role: "Checks the risk score" },
  { key: "COMPLIANCE", label: "Compliance", role: "Maps to policy" },
  { key: "SKEPTIC", label: "Skeptic", role: "Challenges everything" },
  { key: "SCENARIO", label: "Scenario", role: "Compares actions" },
  { key: "ORACLE", label: "ORACLE", role: "Writes the finding" },
] as const
