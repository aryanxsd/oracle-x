/**
 * Pure helpers for the Decision Brief. They only select and reorder backend values that the existing
 * readers already return — nothing here scores, classifies or writes conclusions.
 */
import { parseReport, type ReportSection } from "@/lib/case-types"
import type { EvidenceBalance } from "@/lib/evidence-types"
import type { Dimension } from "@/lib/server/investigation"
import { SCENARIO_METRIC_META } from "@/lib/impact-types"

/**
 * Strongest contributors by backend contribution (points added to the overall score), plus every
 * dimension the backend's v2 double-counting rules actually adjusted — those adjustments are what
 * separate the standard and adjusted scores, so they are always shown.
 */
export function topContributors(dims: Dimension[], n = 4): Dimension[] {
  const adjusted = (d: Dimension) => d.scoreDedup != null && d.dedupApplied && Math.abs(d.scoreDedup - d.score) > 0.005
  const byPoints = [...dims].filter((d) => d.contribution > 0).sort((a, b) => b.contribution - a.contribution)
  const top = byPoints.slice(0, n)
  return [...top, ...byPoints.slice(n).filter(adjusted), ...dims.filter((d) => d.contribution <= 0 && adjusted(d))]
}

/**
 * "Mixed" only when the backend itself says so: posture CONTESTED, or at least as many contradicting
 * items as supporting ones in V_EVIDENCE_BALANCE.
 */
export function isMixedEvidence(b: EvidenceBalance | null | undefined): boolean {
  if (!b) return false
  return b.posture?.toUpperCase() === "CONTESTED" || (b.contradicting > 0 && b.contradicting >= b.supporting)
}

/** Sections 7 (unresolved questions) and 8 (final finding) of the stored council report, matched by number or title. */
export function councilSections(finalResponse: string | null | undefined): { finding: ReportSection | null; unresolved: ReportSection | null } {
  const { sections } = parseReport(finalResponse)
  const pick = (num: number, re: RegExp) => sections.find((s) => re.test(s.title)) ?? sections.find((s) => s.number === num) ?? null
  return { finding: pick(8, /final|finding/i), unresolved: pick(7, /unresolved|open question/i) }
}

/** The headline scenario metrics present on a scenario, in the simulator's own label order. */
export function headlineScenarioMetrics(metrics: Record<string, unknown>, n = 3): { key: string; label: string; usd: boolean; value: unknown }[] {
  return Object.entries(SCENARIO_METRIC_META)
    .filter(([k, m]) => !m.text && metrics[k] != null && metrics[k] !== "")
    .slice(0, n)
    .map(([k, m]) => ({ key: k, label: m.label, usd: !!m.usd, value: metrics[k] }))
}
