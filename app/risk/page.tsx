import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { Skeleton } from "@/components/ui/skeleton"
import { EntitySearch } from "@/components/shell/entity-search"
import { DimensionBreakdown } from "@/components/investigation/dimension-breakdown"
import { TimeMachine } from "@/components/investigation/time-machine"
import { BandScale, ModelComparison, RiskOverview, WhyBand } from "@/components/risk/risk-panels"
import { getIdentity } from "@/lib/server/investigation"
import { getBandConfig, getEventsCached, getRiskCached, getTimelineCached } from "@/lib/server/risk"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { DEMO_ENTITY_ID } from "@/lib/constants"
import { navItem } from "@/lib/nav"

export const dynamic = "force-dynamic"
export const metadata = { title: "Risk Intelligence" }

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/

/**
 * Risk Intelligence + Time Machine. Only the identity lookup blocks (so unknown ids get a real 404);
 * the slow risk view and the slow timeline view stream into independent sections.
 */
export default async function RiskPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const entityId = ((await searchParams).entity ?? DEMO_ENTITY_ID).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  const identity = await getIdentity(entityId)
  if (!identity) notFound()

  const bands = getBandConfig()
  const risk = getRiskCached(entityId)
  const timeline = getTimelineCached(entityId)
  const events = getEventsCached(entityId)
  for (const p of [bands, risk, timeline, events]) p.catch(() => {})

  return (
    <div className="space-y-6">
      <PageHeader item={navItem("risk")}>
        <div className="w-full max-w-sm">
          <EntitySearch />
        </div>
      </PageHeader>
      <h2 className="-mt-2 text-lg font-semibold">
        {identity.name} <span className="font-normal text-muted-foreground">({entityId})</span>
        <Link href={`/investigations/${entityId}`} className="ml-3 text-sm font-normal text-primary hover:underline">
          Open investigation
        </Link>
      </h2>

      <Suspense fallback={<Block rows={2} label="Loading the current risk score" />}>
        <RiskTop entityId={entityId} risk={risk} bands={bands} />
      </Suspense>

      <section aria-label="Time Machine">
        <Suspense fallback={<Block rows={5} label="Loading risk history" />}>
          <TimeSection timeline={timeline} events={events} bands={bands} />
        </Suspense>
      </section>

      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.risk} />
    </div>
  )
}

type P<T> = Promise<T>

async function RiskTop({ entityId, risk, bands }: { entityId: string; risk: P<Awaited<ReturnType<typeof getRiskCached>>>; bands: P<Awaited<ReturnType<typeof getBandConfig>>> }) {
  let r, b
  try {
    ;[r, b] = await Promise.all([risk, bands])
  } catch (err) {
    return <SectionError what="the risk score" err={err} />
  }
  if (!r) return <p className="text-sm text-muted-foreground">This entity has no risk score in the ORACLE X model.</p>
  return (
    <>
      <RiskOverview risk={r} bands={b} />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <WhyBand entityId={entityId} risk={r} bands={b} />
        <BandScale bands={b} band={r.band} bandDedup={r.bandDedup} />
      </div>
      <DimensionBreakdown risk={r} bands={b} />
      <ModelComparison risk={r} />
    </>
  )
}

async function TimeSection({
  timeline,
  events,
  bands,
}: {
  timeline: P<Awaited<ReturnType<typeof getTimelineCached>>>
  events: P<Awaited<ReturnType<typeof getEventsCached>>>
  bands: P<Awaited<ReturnType<typeof getBandConfig>>>
}) {
  let t, ev, b
  try {
    ;[t, ev, b] = await Promise.all([timeline, events, bands])
  } catch (err) {
    return <SectionError what="the risk history" err={err} />
  }
  if (!t) return <p className="text-sm text-muted-foreground">No risk history is available for this entity.</p>
  return (
    <TimeMachine points={t.points} abnormalStart={t.abnormalStart} abnormalStartDedup={t.abnormalStartDedup} abnormalBeforeTimelineStart={t.abnormalBeforeTimelineStart} events={ev} bands={b} />
  )
}

function SectionError({ what, err }: { what: string; err: unknown }) {
  console.error(new Date().toISOString(), `[oracle-x] risk section: ${what}`, err)
  return (
    <p role="alert" className="text-sm text-destructive">
      Couldn’t load {what} from Snowflake. Refresh the page to try again.
    </p>
  )
}

function Block({ rows, label }: { rows: number; label: string }) {
  return (
    <div className="rounded-xl border p-6" aria-busy="true" aria-label={label}>
      <p className="mb-3 text-xs text-muted-foreground">{label}…</p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="py-2.5">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="mt-2 h-2 w-full" />
        </div>
      ))}
    </div>
  )
}
