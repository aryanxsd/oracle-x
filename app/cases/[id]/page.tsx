import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { BriefList, CaseFileView, CouncilReport } from "@/components/cases/report"
import { PrintButton } from "@/components/cases/print-button"
import { getCaseBriefs, getCaseFile, getCouncilCase } from "@/lib/server/cases"
import { CASE_FILE_ID_RE, COUNCIL_RUN_ID_RE, parseReport } from "@/lib/case-types"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { fmtDate, humanize } from "@/lib/format"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id)
  if (!CASE_FILE_ID_RE.test(id) && !COUNCIL_RUN_ID_RE.test(id)) notFound()
  return { title: `Case file ${id}` }
}

/** A readable case report: an ORACLE council report (run id) or a historical case file (CF-…). */
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id)
  if (CASE_FILE_ID_RE.test(id)) return <HistoricalCase id={id} />
  if (!COUNCIL_RUN_ID_RE.test(id)) notFound()
  const c = await getCouncilCase(id)
  if (!c) notFound()
  const briefs = getCaseBriefs(id)
  briefs.catch(() => {})
  const report = parseReport(c.finalResponse)
  const e = c.entityId

  return (
    <article className="space-y-6" data-testid="council-case">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Investigation case report · ORACLE investigation council</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{report.title ?? `Council report for ${c.entityName ?? e}`}</h1>
            <p className="text-sm text-muted-foreground">
              {c.entityName ?? e} ({e}) · run <span className="font-mono">{c.id}</span>
            </p>
          </div>
          <PrintButton />
        </div>
        <Card>
          <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6" data-testid="run-facts">
            <Fact label="Status">{humanize(c.status)}</Fact>
            <Fact label="Started">{fmtDate(c.startedAt)}</Fact>
            <Fact label="Finished">{fmtDate(c.finishedAt)}</Fact>
            <Fact label="Duration">{c.totalSeconds != null ? `${Math.round(c.totalSeconds / 60)} min (${c.totalSeconds}s)` : "—"}</Fact>
            <Fact label="Specialists">
              {c.specialistsOk ?? "—"} answered{c.specialistsFailed ? `, ${c.specialistsFailed} failed` : ""}
            </Fact>
            <Fact label="Mode">{c.mode === "PHASED_ASYNC" ? "Full council" : humanize(c.mode)}</Fact>
          </CardContent>
        </Card>
        <nav aria-label="Related screens" className="flex flex-wrap gap-3 text-sm print:hidden" data-testid="case-links">
          <Link href={`/investigations/${e}`} className="text-primary hover:underline">Investigation</Link>
          <Link href={`/evidence?entity=${e}`} className="text-primary hover:underline">Evidence</Link>
          <Link href={`/graph?entity=${e}`} className="text-primary hover:underline">Entity Graph</Link>
          <Link href={`/scenarios?entity=${e}`} className="text-primary hover:underline">Scenarios</Link>
          <Link href={`/similar-cases?entity=${e}`} className="text-primary hover:underline">Similar Cases</Link>
          <Link href={`/cases?entity=${e}`} className="text-primary hover:underline">All case files</Link>
        </nav>
        <p className="text-xs text-muted-foreground">
          This is the council’s stored report, shown as written. It is a model-assisted analysis for review, not a finding of fraud or money laundering. The
          backend has no separate case-file record for {e}.
        </p>
      </header>

      {c.finalResponse ? (
        <CouncilReport report={report} />
      ) : (
        <p className="text-sm text-muted-foreground">This council run has no final report ({humanize(c.status).toLowerCase()}).</p>
      )}

      <section aria-labelledby="briefs" className="space-y-3 break-before-page">
        <h2 id="briefs" className="text-lg font-semibold">Specialist briefs</h2>
        <p className="text-sm text-muted-foreground">What each specialist reported to ORACLE before the final report was written.</p>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <Briefs briefs={briefs} />
        </Suspense>
      </section>
      <div className="print:hidden">
        <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.cases} />
      </div>
    </article>
  )
}

async function Briefs({ briefs }: { briefs: ReturnType<typeof getCaseBriefs> }) {
  try {
    return <BriefList briefs={await briefs} />
  } catch (err) {
    console.error(new Date().toISOString(), "[oracle-x] case briefs", err)
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn’t load the specialist briefs from Snowflake.
      </p>
    )
  }
}

async function HistoricalCase({ id }: { id: string }) {
  const f = await getCaseFile(id)
  if (!f) notFound()
  const s = f.subjectId
  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Historical case file</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{f.title ?? f.id}</h1>
            <p className="text-sm text-muted-foreground">
              {f.subjectName ?? s ?? "—"}
              {s && <> ({s})</>} · <span className="font-mono">{f.id}</span>
            </p>
          </div>
          <PrintButton />
        </div>
        {s && (
          <nav aria-label="Related screens" className="flex flex-wrap gap-3 text-sm print:hidden" data-testid="case-links">
            <Link href={`/graph?entity=${s}`} className="text-primary hover:underline">Entity Graph</Link>
            <Link href={`/evidence?entity=${s}`} className="text-primary hover:underline">Evidence</Link>
            <Link href={`/similar-cases`} className="text-primary hover:underline">Similar Cases</Link>
            <Link href={`/cases`} className="text-primary hover:underline">All case files</Link>
          </nav>
        )}
        <p className="text-xs text-muted-foreground">A closed historical investigation. Its outcome is context only and is not a prediction for any current entity.</p>
      </header>
      <CaseFileView f={f} />
    </article>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  )
}
