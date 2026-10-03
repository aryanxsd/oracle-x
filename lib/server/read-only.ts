import "server-only"

/**
 * Public read-only mode. When ORACLE_X_READ_ONLY=true (server-side env only, never NEXT_PUBLIC_),
 * every action that writes to Snowflake or spends AI credits — council start, scenario re-run and
 * the Cortex Agent proxy — is refused with 403 before any Snowflake call, and the UI hides the
 * buttons that would trigger them. Stored results stay fully readable.
 */
export function isReadOnly(): boolean {
  return process.env.ORACLE_X_READ_ONLY?.trim().toLowerCase() === "true"
}

export const READ_ONLY_MESSAGE = "This action is disabled in the public read-only deployment."

export function readOnlyResponse(): Response {
  return Response.json({ error: READ_ONLY_MESSAGE }, { status: 403, headers: { "Cache-Control": "no-store" } })
}
