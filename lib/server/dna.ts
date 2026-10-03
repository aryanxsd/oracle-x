import "server-only"
import { querySnowflake } from "@/lib/snowflake"
import { cached } from "@/lib/server/cache"
import { getBlastRadius } from "@/lib/server/impact"
import { CHARACTERISTICS, type CaseCharacteristics, type CaseEvidence, type DnaKey, type DnaSnapshot, type Flags, type RiskDna, type SimilarCases } from "@/lib/dna-types"

/**
 * Risk DNA + Similar Investigations, read from the frozen backend only:
 *   INTEL.V_RISK_DNA                     7-dimension Risk DNA profile per snapshot (and per historical case)
 *   INTEL.V_SIMILAR_CASE_SCORES          backend cosine similarity + rank vs every historical case
 *   INTEL.V_SIMILAR_INVESTIGATION_INPUT  characteristic flags for the subject and each historical case
 *   CASES.INVESTIGATIONS / EVIDENCE_ITEMS historical case details and their recorded evidence
 *   CORE.ENTITY_NODES                    display names
 *   INTEL.BLAST_RADIUS_CACHE (via getBlastRadius)  whether a historical subject is connected today
 * Similarity is never computed here.
 */
const TTL = 5 * 60_000
const toIso = (v: unknown) => (v == null || v === "" ? null : v instanceof Date ? v.toISOString() : String(v))
const num = (v: unknown) => (v == null || v === "" ? null : Number(v))
const str = (v: unknown) => (v == null || v === "" ? null : String(v))
const obj = (v: unknown): Record<string, number> => {
  if (v == null) return {}
  if (typeof v === "string") {
    try {
      return JSON.parse(v)
    } catch {
      return {}
    }
  }
  return v as Record<string, number>
}

const DIM_COLS: Record<DnaKey, string> = {
  transaction: "TRANSACTION_DIMENSION",
  velocity: "VELOCITY_DIMENSION",
  geographic: "GEOGRAPHIC_DIMENSION",
  network: "NETWORK_DIMENSION",
  merchant: "MERCHANT_DIMENSION",
  historical: "HISTORICAL_DIMENSION",
  document: "DOCUMENT_DIMENSION",
}
const DNA_SELECT = `dna_id, entity_id, as_of_date, dna_source, related_case_id, ${Object.values(DIM_COLS).join(", ")}, seasonality_context, raw_features`

function dims(r: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(DIM_COLS).map(([k, c]) => [k, num(r[c])])) as Record<DnaKey, number | null>
}

function snapshot(r: Record<string, unknown>): DnaSnapshot {
  return {
    dnaId: String(r.DNA_ID),
    asOf: toIso(r.AS_OF_DATE)?.slice(0, 10) ?? null,
    source: String(r.DNA_SOURCE),
    relatedCaseId: str(r.RELATED_CASE_ID),
    dims: dims(r),
    seasonality: num(r.SEASONALITY_CONTEXT),
    features: obj(r.RAW_FEATURES),
  }
}

/** Every Risk DNA snapshot for the entity, newest first. */
export function getRiskDna(entityId: string): Promise<RiskDna> {
  return cached(`dna:${entityId}`, TTL, async () => {
    const rows = await querySnowflake(`SELECT ${DNA_SELECT} FROM ORACLE_X.INTEL.V_RISK_DNA WHERE entity_id = ? ORDER BY as_of_date DESC`, { binds: [entityId] })
    return { entityId, snapshots: rows.map(snapshot) }
  })
}

/** Backend descriptions of the Risk DNA and similarity methodology (view comments), cached. */
export function getDnaMethodology(): Promise<{ dna: string | null; similarity: string | null }> {
  return cached("dna:methodology", 60 * 60_000, async () => {
    const rows = await querySnowflake(
      `SELECT table_name, comment FROM ORACLE_X.INFORMATION_SCHEMA.VIEWS WHERE table_schema = 'INTEL' AND table_name IN ('V_RISK_DNA', 'V_SIMILAR_CASE_SCORES')`,
    )
    const by = new Map(rows.map((r) => [String(r.TABLE_NAME), str(r.COMMENT)]))
    return { dna: by.get("V_RISK_DNA") ?? null, similarity: by.get("V_SIMILAR_CASE_SCORES") ?? null }
  })
}

const flagsOf = (r: Record<string, unknown>): Flags => Object.fromEntries(CHARACTERISTICS.map((c) => [c.col, r[c.col] == null ? null : Boolean(r[c.col])]))

/**
 * Characteristic flags for the subject and every historical case. INTEL.V_SIMILAR_INVESTIGATION_INPUT
 * takes ~90 s to compile cold, so this is cached for longer and loaded independently of the case list.
 */
export function getCaseCharacteristics(entityId: string): Promise<CaseCharacteristics> {
  return cached(`similar-flags:${entityId}`, 30 * 60_000, async () => {
    const rows = await querySnowflake(
      `SELECT row_role, case_id, signal_types, ${CHARACTERISTICS.map((c) => c.col).join(", ")}
         FROM ORACLE_X.INTEL.V_SIMILAR_INVESTIGATION_INPUT
        WHERE (row_role = 'QUERY_SUBJECT' AND entity_id = ?) OR row_role = 'HISTORICAL_CASE'`,
      { binds: [entityId] },
    )
    const subject = rows.find((r) => r.ROW_ROLE === "QUERY_SUBJECT")
    return {
      subject: subject ? flagsOf(subject) : null,
      byCase: Object.fromEntries(rows.filter((r) => r.ROW_ROLE === "HISTORICAL_CASE").map((r) => [String(r.CASE_ID), { flags: flagsOf(r), signalTypes: str(r.SIGNAL_TYPES) }])),
    }
  })
}

export function getSimilarCases(entityId: string): Promise<SimilarCases> {
  return cached(`similar:${entityId}`, TTL, async () => {
    const [scores, method] = await Promise.all([
      querySnowflake(
        `SELECT case_id, historical_entity_id, historical_outcome, historical_typology, historical_key_indicators, historical_deciding_factors,
                historical_opened_at, dna_profile_similarity, similarity_rank, interpretation_note, subject_as_of_date
           FROM ORACLE_X.INTEL.V_SIMILAR_CASE_SCORES WHERE subject_entity_id = ? ORDER BY similarity_rank, case_id LIMIT 25`,
        { binds: [entityId] },
      ),
      getDnaMethodology(),
    ])
    const methodology = method.similarity ?? "Similarity of Risk DNA profiles, as computed by the backend."
    if (!scores.length) return { entityId, subjectAsOf: null, subjectDna: null, methodology, cases: [] }

    const caseIds = scores.map((s) => String(s.CASE_ID))
    const entIds = [...new Set(scores.map((s) => String(s.HISTORICAL_ENTITY_ID)))]
    const ph = (n: number) => Array.from({ length: n }, () => "?").join(",")
    const [caseDna, invs, ev, names, subjDna, blast] = await Promise.all([
      querySnowflake(`SELECT ${DNA_SELECT} FROM ORACLE_X.INTEL.V_RISK_DNA WHERE dna_source = 'HISTORICAL_CASE_SNAPSHOT' AND related_case_id IN (${ph(caseIds.length)})`, { binds: caseIds }),
      querySnowflake(`SELECT case_id, closed_at, summary, risk_score_at_open FROM ORACLE_X.CASES.INVESTIGATIONS WHERE case_id IN (${ph(caseIds.length)})`, { binds: caseIds }),
      querySnowflake(
        `SELECT evidence_id, case_id, evidence_type, stance, description, source_reference, confidence, is_verified, collected_at
           FROM ORACLE_X.CASES.EVIDENCE_ITEMS WHERE case_id IN (${ph(caseIds.length)}) ORDER BY case_id, collected_at, evidence_id`,
        { binds: caseIds },
      ),
      querySnowflake(`SELECT node_id, display_name FROM ORACLE_X.CORE.ENTITY_NODES WHERE node_id IN (${ph(entIds.length)})`, { binds: entIds }),
      // Same snapshot the backend compares: latest computed DNA for the subject.
      querySnowflake(`SELECT ${DNA_SELECT} FROM ORACLE_X.INTEL.V_RISK_DNA WHERE entity_id = ? AND dna_source = 'COMPUTED_FROM_RAW' ORDER BY as_of_date DESC LIMIT 1`, { binds: [entityId] }),
      getBlastRadius(entityId).catch(() => null),
    ])

    const dnaByCase = new Map(caseDna.map((r) => [String(r.RELATED_CASE_ID), r]))
    const invByCase = new Map(invs.map((r) => [String(r.CASE_ID), r]))
    const nameBy = new Map(names.map((r) => [String(r.NODE_ID), str(r.DISPLAY_NAME)]))
    const evByCase = new Map<string, CaseEvidence[]>()
    for (const e of ev) {
      const list = evByCase.get(String(e.CASE_ID)) ?? []
      list.push({
        evidenceId: String(e.EVIDENCE_ID),
        type: str(e.EVIDENCE_TYPE),
        stance: str(e.STANCE),
        description: str(e.DESCRIPTION),
        source: str(e.SOURCE_REFERENCE),
        confidence: num(e.CONFIDENCE),
        verified: e.IS_VERIFIED == null ? null : Boolean(e.IS_VERIFIED),
        collectedAt: toIso(e.COLLECTED_AT),
      })
      evByCase.set(String(e.CASE_ID), list)
    }
    const hopOf = new Map<string, number>()
    for (const e of blast?.entities ?? []) if (!hopOf.has(e.id) || hopOf.get(e.id)! > e.hop) hopOf.set(e.id, e.hop)

    return {
      entityId,
      subjectAsOf: toIso(scores[0].SUBJECT_AS_OF_DATE)?.slice(0, 10) ?? null,
      subjectDna: subjDna[0] ? dims(subjDna[0]) : null,
      methodology,
      cases: scores.map((s) => {
        const id = String(s.CASE_ID)
        const inv = invByCase.get(id)
        const d = dnaByCase.get(id)
        const hist = String(s.HISTORICAL_ENTITY_ID)
        return {
          caseId: id,
          rank: Number(s.SIMILARITY_RANK),
          similarity: Number(s.DNA_PROFILE_SIMILARITY),
          interpretationNote: str(s.INTERPRETATION_NOTE),
          historicalEntityId: hist,
          historicalEntityName: nameBy.get(hist) ?? null,
          outcome: str(s.HISTORICAL_OUTCOME),
          typology: str(s.HISTORICAL_TYPOLOGY),
          keyIndicators: str(s.HISTORICAL_KEY_INDICATORS),
          decidingFactors: str(s.HISTORICAL_DECIDING_FACTORS),
          openedAt: toIso(s.HISTORICAL_OPENED_AT),
          closedAt: toIso(inv?.CLOSED_AT),
          summary: str(inv?.SUMMARY),
          riskScoreAtOpen: num(inv?.RISK_SCORE_AT_OPEN),
          dna: d ? dims(d) : null,
          dnaAsOf: d ? (toIso(d.AS_OF_DATE)?.slice(0, 10) ?? null) : null,
          evidence: evByCase.get(id) ?? [],
          connectedHop: hopOf.get(hist) ?? null,
        }
      }),
    }
  })
}
