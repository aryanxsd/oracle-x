import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { Skeleton } from "@/components/ui/skeleton"
import { EntitySearch } from "@/components/shell/entity-search"
import { BlastSummary, ConnectedEntities } from "@/components/impact/blast-summary"
import { getIdentity } from "@/lib/server/investigation"
import { getBlastRadius } from "@/lib/server/impact"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { DEMO_ENTITY_ID } from "@/lib/constants"
import { navItem } from "@/lib/nav"

export const dynamic = "force-dynamic"
export const metadata = { title: "Blast Radius" }

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/

export default async function BlastRadiusPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const entityId = ((await searchParams).entity ?? DEMO_ENTITY_ID).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  const identity = await getIdentity(entityId)
  if (!identity) notFound()
  const br = getBlastRadius(entityId)
  br.catch(() => {})

  return (
    <div className="space-y-6">
      <PageHeader item={navItem("blast")}>
        <div className="w-full max-w-sm">
          <EntitySearch />
        </div>
      </PageHeader>
      <h2 className="-mt-2 text-lg font-semibold">
        If {identity.name} is risky, what else could be affected?
        <Link href={`/scenarios?entity=${entityId}`} className="ml-3 text-sm font-normal text-primary hover:underline">
          Compare scenarios
        </Link>
        <Link href={`/graph?entity=${entityId}`} className="ml-3 text-sm font-normal text-primary hover:underline">
          Entity Graph
        </Link>
      </h2>
      <Suspense fallback={<Block label="Loading the blast radius" />}>
        <Body name={identity.name} br={br} />
      </Suspense>
      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.blast} />
    </div>
  )
}

async function Body({ name, br }: { name: string; br: ReturnType<typeof getBlastRadius> }) {
  let b
  try {
    b = await br
  } catch (err) {
    console.error(new Date().toISOString(), "[oracle-x] blast radius page", err)
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn’t load the blast radius from Snowflake. Refresh the page to try again.
      </p>
    )
  }
  if (!b) return <p className="text-sm text-muted-foreground">No blast radius has been computed for this entity.</p>
  return (
    <>
      <BlastSummary entityName={name} br={b} />
      <ConnectedEntities br={b} />
    </>
  )
}

function Block({ label }: { label: string }) {
  return (
    <div className="rounded-xl border p-6" aria-busy="true" aria-label={label}>
      <p className="mb-3 text-xs text-muted-foreground">{label}…</p>
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  )
}
