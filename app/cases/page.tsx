import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { FileText, ScrollText } from "lucide-react"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EntitySearch } from "@/components/shell/entity-search"
import { getIdentity } from "@/lib/server/investigation"
import { listCases } from "@/lib/server/cases"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { DEMO_ENTITY_ID } from "@/lib/constants"
import { navItem } from "@/lib/nav"
import { fmtDate, humanize } from "@/lib/format"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Case Files" }

const ID_RE = /^[A-Z]{1,3}[0-9]{2,6}$/

export default async function CaseFilesPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const entityId = ((await searchParams).entity ?? DEMO_ENTITY_ID).toUpperCase()
  if (!ID_RE.test(entityId)) notFound()
  const identity = await getIdentity(entityId)
  if (!identity) notFound()
  const list = listCases(entityId)
  list.catch(() => {})
  return (
    <div className="space-y-6">
      <PageHeader item={navItem("cases")}>
        <div className="w-full max-w-sm">
          <EntitySearch />
        </div>
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Body name={identity.name} list={list} />
      </Suspense>
      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.cases} />
    </div>
  )
}

async function Body({ name, list }: { name: string; list: ReturnType<typeof listCases> }) {
  let l
  try {
    l = await list
  } catch (err) {
    console.error(new Date().toISOString(), "[oracle-x] case list", err)
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn’t load case files from Snowflake. Refresh the page to try again.
      </p>
    )
  }
  const latest = l.council.find((c) => c.status === "COMPLETED")
  return (
    <>
      <section aria-labelledby="current" className="space-y-3">
        <h2 id="current" className="text-lg font-semibold">
          {name} ({l.entityId}) — investigation case reports
        </h2>
        <p className="text-sm text-muted-foreground">
          The backend has no case-file record for {l.entityId}; its case report is the ORACLE investigation council’s final report. The most recent completed
          report is listed first.
        </p>
        {l.council.length === 0 ? (
          <p className="text-sm text-muted-foreground">No council reports are recorded for this entity yet.</p>
        ) : (
          <ul className="space-y-2" data-testid="council-list">
            {l.council.map((c) => (
              <li key={c.id}>
                <Link href={`/cases/${encodeURIComponent(c.id)}`} className="block">
                  <Card className={cn("transition-colors hover:bg-accent/50", c.id === latest?.id && "border-primary/50")}>
                    <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
                      <ScrollText className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 font-medium">{c.title ?? `Council report ${c.id}`}</span>
                      {c.id === latest?.id && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Latest</span>}
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(c.startedAt)} · {c.mode === "PHASED_ASYNC" ? "Full council" : humanize(c.mode)} · {humanize(c.status)}
                        {c.specialistsOk != null && <> · {c.specialistsOk} specialists</>}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="historical" className="space-y-3">
        <h2 id="historical" className="text-lg font-semibold">
          Historical case files
        </h2>
        <p className="text-sm text-muted-foreground">Closed investigations recorded by analysts. Their outcomes are context, not a prediction for any current entity.</p>
        <ul className="grid gap-2 md:grid-cols-2" data-testid="file-list">
          {l.files.map((f) => (
            <li key={f.id}>
              <Link href={`/cases/${encodeURIComponent(f.id)}`} className="block h-full">
                <Card className="h-full transition-colors hover:bg-accent/50">
                  <CardContent className="space-y-1 p-4 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="font-medium">{f.title ?? f.id}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {f.caseId} · {fmtDate(f.generatedAt)} · {humanize(f.status)}
                    </div>
                    {f.recommendation && <div className="text-xs">Recorded recommendation: {f.recommendation}</div>}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
