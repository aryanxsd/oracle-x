import { Suspense } from "react"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { GraphExplorer } from "@/components/graph/graph-explorer"
import { EntitySearch } from "@/components/shell/entity-search"
import { getIdentity } from "@/lib/server/investigation"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { DEMO_ENTITY_ID } from "@/lib/constants"
import { navItem } from "@/lib/nav"

export const dynamic = "force-dynamic"
export const metadata = { title: "Entity Graph" }

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const raw = (await searchParams).entity
  const entityId = (raw ?? DEMO_ENTITY_ID).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  const identity = await getIdentity(entityId)
  if (!identity) notFound()

  return (
    <>
      <PageHeader item={navItem("graph")}>
        <div className="w-full max-w-sm">
          <EntitySearch />
        </div>
      </PageHeader>
      <h2 className="-mt-2 mb-4 text-lg font-semibold">
        Connections of {identity.name} <span className="font-normal text-muted-foreground">({entityId})</span>
      </h2>
      <Suspense>
        <GraphExplorer entityId={entityId} />
      </Suspense>
      <div className="mt-6">
        <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.graph} />
      </div>
    </>
  )
}
