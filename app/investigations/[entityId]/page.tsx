import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Network, FlaskConical, Shapes, FileText, Waypoints, Dna, Bot, ClipboardCheck, ClipboardList } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CouncilPipeline } from "@/components/oracle/council-pipeline"
import { CouncilRunner } from "@/components/oracle/council-runner"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { RiskHeader } from "@/components/investigation/risk-header"
import { DimensionBreakdown } from "@/components/investigation/dimension-breakdown"
import { EvidenceCompleteness, SignalEvidence } from "@/components/investigation/evidence-panels"
import { TimeMachine } from "@/components/investigation/time-machine"
import { getEvents, getIdentity, getRiskSummary, getTimeline, type Identity } from "@/lib/server/investigation"
import { getEvidenceOverview } from "@/lib/server/evidence"
import { getLatestCouncilRunId } from "@/lib/server/council"
import { getBandConfig } from "@/lib/server/risk"
import { PAGE_SOURCES } from "@/lib/data-sources"

export const dynamic = "force-dynamic"

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/

const SECTIONS = [
  { id: "risk", label: "Risk" },
  { id: "evidence", label: "Evidence" },
  { id: "time", label: "Time Machine" },
  { id: "council", label: "Council" },
]

export async function generateMetadata({ params }: { params: Promise<{ entityId: string }> }) {
  const entityId = decodeURIComponent((await params).entityId).toUpperCase()
  // Validate before streaming starts so an invalid id gets a fully rendered 404 page.
  if (!ID_RE.test(entityId)) notFound()
  return { title: `Investigation ${entityId}` }
}

/**
 * Investigation workspace. Only the (fast) identity lookup blocks the page so unknown entities get
 * a real 404; every other section streams in independently from its own Snowflake object.
 */
export default async function InvestigationPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId: raw } = await params
  const entityId = decodeURIComponent(raw).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()

  const [identity, latestRun] = await Promise.all([getIdentity(entityId), getLatestCouncilRunId(entityId)])
  if (!identity) notFound()

  // Start all section queries now (in parallel); each Suspense boundary awaits its own promise.
  const risk = getRiskSummary(entityId)
  const evidence = getEvidenceOverview(entityId)
  const timeline = getTimeline(entityId)
  const events = getEvents(entityId)
  const bands = getBandConfig()
  for (const p of [risk, evidence, timeline, events, bands]) p.catch(() => {}) // errors are rendered per section

  return (
    <div className="space-y-6">
      <Suspense fallback={<HeaderSkeleton identity={identity} />}>
        <HeaderSection identity={identity} risk={risk} />
      </Suspense>

      <nav aria-label="Investigation sections" className="sticky top-16 z-10 -mx-1 flex flex-wrap items-center gap-1 rounded-xl border bg-background/90 p-1 backdrop-blur">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
            {s.label}
          </a>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
        <Link href={`/investigations/${entityId}/decision-brief`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <ClipboardList className="h-4 w-4" aria-hidden /> Decision Brief
        </Link>
        <QuickLink href={`/graph?entity=${entityId}`} icon={<Network className="h-4 w-4" aria-hidden />} label="Connections" />
        <QuickLink href={`/blast-radius?entity=${entityId}`} icon={<Waypoints className="h-4 w-4" aria-hidden />} label="View blast radius" />
        <QuickLink href={`/scenarios?entity=${entityId}`} icon={<FlaskConical className="h-4 w-4" aria-hidden />} label="Compare scenarios" />
        <QuickLink href={`/risk-dna?entity=${entityId}`} icon={<Dna className="h-4 w-4" aria-hidden />} label="View Risk DNA" />
        <QuickLink href={`/similar-cases?entity=${entityId}`} icon={<Shapes className="h-4 w-4" aria-hidden />} label="Find Similar Investigations" />
        <QuickLink href={latestRun ? `/cases/${encodeURIComponent(latestRun)}` : `/cases?entity=${entityId}`} icon={<FileText className="h-4 w-4" aria-hidden />} label="Open case file" />
        <QuickLink href={`/agent-trace?entity=${entityId}${latestRun ? `&run=${encodeURIComponent(latestRun)}` : ""}`} icon={<Bot className="h-4 w-4" aria-hidden />} label="View Agent Trace" />
        <QuickLink href={latestRun ? `/evaluation?council=${encodeURIComponent(latestRun)}` : "/evaluation"} icon={<ClipboardCheck className="h-4 w-4" aria-hidden />} label="View Evaluation" />
      </nav>

      <section id="risk" className="scroll-mt-32 space-y-4">
        <Suspense fallback={<BlockSkeleton rows={8} label="Loading risk dimensions" />}>
          <RiskSection risk={risk} evidence={evidence} bands={bands} entityId={entityId} />
        </Suspense>
      </section>

      <section id="evidence" className="scroll-mt-32 space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Evidence for and against</h2>
        <Suspense fallback={<BlockSkeleton rows={4} label="Loading evidence" />}>
          <EvidenceSection evidence={evidence} entityId={entityId} />
        </Suspense>
      </section>

      <section id="time" className="scroll-mt-32">
        <Suspense fallback={<BlockSkeleton rows={5} label="Loading risk history" />}>
          <TimeSection timeline={timeline} events={events} bands={bands} />
        </Suspense>
      </section>

      <section id="council" className="scroll-mt-32">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ORACLE investigation council</CardTitle>
            <p className="text-sm text-muted-foreground">
              Investigator → Risk Analyst → Compliance → Skeptic → Scenario → ORACLE. The Skeptic always challenges the findings
              before ORACLE writes the final, evidence-grounded answer.
            </p>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<CouncilPipeline />}>
              <CouncilRunner entityId={entityId} initialRunId={latestRun} />
            </Suspense>
          </CardContent>
        </Card>
      </section>

      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.investigations} />
    </div>
  )
}

type P<T> = Promise<T>
type Bands = P<Awaited<ReturnType<typeof getBandConfig>>>

async function HeaderSection({ identity, risk }: { identity: Identity; risk: P<Awaited<ReturnType<typeof getRiskSummary>>> }) {
  return <RiskHeader identity={identity} risk={await settle(risk)} />
}

async function RiskSection({ risk, evidence, bands, entityId }: { entityId: string; risk: P<Awaited<ReturnType<typeof getRiskSummary>>>; evidence: P<Awaited<ReturnType<typeof getEvidenceOverview>>>; bands: Bands }) {
  let r, e, b
  try {
    ;[r, e, b] = await Promise.all([risk, evidence, bands])
  } catch (err) {
    return <SectionError what="the risk breakdown" err={err} />
  }
  if (!r) return <p className="text-sm text-muted-foreground">This entity has no risk score in the ORACLE X model.</p>
  return (
    <>
      <DimensionBreakdown risk={r} claims={e.claims} bands={b} entityId={entityId} />
      {r.dedupExplanation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Why the adjusted score is lower <ProvenanceChip kind="MODEL OUTPUT" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              The adjusted model (v2) stops the same facts being counted twice across dimensions. It removed{" "}
              <strong>{r.dedupAdjustment?.toFixed(2)} points</strong>; the band is {r.bandDedup?.toLowerCase()} in the adjusted model and{" "}
              {r.band.toLowerCase()} in the standard model.
            </p>
            <TechnicalDetails title="Adjustment rules applied">
              <p className="whitespace-pre-wrap text-muted-foreground">{r.dedupExplanation}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{r.explanation}</p>
            </TechnicalDetails>
          </CardContent>
        </Card>
      )}
    </>
  )
}

async function EvidenceSection({ evidence, entityId }: { evidence: P<Awaited<ReturnType<typeof getEvidenceOverview>>>; entityId: string }) {
  let e
  try {
    e = await evidence
  } catch (err) {
    return <SectionError what="the evidence" err={err} />
  }
  return (
    <>
      <EvidenceCompleteness balance={e.balance} claims={e.claims} />
      <SignalEvidence claims={e.claims} entityId={entityId} />
      <Link href={`/evidence?entity=${entityId}`} className="inline-block text-sm font-medium text-primary hover:underline">
        Open the full evidence view →
      </Link>
    </>
  )
}

async function TimeSection({ timeline, events, bands }: { timeline: P<Awaited<ReturnType<typeof getTimeline>>>; events: P<Awaited<ReturnType<typeof getEvents>>>; bands: Bands }) {
  let t, ev, b
  try {
    ;[t, ev, b] = await Promise.all([timeline, events, bands])
  } catch (err) {
    return <SectionError what="the risk history" err={err} />
  }
  if (!t) return <p className="text-sm text-muted-foreground">No risk history is available for this entity.</p>
  return <TimeMachine points={t.points} abnormalStart={t.abnormalStart} abnormalStartDedup={t.abnormalStartDedup} abnormalBeforeTimelineStart={t.abnormalBeforeTimelineStart} events={ev} bands={b} />
}

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch (e) {
    console.error(new Date().toISOString(), "[oracle-x] investigation header", e)
    return null
  }
}

function SectionError({ what, err }: { what: string; err: unknown }) {
  console.error(new Date().toISOString(), `[oracle-x] investigation section: ${what}`, err)
  return (
    <p role="alert" className="text-sm text-destructive">
      Couldn’t load {what} from Snowflake. Refresh the page to try again.
    </p>
  )
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
      {icon} {label}
    </Link>
  )
}

function HeaderSkeleton({ identity }: { identity: Identity }) {
  return (
    <div className="rounded-xl border p-6" aria-busy="true">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {identity.type.toLowerCase()} · {identity.entityId}
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{identity.name}</h1>
      <Skeleton className="mt-5 h-4 w-full max-w-2xl" />
      <Skeleton className="mt-2 h-4 w-full max-w-xl" />
      <p className="mt-3 text-xs text-muted-foreground">Loading the current risk score…</p>
    </div>
  )
}

function BlockSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <div className="rounded-xl border p-6" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="py-2.5">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="mt-2 h-2 w-full" />
        </div>
      ))}
    </div>
  )
}
