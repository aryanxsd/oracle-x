import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { Skeleton } from "@/components/ui/skeleton"
import { EntitySearch } from "@/components/shell/entity-search"
import { SimilarCaseList } from "@/components/dna/similar-cases"
import { getIdentity } from "@/lib/server/investigation"
import { getCaseCharacteristics, getSimilarCases } from "@/lib/server/dna"
import type { CaseCharacteristics } from "@/lib/dna-types"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { DEMO_ENTITY_ID } from "@/lib/constants"
import { navItem } from "@/lib/nav"

export const dynamic = "force-dynamic"
export const metadata = { title: "Similar Investigations" }

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/

export default async function SimilarCasesPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const entityId = ((await searchParams).entity ?? DEMO_ENTITY_ID).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  const identity = await getIdentity(entityId)
  if (!identity) notFound()
  const data = getSimilarCases(entityId)
  data.catch(() => {})
  // Slow-to-compile flags stream separately; a failure only blanks that part of "Why similar?".
  const chars = getCaseCharacteristics(entityId).catch((err) => {
    console.error(new Date().toISOString(), "[oracle-x] similar cases characteristics", err)
    return null
  })

  return (
    <div className="space-y-6">
      <PageHeader item={navItem("similar")}>
        <div className="w-full max-w-sm">
          <EntitySearch />
        </div>
      </PageHeader>
      <h2 className="-mt-2 text-lg font-semibold">
        Have we seen a risk pattern like {identity.name}’s before?
        <span className="ml-3 inline-flex flex-wrap gap-3 text-sm font-normal">
          <Link href={`/investigations/${entityId}`} className="text-primary hover:underline">Investigation</Link>
          <Link href={`/evidence?entity=${entityId}`} className="text-primary hover:underline">Evidence</Link>
          <Link href={`/graph?entity=${entityId}`} className="text-primary hover:underline">Entity Graph</Link>
          <Link href={`/risk-dna?entity=${entityId}`} className="text-primary hover:underline">Risk DNA</Link>
        </span>
      </h2>
      <Suspense fallback={<Block />}>
        <Body data={data} chars={chars} />
      </Suspense>
      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.similar} />
    </div>
  )
}

async function Body({ data, chars }: { data: ReturnType<typeof getSimilarCases>; chars: Promise<CaseCharacteristics | null> }) {
  let d
  try {
    d = await data
  } catch (err) {
    console.error(new Date().toISOString(), "[oracle-x] similar cases", err)
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn’t load similar investigations from Snowflake. Refresh the page to try again.
      </p>
    )
  }
  return <SimilarCaseList data={d} chars={chars} />
}

function Block() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading similar investigations">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  )
}
