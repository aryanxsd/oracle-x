import type { GraphEdge, GraphNode } from "@/lib/graph-types"

/**
 * Radial layout by hop distance (presentation only — the backend decides which entities and
 * relationships exist). Centre at the origin, each hop on its own ring, grouped by entity type so
 * similar entities sit together.
 */
export function radialLayout(nodes: GraphNode[], center: string, edges: GraphEdge[] = []): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  pos.set(center, { x: 0, y: 0 })
  const byHop = new Map<number, GraphNode[]>()
  for (const n of nodes) {
    if (n.id === center) continue
    const h = Math.max(1, n.hop)
    if (!byHop.has(h)) byHop.set(h, [])
    byHop.get(h)!.push(n)
  }
  // Order outer rings by their parent's angle so paths fan outward instead of crossing.
  const parentOf = new Map<string, string>()
  for (const e of edges) {
    if (!parentOf.has(e.target) && e.source !== e.target) parentOf.set(e.target, e.source)
    if (!parentOf.has(e.source) && e.target === center) parentOf.set(e.source, e.target)
  }
  const angleOf = new Map<string, number>()
  for (const hop of [...byHop.keys()].sort((a, b) => a - b)) {
    const ring = byHop.get(hop)!
    ring.sort((a, b) => {
      if (hop > 1) {
        const pa = angleOf.get(parentOf.get(a.id) ?? "") ?? 0
        const pb = angleOf.get(parentOf.get(b.id) ?? "") ?? 0
        if (pa !== pb) return pa - pb
      }
      return a.type === b.type ? Number(b.flagged) - Number(a.flagged) || a.id.localeCompare(b.id) : a.type.localeCompare(b.type)
    })
    const radius = 300 * hop + Math.max(0, ring.length - 24) * 6
    ring.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / ring.length - Math.PI / 2
      angleOf.set(n.id, angle)
      pos.set(n.id, { x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)) })
    })
  }
  return pos
}
