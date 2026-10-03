import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { Skeleton } from "@/components/ui/skeleton"
import { EntitySearch } from "@/components/shell/entity-search"
import { DimensionClaims, EvidenceByKind, EvidenceCompleteness, SignalEvidence } from "@/components/investigation/evidence-panels"
import { getIdentity } from "@/lib/server/investigation"
import { getEvidenceOverview } from "@/lib/server/evidence"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { DEMO_ENTITY_ID } from "@/lib/constants"
import { navItem } from "@/lib/nav"
import { PROVENANCE_STYLE, type Provenance } from "@/lib/risk-style"

export const dynamic = "force-dynamic"
export const metadata = { title: "Evidence" }

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/
const CLAIM_RE = /^[A-Z0-9][A-Z0-9@:_-]{2,80}$/

/**
 * Evidence + WHY. Identity blocks (real 404 for unknown ids); the evidence summary streams in.
 * Per-claim source records load only when the user asks (WHY → "Show the individual source records").
 * `?claim=<id>` opens that claim directly (used by WHY links elsewhere).
 */
export default async function EvidencePage({ searchParams }: { searchParams: Promise<{ entity?: string; claim?: string }> }) {
  const sp = await searchParams
  const entityId = (sp.entity ?? DEMO_ENTITY_ID).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  const openClaim = sp.claim && CLAIM_RE.test(sp.claim) ? sp.claim : null
  const identity = await getIdentity(entityId)
  if (!identity) notFound()
  const evidence = getEvidenceOverview(entityId)
  evidence.catch(() => {})

  return (
    <div className="space-y-6">
      <PageHeader item={navItem("evidence")}>
        <div className="w-full max-w-sm">
          <EntitySearch />
        </div>
      </PageHeader>
      <h2 className="-mt-2 text-lg font-semibold">
        Evidence for {identity.name} <span className="font-normal text-muted-foreground">({entityId})</span>
        <Link href={`/investigations/${entityId}`} className="ml-3 text-sm font-normal text-primary hover:underline">
          Open investigation
        </Link>
        <Link href={`/graph?entity=${entityId}`} className="ml-3 text-sm font-normal text-primary hover:underline">
          Connections
        </Link>
      </h2>
      <ProvenanceLegend />
      <Suspense fallback={<Block label="Loading the evidence" rows={4} />}>
        <EvidenceBody entityId={entityId} evidence={evidence} openClaim={openClaim} />
      </Suspense>
      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.evidence} />
    </div>
  )
}

async function EvidenceBody({ entityId, evidence, openClaim }: { entityId: string; evidence: ReturnType<typeof getEvidenceOverview>; openClaim: string | null }) {
  let e
  try {
    e = await evidence
  } catch (err) {
    console.error(new Date().toISOString(), "[oracle-x] evidence page", err)
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn’t load the evidence from Snowflake. Refresh the page to try again.
      </p>
    )
  }
  if (!e.balance && e.claims.length === 0) return <p className="text-sm text-muted-foreground">No evidence is recorded for this entity.</p>
  return (
    <>
      <EvidenceCompleteness balance={e.balance} claims={e.claims} />
      <section aria-labelledby="by-kind" className="space-y-3">
        <h3 id="by-kind" className="text-base font-semibold">
          For, against and missing
        </h3>
        <p className="text-sm text-muted-foreground">
          Every reference recorded on this entity’s risk claims, grouped the way the backend classifies it. These are the references behind the claims; the
          completeness counts above are the backend’s separate weighing of notes, case items, signals and KYC records.
        </p>
        <EvidenceByKind claims={e.claims} kind="supporting" entityId={entityId} />
        <EvidenceByKind claims={e.claims} kind="contradicting" entityId={entityId} />
        <EvidenceByKind claims={e.claims} kind="missing" entityId={entityId} />
      </section>
      <section aria-labelledby="signals" className="space-y-3">
        <h3 id="signals" className="text-base font-semibold">
          Risk signals
        </h3>
        <SignalEvidence claims={e.claims} entityId={entityId} openClaim={openClaim} />
      </section>
      <DimensionClaims claims={e.claims} entityId={entityId} openClaim={openClaim} />
    </>
  )
}

function ProvenanceLegend() {
  const kinds: Provenance[] = ["FACT", "MODEL OUTPUT", "POLICY", "NARRATIVE EVIDENCE", "SCENARIO OUTPUT"]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground" data-testid="provenance-legend">
      {kinds.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <ProvenanceChip kind={k} /> {PROVENANCE_STYLE[k].help}
        </span>
      ))}
    </div>
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
