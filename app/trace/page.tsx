import { redirect } from "next/navigation"

/** Old shell route; Agent Trace now lives at /agent-trace. */
export default async function TraceRedirect({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const e = (await searchParams).entity
  redirect(e && /^[A-Za-z]{1,3}[0-9]{2,6}$/.test(e) ? `/agent-trace?entity=${e.toUpperCase()}` : "/agent-trace")
}
