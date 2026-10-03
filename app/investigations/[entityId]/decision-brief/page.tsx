import { Suspense } from "react"
import { notFound } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import {
  ActionSimulation,
  BriefHeader,
  CouncilStatus,
  EvidenceBalanceSection,
  ExecutiveFinding,
  NetworkSummary,
  NextStep,
  RiskEvolution,
  WhyItMatters,
  settled,
} from "@/components/brief/decision-brief"
import { getIdentity } from "@/lib/server/investigation"
import { getEvidenceOverview } from "@/lib/server/evidence"
import { getEventsCached, getRiskCached, getTimelineCached } from "@/lib/server/risk"
import { getBlastRadius, getLatestScenarios } from "@/lib/server/impact"
import { getTrace, latestCompletedRun } from "@/lib/server/trace"
import { PAGE_SOURCES } from "@/lib/data-sources"

export const dynamic = "force-dynamic"

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/

export async function generateMetadata({ params }: { params: Promise<{ entityId: string }> }) {
  const entityId = decodeURIComponent((await params).entityId).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  return { title: `Decision Brief ${entityId}` }
}

const SECTIONS = [
  { id: "finding", label: "Finding" },
  { id: "why", label: "Why" },
  { id: "evidence", label: "Evidence" },
  { id: "evolution", label: "History" },
  { id: "network", label: "Network" },
  { id: "simulation", label: "Actions" },
  { id: "council", label: "Council" },
  { id: "next", label: "Next step" },
]

/**
 * Investigation Decision Brief: one investigator-facing summary assembled from the existing
 * read-only server readers (risk, evidence, history, blast radius, stored scenarios, latest stored
 * council run). Never starts a council, evaluation or scenario run.
 */
export default async function DecisionBriefPage({ params }: { params: Promise<{ entityId: string }> }) {
  const entityId = decodeURIComponent((await params).entityId).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  const identity = await getIdentity(entityId)
  if (!identity) notFound()

  // Independent readers start together; each section suspends only on what it needs.
  const risk = settled(getRiskCached(entityId))
  const evidence = settled(getEvidenceOverview(entityId))
  const timeline = settled(getTimelineCached(entityId))
  const events = settled(getEventsCached(entityId))
  const blast = settled(getBlastRadius(entityId))
  const scenarios = settled(getLatestScenarios(entityId))
  const trace = settled(latestCompletedRun(entityId).then((id) => (id ? getTrace(id) : null)))

  return (
    <div className="space-y-5">
      <Suspense fallback={<Block h="h-40" label="Loading the brief" />}>
        <BriefHeader identity={identity} risk={risk} />
      </Suspense>

      <nav aria-label="Brief sections" className="sticky top-16 z-10 flex flex-wrap gap-1 rounded-lg border bg-background/95 p-1 backdrop-blur print:hidden">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            {s.label}
          </a>
        ))}
      </nav>

      <Suspense fallback={<Block h="h-56" label="Loading the executive finding" />}>
        <ExecutiveFinding risk={risk} evidence={evidence} blast={blast} trace={trace} />
      </Suspense>
      <div className="grid gap-5 xl:grid-cols-2">
        <Suspense fallback={<Block h="h-72" label="Loading risk contributors" />}>
          <WhyItMatters risk={risk} evidence={evidence} entityId={entityId} />
        </Suspense>
        <Suspense fallback={<Block h="h-72" label="Loading evidence balance" />}>
          <EvidenceBalanceSection evidence={evidence} entityId={entityId} />
        </Suspense>
      </div>
      <Suspense fallback={<Block h="h-48" label="Loading risk history" />}>
        <RiskEvolution timeline={timeline} events={events} entityId={entityId} />
      </Suspense>
      <Suspense fallback={<Block h="h-48" label="Loading blast radius" />}>
        <NetworkSummary blast={blast} entityId={entityId} />
      </Suspense>
      <Suspense fallback={<Block h="h-48" label="Loading scenarios" />}>
        <ActionSimulation scenarios={scenarios} entityId={entityId} />
      </Suspense>
      <Suspense fallback={<Block h="h-40" label="Loading council status" />}>
        <CouncilStatus trace={trace} entityId={entityId} />
      </Suspense>
      <Suspense fallback={<Block h="h-40" label="Loading next steps" />}>
        <NextStep risk={risk} evidence={evidence} trace={trace} entityId={entityId} />
      </Suspense>

      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.brief} />
    </div>
  )
}

function Block({ h, label }: { h: string; label: string }) {
  return <Skeleton className={`w-full ${h}`} aria-busy="true" aria-label={label} />
}
