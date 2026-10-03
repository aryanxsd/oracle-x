import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { Skeleton } from "@/components/ui/skeleton"
import { EntitySearch } from "@/components/shell/entity-search"
import { DnaProfile } from "@/components/dna/dna-profile"
import { DnaInterpretation } from "@/components/dna/dna-interpretation"
import { ModelComparison } from "@/components/risk/risk-panels"
import { getIdentity } from "@/lib/server/investigation"
import { getRiskDna } from "@/lib/server/dna"
import { getEvidenceOverview } from "@/lib/server/evidence"
import { getRiskCached } from "@/lib/server/risk"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { DEMO_ENTITY_ID } from "@/lib/constants"
import { navItem } from "@/lib/nav"

export const dynamic = "force-dynamic"
export const metadata = { title: "Risk DNA" }

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/

/**
 * Risk DNA. Identity blocks (real 404); the DNA profile, the interpretation (needs the slower risk
 * score) and the risk-score comparison stream in independently.
 */
export default async function RiskDnaPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const entityId = ((await searchParams).entity ?? DEMO_ENTITY_ID).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  const identity = await getIdentity(entityId)
  if (!identity) notFound()
  const dna = getRiskDna(entityId)
  const evidence = getEvidenceOverview(entityId)
  const risk = getRiskCached(entityId)
  for (const p of [dna, evidence, risk]) p.catch(() => {})

  return (
    <div className="space-y-6">
      <PageHeader item={navItem("dna")}>
        <div className="w-full max-w-sm">
          <EntitySearch />
        </div>
      </PageHeader>
      <h2 className="-mt-2 text-lg font-semibold">
        Risk DNA of {identity.name} <span className="font-normal text-muted-foreground">({entityId})</span>
        <span className="ml-3 inline-flex flex-wrap gap-3 text-sm font-normal">
          <Link href={`/investigations/${entityId}`} className="text-primary hover:underline">Investigation</Link>
          <Link href={`/evidence?entity=${entityId}`} className="text-primary hover:underline">Evidence</Link>
          <Link href={`/graph?entity=${entityId}`} className="text-primary hover:underline">Entity Graph</Link>
          <Link href={`/similar-cases?entity=${entityId}`} className="text-primary hover:underline">Find similar investigations</Link>
        </span>
      </h2>

      <Suspense fallback={<Block label="Loading the risk pattern" h="h-40" />}>
        <Interpretation entityId={entityId} dna={dna} risk={risk} evidence={evidence} />
      </Suspense>
      <Suspense fallback={<Block label="Loading the Risk DNA" h="h-72" />}>
        <Profile entityId={entityId} dna={dna} evidence={evidence} />
      </Suspense>
      <section aria-labelledby="score-dims" className="space-y-2">
        <h3 id="score-dims" className="text-base font-semibold">
          Risk score dimensions{" "}
          <Link href={`/risk?entity=${entityId}`} className="ml-2 text-sm font-normal text-primary hover:underline">
            Open Risk Intelligence
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          The risk score is a separate model with eight weighted dimensions (including account behaviour) and a standard and adjusted version. Risk DNA itself has no
          weights or points.
        </p>
        <Suspense fallback={<Block label="Loading the risk score" h="h-48" />}>
          <ScoreDims risk={risk} />
        </Suspense>
      </section>
      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.dna} />
    </div>
  )
}

type Dna = ReturnType<typeof getRiskDna>
type Ev = ReturnType<typeof getEvidenceOverview>
type Risk = ReturnType<typeof getRiskCached>

async function Profile({ entityId, dna, evidence }: { entityId: string; dna: Dna; evidence: Ev }) {
  let d
  try {
    d = await dna
  } catch (err) {
    return <SectionError what="the Risk DNA" err={err} />
  }
  const ev = await evidence.catch(() => null)
  const claims = ev ? ev.claims.map((c) => ({ claimId: c.claimId, claim: c.claim, signalType: c.signalType })) : null
  return <DnaProfile entityId={entityId} snapshots={d.snapshots} claims={claims} />
}

async function Interpretation({ entityId, dna, risk, evidence }: { entityId: string; dna: Dna; risk: Risk; evidence: Ev }) {
  let d
  try {
    d = await dna
  } catch (err) {
    return <SectionError what="the risk pattern" err={err} />
  }
  if (!d.snapshots.length) return null
  const [r, ev] = await Promise.all([risk.catch(() => null), evidence.catch(() => null)])
  return <DnaInterpretation entityId={entityId} snapshot={d.snapshots[0]} risk={r} balance={ev?.balance ?? null} />
}

async function ScoreDims({ risk }: { risk: Risk }) {
  let r
  try {
    r = await risk
  } catch (err) {
    return <SectionError what="the risk score" err={err} />
  }
  if (!r) return <p className="text-sm text-muted-foreground">This entity has no risk score.</p>
  return <ModelComparison risk={r} />
}

function SectionError({ what, err }: { what: string; err: unknown }) {
  console.error(new Date().toISOString(), `[oracle-x] risk dna: ${what}`, err)
  return (
    <p role="alert" className="text-sm text-destructive">
      Couldn’t load {what} from Snowflake. Refresh the page to try again.
    </p>
  )
}

function Block({ label, h }: { label: string; h: string }) {
  return (
    <div className="rounded-xl border p-6" aria-busy="true" aria-label={label}>
      <p className="mb-3 text-xs text-muted-foreground">{label}…</p>
      <Skeleton className={`${h} w-full`} />
    </div>
  )
}
