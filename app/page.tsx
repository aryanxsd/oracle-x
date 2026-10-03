import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { Suspense } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { RiskBandBadge } from "@/components/oracle/risk-band-badge"
import { EntitySearch } from "@/components/shell/entity-search"
import { getRadarBands, getRecentRuns } from "@/lib/server/queries"
import { listEvalRuns } from "@/lib/server/evaluation"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { navItem } from "@/lib/nav"
import { BAND_STYLE, asBand } from "@/lib/risk-style"
import { DEMO_ENTITY_ID, APP_TITLE } from "@/lib/constants"
import { getRiskCached } from "@/lib/server/risk"
import { fmtScore } from "@/lib/format"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default function CommandCenterPage() {
  return (
    <>
      <PageHeader item={navItem("command")} />

      <section className="mb-6 rounded-xl border bg-card" aria-labelledby="primary-h" data-testid="primary-investigation">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {APP_TITLE} · Enterprise Risk Intelligence &amp; Simulation
            </div>
            <h2 id="primary-h" className="mt-3 text-sm text-muted-foreground">
              Primary investigation
            </h2>
            <Suspense fallback={<Skeleton className="mt-2 h-16 w-72" />}>
              <PrimaryState />
            </Suspense>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/investigations/${DEMO_ENTITY_ID}`} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Open {DEMO_ENTITY_ID} Investigation
              </Link>
              <Cta href={`/investigations/${DEMO_ENTITY_ID}/decision-brief`}>View Decision Brief</Cta>
              <Cta href={`/evidence?entity=${DEMO_ENTITY_ID}`}>Explore Evidence</Cta>
              <Cta href={`/graph?entity=${DEMO_ENTITY_ID}`}>Open Entity Graph</Cta>
            </div>
          </div>
          <div className="lg:border-l lg:pl-6">
            <h2 className="text-sm font-medium">Investigate another entity</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Search a merchant, customer, device or account by name or id. ORACLE explains the risk, shows the evidence for and against, and never issues a
              verdict while evidence is incomplete.
            </p>
            <div className="mt-4">
              <EntitySearch size="lg" />
            </div>
          </div>
        </div>
        <Journey />
      </section>

      <Suspense fallback={<div className="mb-6 grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>}>
        <LatestCards />
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 scroll-mt-20" id="radar">
          <CardHeader>
            <CardTitle className="text-base">Early Warning Radar</CardTitle>
            <p className="text-sm text-muted-foreground">Scored entities by risk band, as calculated by the ORACLE X risk model.</p>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<RadarSkeleton />}>
              <RadarBands />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent investigations</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<RecentSkeleton />}>
              <RecentRuns />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <TechnicalDetails sources={PAGE_SOURCES.command} />
      </div>
    </>
  )
}

/** Live M044 state from the existing (cached) risk reader. */
async function PrimaryState() {
  const r = await getRiskCached(DEMO_ENTITY_ID).catch(() => null)
  if (!r) return <p className="mt-2 text-sm text-muted-foreground">{DEMO_ENTITY_ID} · current risk is not available right now.</p>
  const band = asBand(r.bandDedup ?? r.band)
  return (
    <div className="mt-1 flex flex-wrap items-end gap-x-6 gap-y-2" data-testid="primary-state">
      <div className="text-3xl font-semibold tracking-tight">{DEMO_ENTITY_ID}</div>
      {band && <RiskBandBadge band={band} />}
      <div className="text-sm text-muted-foreground">
        <strong className="text-2xl font-semibold tabular-nums text-foreground">{fmtScore(r.overallDedup ?? r.overall)}</strong> adjusted risk · {fmtScore(r.overall)} standard
      </div>
    </div>
  )
}

const JOURNEY = [
  { label: "Investigate", help: "Risk and evidence in one place", href: `/investigations/${DEMO_ENTITY_ID}` },
  { label: "Connect", help: "Entity graph and blast radius", href: `/graph?entity=${DEMO_ENTITY_ID}` },
  { label: "Explain", help: "How the score is built", href: `/risk?entity=${DEMO_ENTITY_ID}` },
  { label: "Challenge", help: "Contradicting and missing evidence", href: `/evidence?entity=${DEMO_ENTITY_ID}` },
  { label: "Simulate", help: "Do nothing, Monitor, Block", href: `/scenarios?entity=${DEMO_ENTITY_ID}` },
  { label: "Decide", help: "The decision brief", href: `/investigations/${DEMO_ENTITY_ID}/decision-brief` },
  { label: "Document", help: "Readable case files", href: `/cases?entity=${DEMO_ENTITY_ID}` },
]

function Journey() {
  return (
    <ol className="grid border-t sm:grid-cols-4 lg:grid-cols-7" aria-label="Investigation journey" data-testid="journey">
      {JOURNEY.map((j, i) => (
        <li key={j.label} className="border-b sm:border-r lg:border-b-0 lg:last:border-r-0">
          <Link href={j.href} className="group flex h-full flex-col px-4 py-3 transition-colors hover:bg-accent">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
              <span className="tabular-nums text-muted-foreground">{i + 1}</span> {j.label}
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">{j.help}</span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

function Cta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent">
      {children}
    </Link>
  )
}

/** Three small entry points: latest investigation, its agent trace, and the latest stored evaluation. */
async function LatestCards() {
  const [runs, evals] = await Promise.all([getRecentRuns(10).catch(() => null), listEvalRuns().catch(() => null)])
  const run = runs?.find((r) => r.status === "COMPLETED") ?? runs?.[0] ?? null
  const ev = evals?.[0] ?? null
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-3" data-testid="latest-cards">
      <LatestCard title="Latest investigation" href={run ? `/investigations/${encodeURIComponent(run.entityId)}` : null}>
        {run ? (
          <>
            <div className="font-medium">{run.entityId}</div>
            <div className="text-xs text-muted-foreground">{run.status.toLowerCase()} · {run.startedAt ? new Date(run.startedAt).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—"}</div>
          </>
        ) : (
          <span className="text-muted-foreground">{runs == null ? "Unavailable right now" : "No investigations yet"}</span>
        )}
      </LatestCard>
      <LatestCard title="Latest agent trace" href={run ? `/agent-trace?entity=${encodeURIComponent(run.entityId)}&run=${encodeURIComponent(run.runId)}` : null}>
        {run ? (
          <>
            <div className="font-medium">How ORACLE answered on {run.entityId}</div>
            <div className="text-xs text-muted-foreground">
              {run.mode === "PHASED_ASYNC" ? "Full council" : run.mode.toLowerCase()}
              {run.totalSeconds != null && <> · {Math.round(run.totalSeconds / 60)} min</>}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">No council runs yet</span>
        )}
      </LatestCard>
      <LatestCard title="Latest evaluation" href={ev ? `/evaluation/${encodeURIComponent(ev.evalRunId)}` : null}>
        {ev ? (
          <>
            <div className="font-medium">
              {ev.criteriaPassed ?? "—"} of {ev.criteriaTotal ?? "—"} checks passed
            </div>
            <div className="text-xs text-muted-foreground">
              {ev.overallStatus ?? "—"}
              {ev.caseId && <> · case {ev.caseId}</>}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">{evals == null ? "Unavailable right now" : "No evaluations yet"}</span>
        )}
      </LatestCard>
    </div>
  )
}

function LatestCard({ title, href, children }: { title: string; href: string | null; children: React.ReactNode }) {
  const body = (
    <Card className={cn("h-full", href && "transition-colors hover:bg-accent/50")}>
      <CardContent className="p-4 text-sm">
        <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
          {title} {href && <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />}
        </div>
        {children}
      </CardContent>
    </Card>
  )
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}

async function RadarBands() {
  let bands
  try {
    bands = await getRadarBands()
  } catch (e) {
    console.error(new Date().toISOString(), "[oracle-x] command center radar", e)
    return <LoadError what="risk bands" />
  }
  if (!bands.length) return <p className="text-sm text-muted-foreground">No scored entities yet.</p>
  const total = bands.reduce((s, b) => s + b.entities, 0)
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {bands.map((b) => {
        const band = asBand(b.band)
        if (!band) return null
        const s = BAND_STYLE[band]
        return (
          <div key={b.band} className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <RiskBandBadge band={band} />
              <span className="text-xs text-muted-foreground">{s.plain}</span>
            </div>
            <div className="mt-4 text-3xl font-semibold tabular-nums">{b.entities}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", s.dot)} style={{ width: total ? `${(b.entities / total) * 100}%` : 0 }} />
            </div>
            {b.entitiesDedup !== b.entities && (
              <div className="mt-2 text-xs text-muted-foreground">{b.entitiesDedup} after double-counting adjustment</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

async function RecentRuns() {
  let runs
  try {
    runs = await getRecentRuns(6)
  } catch (e) {
    console.error(new Date().toISOString(), "[oracle-x] command center recent runs", e)
    return <LoadError what="investigations" />
  }
  if (!runs.length) return <p className="text-sm text-muted-foreground">No investigations yet.</p>
  return (
    <ul className="divide-y">
      {runs.map((r) => (
        <li key={r.runId} className="py-3 first:pt-0 last:pb-0">
          <Link
            href={`/investigations/${encodeURIComponent(r.entityId)}?run=${encodeURIComponent(r.runId)}`}
            className="block hover:text-primary"
          >
            <div className="flex items-center justify-between gap-2 text-sm font-medium">
              <span>{r.entityId}</span>
              <span className={cn("text-xs", r.status === "COMPLETED" ? "text-band-normal" : "text-muted-foreground")}>
                {r.status.toLowerCase()}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.question}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function RadarSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true" aria-label="Loading risk bands">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border p-4">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="mt-4 h-8 w-12" />
          <Skeleton className="mt-3 h-1.5 w-full" />
        </div>
      ))}
    </div>
  )
}

function RecentSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading investigations">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-2 h-3 w-full" />
        </div>
      ))}
    </div>
  )
}

function LoadError({ what }: { what: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      Couldn’t load {what} from Snowflake. Refresh the page to try again.
    </p>
  )
}
