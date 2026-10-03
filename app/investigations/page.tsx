import Link from "next/link"
import { Suspense } from "react"
import { ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/oracle/page-header"
import { RiskBandBadge } from "@/components/oracle/risk-band-badge"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { EntitySearch } from "@/components/shell/entity-search"
import { getWorklist } from "@/lib/server/worklist"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { navItem } from "@/lib/nav"
import { asBand } from "@/lib/risk-style"
import { fmtDate, fmtScore } from "@/lib/format"

export const dynamic = "force-dynamic"
export const metadata = { title: "Investigations" }

export default function InvestigationsPage() {
  return (
    <>
      <PageHeader item={navItem("investigations")} />
      <div className="space-y-6">
        <div className="max-w-2xl">
          <EntitySearch size="lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Worklist</CardTitle>
            <p className="text-sm text-muted-foreground">Entities under investigation first, then the highest risk scores from the ORACLE X model.</p>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ListSkeleton />}>
              <Worklist />
            </Suspense>
          </CardContent>
        </Card>
        <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.investigations} />
      </div>
    </>
  )
}

async function Worklist() {
  let items
  try {
    items = await getWorklist(12)
  } catch (e) {
    console.error(new Date().toISOString(), "[oracle-x] worklist", e)
    return <p role="alert" className="text-sm text-destructive">Couldn’t load the worklist from Snowflake. Refresh to try again.</p>
  }
  if (!items.length) return <p className="text-sm text-muted-foreground">No scored entities yet.</p>
  return (
    <ul className="divide-y">
      {items.map((i) => {
        const band = asBand(i.band)
        return (
          <li key={i.entityId}>
            <Link href={`/investigations/${i.entityId}`} className="group flex flex-wrap items-center gap-x-6 gap-y-2 py-3 hover:bg-accent/40 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium group-hover:text-primary">{i.name}</span>
                  {i.isSubject && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Under investigation</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {i.entityId} · {i.type.toLowerCase()}
                  {i.lastRunAt && ` · last council ${fmtDate(i.lastRunAt)} (${String(i.lastRunStatus).toLowerCase()})`}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm tabular-nums">
                <span className="font-semibold">{fmtScore(i.score, 1)}</span>
                {band && <RiskBandBadge band={band} />}
                {i.scoreDedup != null && Math.abs(i.scoreDedup - i.score) > 0.005 && <span className="text-xs text-muted-foreground">adjusted {fmtScore(i.scoreDedup, 1)}</span>}
              </div>
              <ArrowRight className="hidden h-4 w-4 text-muted-foreground group-hover:text-primary sm:block" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading worklist">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  )
}
