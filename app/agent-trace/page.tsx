import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EntitySearch } from "@/components/shell/entity-search"
import { StatusLegend, TraceFlow, TraceTimeline } from "@/components/trace/trace-view"
import { getIdentity } from "@/lib/server/investigation"
import { getToolCalls, getTrace, latestCompletedRun, listTraceRuns } from "@/lib/server/trace"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { DEMO_ENTITY_ID } from "@/lib/constants"
import { navItem } from "@/lib/nav"
import { fmtDate, humanize } from "@/lib/format"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Agent Trace" }

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/
const RUN_RE = /^[A-Za-z0-9_-]{1,64}$/

/** How ORACLE reached its answer, from an existing council run. Never starts a council. */
export default async function AgentTracePage({ searchParams }: { searchParams: Promise<{ entity?: string; run?: string }> }) {
  const sp = await searchParams
  const entityId = (sp.entity ?? DEMO_ENTITY_ID).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  if (sp.run != null && !RUN_RE.test(sp.run)) notFound()
  const identity = await getIdentity(entityId)
  if (!identity) notFound()
  const [runs, target] = await Promise.all([listTraceRuns(entityId), sp.run ? Promise.resolve(sp.run) : latestCompletedRun(entityId)])
  const trace = target ? await getTrace(target) : null
  if (sp.run && (!trace || trace.entityId !== entityId)) notFound()
  const calls = trace
    ? getToolCalls(trace.runId).catch((err) => {
        console.error(new Date().toISOString(), "[oracle-x] tool calls", err)
        return null
      })
    : Promise.resolve(null)

  return (
    <div className="space-y-6">
      <PageHeader item={navItem("trace")}>
        <div className="w-full max-w-sm">
          <EntitySearch />
        </div>
      </PageHeader>
      {!trace ? (
        <p className="text-sm text-muted-foreground">No council run is recorded for {identity.name} yet.</p>
      ) : (
        <>
          <section className="rounded-2xl border bg-gradient-to-br from-card to-secondary p-6" data-testid="trace-hero">
            <h2 className="text-lg font-semibold">ORACLE did not simply generate an answer.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              For {identity.name} ({entityId}) it investigated, gathered evidence with tools, consulted {trace.stages.length} specialists, had the Skeptic challenge
              the findings, compared possible actions, and wrote one traceable report{trace.totalSeconds != null && <> in {Math.round(trace.totalSeconds / 60)} minutes</>}.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link href={`/investigations/${entityId}`} className="text-primary hover:underline">Investigation</Link>
              <Link href={`/cases/${encodeURIComponent(trace.runId)}`} className="text-primary hover:underline">Case file</Link>
              <Link href={`/evaluation?council=${encodeURIComponent(trace.runId)}`} className="text-primary hover:underline">Evaluation of this run</Link>
            </div>
          </section>
          <StatusLegend />
          <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Timeline</CardTitle>
                  <p className="text-sm text-muted-foreground">Real start times and durations from the council record.</p>
                </CardHeader>
                <CardContent>
                  <TraceTimeline t={trace} />
                </CardContent>
              </Card>
              <TraceFlow t={trace} calls={calls} />
            </div>
            <aside className="space-y-2" aria-label="Council runs">
              <h3 className="text-sm font-medium">Council runs for {entityId}</h3>
              <ul className="space-y-1 text-sm" data-testid="run-picker">
                {runs.map((r) => (
                  <li key={r.runId}>
                    <Link
                      href={`/agent-trace?entity=${entityId}&run=${encodeURIComponent(r.runId)}`}
                      aria-current={r.runId === trace.runId ? "page" : undefined}
                      className={cn("block rounded-lg border px-3 py-2 hover:bg-accent", r.runId === trace.runId && "border-primary bg-primary/5")}
                    >
                      <div className="font-mono text-xs">{r.runId}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(r.startedAt)} · {r.mode === "PHASED_ASYNC" ? "Full council" : humanize(r.mode)} · {humanize(r.status)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </>
      )}
      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.trace} />
    </div>
  )
}
