import "server-only"
import { querySnowflake } from "@/lib/snowflake"
import { GRAPH_LIMITS } from "@/lib/server/guards"
import type { GraphEdge, GraphNode, GraphResponse, RelatedSignal } from "@/lib/graph-types"

/**
 * Living Entity Graph data, read from the frozen ORACLE X graph objects only:
 *   INTEL.V_ENTITY_NEIGHBORS         1-hop relationships (evidence, counts, timing, confidence, nature)
 *   AGENTS.TOOL_GET_BOUNDED_GRAPH    bounded multi-hop paths (start entity required, backend clamps 3 hops / 200 paths)
 *   CORE.ENTITY_NODES                display names for entities that appear on paths
 *   INTEL.EVIDENCE_SUMMARY_SNAPSHOT  risk signals whose evidence cites a connected entity (WHY)
 * No traversal happens here: direct relationships are rows of a view, and multi-hop paths are the
 * backend's own path strings split into their hops.
 */

export const NODE_TYPES = ["MERCHANT", "CUSTOMER", "ACCOUNT", "TRANSACTION", "DEVICE", "LOCATION", "COUNTERPARTY", "IP_ADDRESS", "WATCHLIST_ENTRY"] as const
export type NodeType = (typeof NODE_TYPES)[number]

export type { GraphEdge, GraphNode, GraphResponse, RelatedSignal, RelationshipTotal } from "@/lib/graph-types"

const toIso = (v: unknown) => (v == null || v === "" ? null : v instanceof Date ? v.toISOString() : String(v))
const num = (v: unknown) => (v == null || v === "" ? null : Number(v))
const edgeId = (s: string, rel: string, t: string) => `${s}|${rel}|${t}`

/** Direct (1-hop) relationship view: every relationship type, the top `perType` neighbours of each. */
export async function getDirectGraph(entityId: string, perType = 6): Promise<GraphResponse> {
  const k = Math.min(Math.max(Math.trunc(perType), 1), 25)
  const [center, rows, totals] = await Promise.all([
    querySnowflake(`SELECT node_id, entity_type, display_name, risk_tier, attributes FROM ORACLE_X.CORE.ENTITY_NODES WHERE node_id = ?`, { binds: [entityId] }),
    querySnowflake(
      `SELECT neighbor_id, neighbor_type, neighbor_name, neighbor_risk_tier, neighbor_is_flagged, relationship_type, direction,
              relationship_nature, link_confidence, observation_count, total_amount_usd, evidence_reference, link_origin,
              valid_from, valid_to, is_current, relationship_is_concurrent, temporal_note
         FROM ORACLE_X.INTEL.V_ENTITY_NEIGHBORS
        WHERE entity_id = ?
        QUALIFY ROW_NUMBER() OVER (PARTITION BY relationship_type
                                   ORDER BY neighbor_is_flagged DESC, observation_count DESC NULLS LAST, neighbor_id) <= ?
                OR neighbor_is_flagged`,
      { binds: [entityId, k] },
    ),
    querySnowflake(
      `SELECT relationship_type, neighbor_type, COUNT(*) AS total
         FROM ORACLE_X.INTEL.V_ENTITY_NEIGHBORS WHERE entity_id = ? GROUP BY 1, 2 ORDER BY 3 DESC`,
      { binds: [entityId] },
    ),
  ])
  if (!center[0]) throw new GraphNotFound()

  const nodes = new Map<string, GraphNode>()
  const c = center[0]
  nodes.set(entityId, { id: entityId, type: c.ENTITY_TYPE, name: c.DISPLAY_NAME, riskTier: c.RISK_TIER ?? null, flagged: flaggedAttr(c.ATTRIBUTES), hop: 0 })
  const edges: GraphEdge[] = []
  const shown = new Map<string, number>()
  for (const r of rows) {
    if (!nodes.has(r.NEIGHBOR_ID))
      nodes.set(r.NEIGHBOR_ID, { id: r.NEIGHBOR_ID, type: r.NEIGHBOR_TYPE, name: r.NEIGHBOR_NAME ?? r.NEIGHBOR_ID, riskTier: r.NEIGHBOR_RISK_TIER ?? null, flagged: Boolean(r.NEIGHBOR_IS_FLAGGED), hop: 1 })
    const incoming = String(r.DIRECTION).toUpperCase() === "INCOMING"
    const [s, t] = incoming ? [r.NEIGHBOR_ID, entityId] : [entityId, r.NEIGHBOR_ID]
    edges.push({
      id: edgeId(s, r.RELATIONSHIP_TYPE, t),
      source: s,
      target: t,
      relationship: r.RELATIONSHIP_TYPE,
      nature: r.RELATIONSHIP_NATURE ?? null,
      confidence: num(r.LINK_CONFIDENCE),
      observations: num(r.OBSERVATION_COUNT),
      amountUsd: num(r.TOTAL_AMOUNT_USD),
      evidence: splitEvidence(r.EVIDENCE_REFERENCE),
      origin: r.LINK_ORIGIN ?? null,
      validFrom: toIso(r.VALID_FROM),
      validTo: toIso(r.VALID_TO),
      isCurrent: r.IS_CURRENT == null ? null : Boolean(r.IS_CURRENT),
      concurrent: r.RELATIONSHIP_IS_CONCURRENT == null ? null : Boolean(r.RELATIONSHIP_IS_CONCURRENT),
      temporalNote: r.TEMPORAL_NOTE ?? null,
    })
    const key = `${r.RELATIONSHIP_TYPE}|${r.NEIGHBOR_TYPE}`
    shown.set(key, (shown.get(key) ?? 0) + 1)
  }
  const totalList = totals.map((t) => ({
    relationship: t.RELATIONSHIP_TYPE,
    neighborType: t.NEIGHBOR_TYPE,
    total: Number(t.TOTAL),
    shown: shown.get(`${t.RELATIONSHIP_TYPE}|${t.NEIGHBOR_TYPE}`) ?? 0,
  }))
  return {
    center: entityId,
    mode: "direct",
    nodes: [...nodes.values()],
    edges,
    totals: totalList,
    totalDirect: totalList.reduce((s, t) => s + t.total, 0),
    bounds: null,
    pathsMatching: null,
    pathsReturned: null,
    truncated: totalList.some((t) => t.shown < t.total),
    signals: await relatedSignals(entityId, [...nodes.keys()]),
    provenance: "Relationships are FACTS from Snowflake records; confidence is a MODEL OUTPUT. A relationship is not evidence of wrongdoing.",
  }
}

export class GraphNotFound extends Error {
  status = 404
  constructor() {
    super("Entity not found")
  }
}

interface ToolPath {
  path: string
  hops: number
  evidence?: string
  path_confidence?: number
  end_entity_id?: string
  end_entity_type?: string
  end_is_flagged?: boolean
  links_coexisted_in_time?: boolean
  relationship_natures?: string
  valid_from?: string
  valid_to?: string
}

/** One hop of a backend path string "A -[REL]-> B -[REL2]-> C". */
export function parsePath(path: string): { source: string; relationship: string; target: string }[] {
  const tokens = path.split(/\s+-\[([A-Z0-9_]+)\]->\s+/)
  const hops: { source: string; relationship: string; target: string }[] = []
  for (let i = 0; i + 2 < tokens.length; i += 2) hops.push({ source: tokens[i].trim(), relationship: tokens[i + 1], target: tokens[i + 2].trim() })
  return hops
}

/**
 * Bounded multi-hop paths via AGENTS.TOOL_GET_BOUNDED_GRAPH. The backend enforces the start entity
 * and clamps hops/paths; this layer additionally clamps to the same limits before calling.
 */
export async function getPathGraph(
  entityId: string,
  opts: { hops: number; paths: number; through?: string | null; endType?: string | null },
): Promise<GraphResponse> {
  const hops = Math.min(Math.max(opts.hops, 1), GRAPH_LIMITS.maxHops)
  const paths = Math.min(Math.max(opts.paths, 1), GRAPH_LIMITS.maxPaths)
  const rows = await querySnowflake("CALL ORACLE_X.AGENTS.TOOL_GET_BOUNDED_GRAPH(?, ?, ?, ?, ?)", {
    binds: [entityId, hops, paths, opts.endType ?? "", opts.through ?? ""],
  })
  const raw = rows[0] ? Object.values(rows[0])[0] : null
  const res = typeof raw === "string" ? JSON.parse(raw) : raw
  if (!res || res.status !== "OK") {
    if (res?.status === "REJECTED") throw new GraphRejected(String(res.reason ?? "Request rejected by the graph limits"))
    throw new Error("Unexpected graph tool response")
  }
  const toolPaths: ToolPath[] = res.paths ?? []

  const hopOf = new Map<string, number>([[entityId, 0]])
  const edges = new Map<string, GraphEdge>()
  for (const p of toolPaths) {
    const parts = parsePath(p.path)
    const ev = (p.evidence ?? "").split(/\s*\|\|\s*/)
    parts.forEach((h, i) => {
      hopOf.set(h.target, Math.min(hopOf.get(h.target) ?? Infinity, i + 1))
      if (!hopOf.has(h.source)) hopOf.set(h.source, i)
      const id = edgeId(h.source, h.relationship, h.target)
      if (edges.has(id)) return
      const lastHop = i === parts.length - 1
      edges.set(id, {
        id,
        source: h.source,
        target: h.target,
        relationship: h.relationship,
        nature: (p.relationship_natures ?? "").split(/\s*>\s*/)[i] ?? null,
        confidence: parts.length === 1 ? num(p.path_confidence) : null,
        observations: obsFromEvidence(ev[i]),
        amountUsd: null,
        evidence: splitEvidence(ev[i]),
        origin: "INTEL.GRAPH_PATHS_BOUNDED",
        validFrom: parts.length === 1 ? toIso(p.valid_from) : null,
        validTo: parts.length === 1 ? toIso(p.valid_to) : null,
        isCurrent: null,
        concurrent: lastHop && parts.length === 1 ? (p.links_coexisted_in_time ?? null) : null,
        temporalNote: (ev[i] ?? "").includes("TIMING:") ? (ev[i] ?? "").split("TIMING:")[1].trim() : null,
      })
    })
  }
  const ids = [...hopOf.keys()]
  const names = await nodeNames(ids)
  const nodes: GraphNode[] = ids.map((id) => {
    const n = names.get(id)
    return { id, type: n?.type ?? "UNKNOWN", name: n?.name ?? id, riskTier: n?.riskTier ?? null, flagged: n?.flagged ?? false, hop: hopOf.get(id)! }
  })
  for (const p of toolPaths) {
    if (p.end_entity_id && p.end_is_flagged) {
      const n = nodes.find((x) => x.id === p.end_entity_id)
      if (n) n.flagged = true
    }
  }
  return {
    center: entityId,
    mode: "paths",
    nodes,
    edges: [...edges.values()],
    totals: [],
    totalDirect: 0,
    bounds: { maxHops: Number(res.bounds?.max_hops ?? hops), maxPaths: Number(res.bounds?.max_paths_returned ?? paths) },
    pathsMatching: num(res.paths_matching),
    pathsReturned: num(res.paths_returned),
    truncated: Boolean(res.truncated),
    signals: await relatedSignals(entityId, ids),
    provenance: typeof res.provenance === "string" ? res.provenance : null,
  }
}

export class GraphRejected extends Error {
  status = 400
}

async function nodeNames(ids: string[]) {
  const out = new Map<string, { type: string; name: string; riskTier: string | null; flagged: boolean }>()
  if (!ids.length) return out
  const capped = ids.slice(0, 500)
  const rows = await querySnowflake(
    `SELECT node_id, entity_type, display_name, risk_tier, attributes FROM ORACLE_X.CORE.ENTITY_NODES WHERE node_id IN (${capped.map(() => "?").join(",")})`,
    { binds: capped },
  )
  for (const r of rows) out.set(r.NODE_ID, { type: r.ENTITY_TYPE, name: r.DISPLAY_NAME ?? r.NODE_ID, riskTier: r.RISK_TIER ?? null, flagged: flaggedAttr(r.ATTRIBUTES) })
  return out
}

/** Risk signals for the centre entity whose recorded evidence cites one of the connected entities. */
async function relatedSignals(entityId: string, ids: string[]): Promise<RelatedSignal[]> {
  const rows = await querySnowflake(
    `SELECT claim_id, signal_type, risk_claim, supporting_evidence, contradicting_evidence, source_record_ids, missing_evidence
       FROM ORACLE_X.INTEL.EVIDENCE_SUMMARY_SNAPSHOT WHERE entity_id = ? AND evidence_origin = 'SEEDED_SIGNAL'`,
    { binds: [entityId] },
  )
  const others = ids.filter((i) => i !== entityId)
  return rows
    .map((r) => {
      const hay = [r.SUPPORTING_EVIDENCE, r.CONTRADICTING_EVIDENCE, r.SOURCE_RECORD_IDS, r.MISSING_EVIDENCE].filter(Boolean).join(" ")
      const mentions = others.filter((id) => new RegExp(`\\b${id}\\b`).test(hay))
      return { claimId: r.CLAIM_ID, signalType: r.SIGNAL_TYPE, claim: r.RISK_CLAIM, mentions }
    })
    .filter((s) => s.mentions.length > 0)
}

function splitEvidence(s: unknown): string[] {
  if (!s) return []
  return String(s)
    .split(/\s*(?:\|\||;)\s*/)
    .map((x) => x.replace(/^TIMING:\s*/, "").trim())
    .filter(Boolean)
}

function obsFromEvidence(s: string | undefined): number | null {
  const m = s?.match(/\bn=(\d+)/)
  return m ? Number(m[1]) : null
}

function flaggedAttr(a: unknown): boolean {
  const o = typeof a === "string" ? safeJson(a) : a
  return Boolean(o && typeof o === "object" && (o as Record<string, unknown>).is_flagged)
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
