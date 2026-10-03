/**
 * Evidence shapes shared by the server evidence layer and client components (types and pure
 * presentation helpers only — no data access). Field names map 1:1 to
 * INTEL.EVIDENCE_SUMMARY_SNAPSHOT / V_EVIDENCE_BALANCE / EVIDENCE_CHAIN_SNAPSHOT columns.
 */
import type { Provenance } from "@/lib/risk-style"

export interface EvidenceClaim {
  claimId: string
  origin: "ENGINE_DIMENSION" | "SEEDED_SIGNAL" | string
  signalType: string
  claim: string
  observed: number | null
  baseline: number | null
  unit: string | null
  calculation: string | null
  policyReference: string | null
  documentReference: string | null
  supporting: string | null
  contradicting: string | null
  missing: string | null
  sourceTables: string | null
  sourceRecordIds: string | null
  sourceRecordCount: number | null
  detectedAt: string | null
  /** From INTEL.RISK_SIGNALS for SEEDED_SIGNAL claims (claim_id = signal_id); null otherwise. */
  status?: string | null
  severity?: string | null
  score?: number | null
}

export interface EvidenceBalance {
  supporting: number
  contradicting: number
  neutral: number
  missing: number
  supportingWeight: number
  contradictingWeight: number
  netPosition: number
  posture: string
  uncertainty: string
}

/** One source record behind a claim (TOOL_GET_EVIDENCE DETAIL → EVIDENCE_CHAIN_SNAPSHOT). */
export interface ClaimSourceRecord {
  sourceTable: string | null
  sourceRecordId: string | null
  supporting: string | null
  counter: string | null
  missing: string | null
}

export interface ClaimDetail {
  claimId: string
  records: ClaimSourceRecord[]
  rowsMatching: number
  rowsReturned: number
  source: string | null
  provenance: string | null
}

/**
 * Provenance of a single evidence reference, by what it points at. This follows the backend's own
 * statement (TOOL_GET_EVIDENCE.provenance): analyst notes are NARRATIVE EVIDENCE, SFCA policy text is
 * POLICY, records in bank tables are FACT.
 */
export function refProvenance(ref: string): Provenance {
  if (/^SFCA-/i.test(ref)) return "POLICY"
  if (/ANALYST_NOTES|NARRATIVE|SAR_NARRATIVE/i.test(ref)) return "NARRATIVE EVIDENCE"
  return "FACT"
}

/** Entity ids mentioned in a reference that the graph can be centred through (accounts, customers, devices...). */
export function refEntityIds(ref: string, exclude?: string): string[] {
  const ids = ref.match(/\b(?:IP|M|C|D|B|L|W|A)\d{3,5}\b/g) ?? []
  return [...new Set(ids)].filter((i) => i !== exclude)
}
