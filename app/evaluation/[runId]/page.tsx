import { notFound } from "next/navigation"
import Link from "next/link"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { EvalRunView } from "@/components/eval/eval-views"
import { getEvalRun } from "@/lib/server/evaluation"
import { EVAL_RUN_ID_RE } from "@/lib/trace-types"
import { PAGE_SOURCES } from "@/lib/data-sources"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ runId: string }> }) {
  const id = decodeURIComponent((await params).runId)
  if (!EVAL_RUN_ID_RE.test(id)) notFound()
  return { title: `Evaluation ${id}` }
}

export default async function EvaluationRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const id = decodeURIComponent((await params).runId)
  if (!EVAL_RUN_ID_RE.test(id)) notFound()
  const r = await getEvalRun(id)
  if (!r) notFound()
  const e = r.entityId
  return (
    <article className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Evaluation run</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {r.caseId ? `Case ${r.caseId}` : "Evaluation"}
          {r.situation && <span className="font-normal text-muted-foreground"> — {r.situation}</span>}
        </h1>
        <p className="font-mono text-sm text-muted-foreground">{r.evalRunId}</p>
        <nav className="mt-3 flex flex-wrap gap-3 text-sm" aria-label="Related screens" data-testid="eval-links">
          {r.councilRunId && e && (
            <Link href={`/agent-trace?entity=${e}&run=${encodeURIComponent(r.councilRunId)}`} className="text-primary hover:underline">
              Agent trace of council run
            </Link>
          )}
          {r.councilRunId && (
            <Link href={`/cases/${encodeURIComponent(r.councilRunId)}`} className="text-primary hover:underline">
              Council report
            </Link>
          )}
          {e && (
            <Link href={`/investigations/${e}`} className="text-primary hover:underline">
              Investigation
            </Link>
          )}
          <Link href="/evaluation" className="text-primary hover:underline">
            All evaluations
          </Link>
        </nav>
      </header>
      <EvalRunView r={r} />
      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.evaluation} />
    </article>
  )
}
