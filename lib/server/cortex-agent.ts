import "server-only"
import { getRestApiAuthHeaders, getSnowflakeBaseUrl } from "@/lib/snowflake"

/**
 * Server-only client for the Snowflake Cortex Agents REST API.
 *
 *   POST /api/v2/databases/{db}/schemas/{schema}/agents/{name}:run
 *
 * The browser never sees the token: this module runs inside Next.js route
 * handlers and authenticates with the SPCS service token (deployed) or the
 * local Snowflake session (development). Only the frozen ORACLE X agents in
 * ORACLE_X.AGENTS are allow-listed.
 */

export const AGENTS = {
  ORCHESTRATOR: "ORACLE_ORCHESTRATOR",
  INVESTIGATOR: "ORACLE_INVESTIGATOR",
} as const

export type AgentKey = keyof typeof AGENTS

export interface AgentMessage {
  role: "user" | "assistant"
  content: { type: "text"; text: string }[]
}

export function agentRunUrl(base: string, agent: AgentKey): string {
  return `${base.replace(/\/+$/, "")}/api/v2/databases/ORACLE_X/schemas/AGENTS/agents/${AGENTS[agent]}:run`
}

export async function runAgent(
  agent: AgentKey,
  messages: AgentMessage[],
  opts: { stream?: boolean; signal?: AbortSignal } = {},
): Promise<Response> {
  const base = getSnowflakeBaseUrl()
  if (!base) throw new Error("Snowflake account URL is not configured")
  const auth = await getRestApiAuthHeaders()
  return fetch(agentRunUrl(base, agent), {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/json",
      Accept: opts.stream === false ? "application/json" : "text/event-stream",
    },
    body: JSON.stringify({ messages, stream: opts.stream !== false }),
    signal: opts.signal,
  })
}
