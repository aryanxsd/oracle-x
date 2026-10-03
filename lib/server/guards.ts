import "server-only"
import { GRAPH_MAX_HOPS, GRAPH_MAX_PATHS } from "@/lib/graph-limits"

/**
 * Input guards for the ORACLE X API layer.
 *
 * Every value that reaches Snowflake from the browser passes through one of
 * these functions. They never widen a backend limit: graph bounds are clamped
 * to the limits already enforced by AGENTS.TOOL_GET_BOUNDED_GRAPH.
 */

/** Graph bounds enforced by the frozen backend. The UI may ask for less, never more. */
export const GRAPH_LIMITS = { maxHops: GRAPH_MAX_HOPS, maxPaths: GRAPH_MAX_PATHS } as const

const ENTITY_ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/
const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export class InputError extends Error {
  status = 400
}

/** Canonical entity ids look like M044, C04901, D2750, IP04999, B9003, W0007. */
export function entityId(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().toUpperCase()
  if (!ENTITY_ID_RE.test(v)) throw new InputError("Invalid entity id")
  return v
}

export function runId(raw: string | null | undefined): string {
  const v = (raw ?? "").trim()
  if (!RUN_ID_RE.test(v)) throw new InputError("Invalid run id")
  return v
}

/** Free-text search for the entity resolver: bounded length, no control characters. */
export function searchText(raw: string | null | undefined): string {
  const v = (raw ?? "").replace(/[\u0000-\u001f]/g, " ").trim()
  if (v.length < 2 || v.length > 80) throw new InputError("Search must be 2-80 characters")
  return v
}

/** Natural-language question for an agent: bounded length. */
export function question(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : ""
  if (v.length < 3 || v.length > 2000) throw new InputError("Question must be 3-2000 characters")
  return v
}

/** Clamp requested graph size to the backend limits (bounded start entity is required separately). */
export function graphBounds(hops?: number | null, paths?: number | null) {
  const h = Number.isFinite(hops) ? Math.trunc(hops as number) : 2
  const p = Number.isFinite(paths) ? Math.trunc(paths as number) : 50
  return {
    hops: Math.min(Math.max(h, 1), GRAPH_LIMITS.maxHops),
    paths: Math.min(Math.max(p, 1), GRAPH_LIMITS.maxPaths),
  }
}

export function errorResponse(e: unknown, context: string) {
  if (e instanceof InputError) return Response.json({ error: e.message }, { status: e.status })
  console.error(new Date().toISOString(), `[oracle-x] ${context}`, e)
  return Response.json({ error: `${context} failed` }, { status: 500 })
}
