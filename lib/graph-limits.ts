/**
 * Display copy for the graph limits enforced by the frozen backend
 * (AGENTS.TOOL_GET_BOUNDED_GRAPH). The server clamps every request to these
 * values in lib/server/guards.ts; this file only exists so client code can
 * describe them without importing server modules.
 */
export const GRAPH_MAX_HOPS = 3
export const GRAPH_MAX_PATHS = 200
export const GRAPH_LIMITS_DISPLAY = `${GRAPH_MAX_HOPS} steps and ${GRAPH_MAX_PATHS} paths`
