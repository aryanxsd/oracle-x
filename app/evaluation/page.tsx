import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/oracle/page-header"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { EvalRunList } from "@/components/eval/eval-views"
import { listEvalRuns } from "@/lib/server/evaluation"
import { PAGE_SOURCES } from "@/lib/data-sources"
import { navItem } from "@/lib/nav"

export const dynamic = "force-dynamic"
export const metadata = { title: "Evaluation" }

const RUN_RE = /^[A-Za-z0-9_-]{1,64}$/

/** Stored evaluation runs (EVAL.EVAL_RUNS). Never starts the evaluator. */
export default async function EvaluationPage({ searchParams }: { searchParams: Promise<{ council?: string }> }) {
  const council = (await searchParams).council ?? null
  if (council != null && !RUN_RE.test(council)) notFound()
  let runs
  let fellBack = false
  try {
    runs = await listEvalRuns(council)
    if (council && runs.length === 0) {
      runs = await listEvalRuns(null)
      fellBack = true
    }
  } catch (err) {
    console.error(new Date().toISOString(), "[oracle-x] evaluation list", err)
    runs = null
  }
  return (
    <div className="space-y-6">
      <PageHeader item={navItem("evaluation")} />
      <p className="max-w-3xl text-sm text-muted-foreground">
        Every council answer can be checked twice: by fixed rules (required specialists, tools, facts and forbidden claims) and by an independent AI judge. These are the
        stored results — nothing here is re-scored.
      </p>
      {council && (
        <p className="text-sm" data-testid="council-filter">
          {fellBack ? (
            <>
              No evaluation is stored for this council run (<span className="font-mono">{council}</span>). Showing all stored evaluations instead.
            </>
          ) : (
            <>
              Showing evaluations of council run <span className="font-mono">{council}</span>.{" "}
              <Link href="/evaluation" className="text-primary hover:underline">
                Show all
              </Link>
            </>
          )}
        </p>
      )}
      {runs == null ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t load evaluation results from Snowflake. Refresh the page to try again.
        </p>
      ) : (
        <EvalRunList runs={runs} />
      )}
      <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES.evaluation} />
    </div>
  )
}
