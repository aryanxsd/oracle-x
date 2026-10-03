/** Graph data contract shared by the server graph module and the client graph UI (types only). */

export interface GraphNode {
  id: string
  type: string
  name: string
  riskTier: string | null
  flagged: boolean
  /** Shortest number of hops from the centre among the relationships returned. */
  hop: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relationship: string
  nature: string | null
  confidence: number | null
  observations: number | null
  amountUsd: number | null
  evidence: string[]
  origin: string | null
  validFrom: string | null
  validTo: string | null
  isCurrent: boolean | null
  /** false = the two links never overlapped in time (sequential, not concurrent). */
  concurrent: boolean | null
  temporalNote: string | null
}

export interface RelationshipTotal {
  relationship: string
  neighborType: string
  total: number
  shown: number
}

export interface RelatedSignal {
  claimId: string
  signalType: string
  claim: string
  mentions: string[]
}

export interface GraphResponse {
  center: string
  mode: "direct" | "paths"
  nodes: GraphNode[]
  edges: GraphEdge[]
  totals: RelationshipTotal[]
  totalDirect: number
  bounds: { maxHops: number; maxPaths: number } | null
  pathsMatching: number | null
  pathsReturned: number | null
  truncated: boolean
  signals: RelatedSignal[]
  provenance: string | null
}
