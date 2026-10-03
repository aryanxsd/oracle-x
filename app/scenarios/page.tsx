import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { Skeleton } from "@/components/ui/skeleton"
import { EntitySearch } from "@/components/shell/entity-search"
import { ScenarioCompare } from "@/components/impact/scenario-compare"
import { isReadOnly } from "@/lib/server/read-only"
import { getIdentity } from "@/lib/server/investigation"
import { getLatestScenarios } from "@/lib/server/impact"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { DEMO_ENTITY_ID } from "@/lib/constants"
import { navItem } from "@/lib/nav"

export const dynamic = "force-dynamic"
export const metadata = { title: "Scenarios" }

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/

/** Reads the latest stored scenario run; the backend tool only runs when the user presses Re-run. */
export default async function ScenariosPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const entityId = ((await searchParams).entity ?? DEMO_ENTITY_ID).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  const identity = await getIdentity(entityId)
  if (!identity) notFound()
  const set = getLatestScenarios(entityId)
  set.catch(() => {})

  return (
    <div className="space-y-6">
      <PageHeader item={navItem("scenarios")}>
        <div className="w-full max-w-sm">
          <EntitySearch />
        </div>
      </PageHeader>
      <h2 className="-mt-2 text-lg font-semibold">
        {identity.name} <span className="font-normal text-muted-foreground">({entityId})</span>
        <Link href={`/blast-radius?entity=${entityId}`} className="ml-3 text-sm font-normal text-primary hover:underline">
          View blast radius
        </Link>
        <Link href={`/investigations/${entityId}`} className="ml-3 text-sm font-normal text-primary hover:underline">
          Open investigation
        </Link>
      </h2>
      <Suspense fallback={<Block />}>
        <Body entityId={entityId} set={set} />
      </Suspense>
      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.scenarios} />
    </div>
  )
}

async function Body({ entityId, set }: { entityId: string; set: ReturnType<typeof getLatestScenarios> }) {
  let s
  try {
    s = await set
  } catch (err) {
    console.error(new Date().toISOString(), "[oracle-x] scenarios page", err)
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn’t load the scenarios from Snowflake. Refresh the page to try again.
      </p>
    )
  }
  return <ScenarioCompare entityId={entityId} initial={s} readOnly={isReadOnly()} />
}

function Block() {
  return (
    <div className="grid gap-4 md:grid-cols-3" aria-busy="true" aria-label="Loading scenarios">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-56" />
      ))}
    </div>
  )
}
