import "server-only"
import { querySnowflake } from "@/lib/snowflake"
import { cached } from "@/lib/server/cache"
import { getEvidence } from "@/lib/server/investigation"
import type { ClaimDetail, EvidenceBalance, EvidenceClaim } from "@/lib/evidence-types"

/**
 * The single server-side evidence layer used by the Evidence page, the Investigation page and
 * /api/evidence. It reads the frozen backend only:
 *   INTEL.EVIDENCE_SUMMARY_SNAPSHOT   one row per claim (claim, data, calculation, policy, source, for/against/missing)
 *   INTEL.V_EVIDENCE_BALANCE          backend counts, weights, posture, uncertainty
 *   INTEL.RISK_SIGNALS                status / severity / score of each seeded signal
 *   AGENTS.TOOL_GET_EVIDENCE (DETAIL) per-claim source records, fetched only when a user asks for them
 * Nothing is classified or scored here.
 */
const TTL = 5 * 60_000

export interface EvidenceOverview {
  claims: EvidenceClaim[]
  balance: EvidenceBalance | null
}

export function getEvidenceOverview(entityId: string): Promise<EvidenceOverview> {
  return cached(`evidence:${entityId}`, TTL, async () => {
    const [ev, signals] = await Promise.all([
      getEvidence(entityId),
      querySnowflake(`SELECT signal_id, signal_status, severity, score FROM ORACLE_X.INTEL.RISK_SIGNALS WHERE entity_id = ?`, { binds: [entityId] }),
    ])
    const byId = new Map(signals.map((s) => [String(s.SIGNAL_ID), s]))
    return {
      balance: ev.balance,
      claims: ev.claims.map((c) => {
        const s = byId.get(c.claimId)
        return { ...c, status: s ? String(s.SIGNAL_STATUS) : null, severity: s?.SEVERITY == null ? null : String(s.SEVERITY), score: s?.SCORE == null ? null : Number(s.SCORE) }
      }),
    }
  })
}

export class ClaimNotFound extends Error {
  status = 404
  constructor() {
    super("Claim not found")
  }
}

/**
 * Source records behind one claim, via the backend tool at DETAIL level. The claim must belong to the
 * entity (checked against the summary), and the tool is filtered by that claim's own signal type, so
 * no user text reaches the procedure beyond a validated entity id.
 */
export async function getClaimDetail(entityId: string, claimId: string): Promise<ClaimDetail> {
  const { claims } = await getEvidenceOverview(entityId)
  const claim = claims.find((c) => c.claimId === claimId)
  if (!claim) throw new ClaimNotFound()
  return cached(`claim:${entityId}:${claimId}`, TTL, async () => {
    const rows = await querySnowflake("CALL ORACLE_X.AGENTS.TOOL_GET_EVIDENCE(?, 'DETAIL', ?, 100)", { binds: [entityId, claim.signalType] })
    const raw = rows[0] ? Object.values(rows[0])[0] : null
    const res = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!res || (res.status !== "OK" && res.status !== "NO_EVIDENCE_FOUND")) throw new Error("Unexpected evidence tool response")
    const mine = ((res.claims ?? []) as Record<string, unknown>[]).filter((r) => r.claim_id === claimId)
    const s = (v: unknown) => (v == null || v === "" ? null : String(v))
    return {
      claimId,
      records: mine.map((r) => ({ sourceTable: s(r.source_table), sourceRecordId: s(r.source_record_id), supporting: s(r.supporting_evidence), counter: s(r.counter_evidence), missing: s(r.missing_evidence) })),
      rowsMatching: mine.length,
      rowsReturned: mine.length,
      source: s(res.source),
      provenance: s(res.provenance),
    }
  })
}
