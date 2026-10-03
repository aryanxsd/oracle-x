import Link from "next/link"
import { CheckCircle2, CircleHelp, TriangleAlert, XCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Markdown } from "@/components/oracle/markdown"
import { checkStatus, criterionLabel, type EvalResult, type EvalRunDetail, type EvalRunSummary } from "@/lib/trace-types"
import { fmtDate, humanize } from "@/lib/format"
import { cn } from "@/lib/utils"

type Verdict = "PASS" | "WARNING" | "FAIL" | "UNKNOWN"

/** Overall run status exactly as stored; anything that is not PASS/FAIL is shown as a warning with its own text. */
export function overallVerdict(s: string | null): Verdict {
  const u = (s ?? "").toUpperCase()
  if (u === "PASS" || u === "PASSED") return "PASS"
  if (u === "FAIL" || u === "FAILED") return "FAIL"
  return u ? "WARNING" : "UNKNOWN"
}

const V_STYLE: Record<Verdict, { cls: string; icon: React.ReactNode; label: string }> = {
  PASS: { cls: "bg-band-normal/12 text-band-normal", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />, label: "PASS" },
  WARNING: { cls: "bg-amber-500/12 text-amber-800 dark:text-amber-300", icon: <TriangleAlert className="h-3.5 w-3.5" aria-hidden />, label: "WARNING" },
  FAIL: { cls: "bg-destructive/10 text-destructive", icon: <XCircle className="h-3.5 w-3.5" aria-hidden />, label: "FAIL" },
  UNKNOWN: { cls: "bg-muted text-muted-foreground", icon: <CircleHelp className="h-3.5 w-3.5" aria-hidden />, label: "NOT DETERMINED" },
}

export function Verdict({ v, text }: { v: Verdict; text?: string | null }) {
  const s = V_STYLE[v]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", s.cls)} data-verdict={v}>
      {s.icon} {v === "WARNING" && text ? humanize(text).toUpperCase() : s.label}
    </span>
  )
}

/** Judge scores as stored (EVAL_RUNS.JUDGE_SCORES): numeric scores as chips; text (e.g. the judge's rationale) is kept out of the chips. */
export function JudgeScores({ scores }: { scores: Record<string, unknown> | null }) {
  const nums = Object.entries(scores ?? {}).filter(([, v]) => typeof v === "number" || (typeof v === "string" && /^\d+(\.\d+)?$/.test(v)))
  if (!nums.length) return <span className="text-xs text-muted-foreground">No AI judge scores stored</span>
  return (
    <span className="flex flex-wrap gap-1.5" data-testid="judge-scores">
      {nums.map(([k, v]) => (
        <span key={k} className="rounded-full border px-2 py-0.5 text-xs">
          {humanize(k)}: <strong className="tabular-nums">{String(v)}</strong>
        </span>
      ))}
    </span>
  )
}

/** Any text the judge stored alongside its scores (for example its rationale), rendered as markdown text. */
export function JudgeNotes({ scores }: { scores: Record<string, unknown> | null }) {
  const texts = Object.entries(scores ?? {}).filter(([, v]) => typeof v === "string" && !/^\d+(\.\d+)?$/.test(v)) as [string, string][]
  if (!texts.length) return null
  return (
    <>
      {texts.map(([k, v]) => (
        <details key={k} className="rounded-xl border p-4 text-sm" data-testid={`judge-${k}`}>
          <summary className="cursor-pointer font-medium text-primary hover:underline">AI judge’s {humanize(k).toLowerCase()}</summary>
          <div className="mt-2">
            <Markdown>{v}</Markdown>
          </div>
        </details>
      ))}
    </>
  )
}

export function EvalRunList({ runs }: { runs: EvalRunSummary[] }) {
  if (!runs.length) return <p className="text-sm text-muted-foreground">No evaluation runs are stored yet.</p>
  return (
    <ul className="space-y-2" data-testid="eval-list">
      {runs.map((r) => (
        <li key={r.evalRunId}>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
              <Verdict v={overallVerdict(r.overallStatus)} text={r.overallStatus} />
              <Link href={`/evaluation/${encodeURIComponent(r.evalRunId)}`} className="min-w-0 flex-1 font-medium text-primary hover:underline">
                {r.caseId ? `Case ${r.caseId}` : "Evaluation"}
                {r.situation && <span className="font-normal text-muted-foreground"> — {r.situation}</span>}
              </Link>
              <span className="tabular-nums" data-testid={`counts-${r.evalRunId}`}>
                {r.criteriaPassed ?? "—"} of {r.criteriaTotal ?? "—"} checks passed
              </span>
              <JudgeScores scores={r.judgeScores} />
              <span className="w-full text-xs text-muted-foreground sm:w-auto">
                {fmtDate(r.evaluatedAt)} · council run <span className="font-mono">{r.councilRunId ?? "—"}</span>
              </span>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}

const METHOD_TITLE: Record<string, { title: string; help: string }> = {
  DETERMINISTIC: { title: "Rule-based checks", help: "Fixed rules applied to the council run: required specialists and tools, required facts and phrases, forbidden claims, tool failures and graph limits." },
  LLM_JUDGE: { title: "AI judge evaluation", help: "An independent AI reviewer scored the final answer against the case’s judging focus." },
}

/** One evaluation run: metadata, failed checks first, then each method's checks with technical details on demand. */
export function EvalRunView({ r }: { r: EvalRunDetail }) {
  const failed = r.results.filter((x) => x.passed === false)
  const unknown = r.results.filter((x) => x.passed == null)
  const methods = [...new Set(r.results.map((x) => x.method ?? "OTHER"))].sort((a, b) => (a === "DETERMINISTIC" ? -1 : b === "DETERMINISTIC" ? 1 : a.localeCompare(b)))
  return (
    <div className="space-y-5" data-testid="eval-detail">
      <Card>
        <CardContent className="grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Meta k="Result">
            <Verdict v={overallVerdict(r.overallStatus)} text={r.overallStatus} />
          </Meta>
          <Meta k="Checks passed">
            <span className="tabular-nums" data-testid="detail-counts">
              {r.criteriaPassed ?? "—"} of {r.criteriaTotal ?? "—"}
            </span>
          </Meta>
          <Meta k="Test case">
            {r.caseId ?? "—"}
            {r.situation && <span className="text-muted-foreground"> — {r.situation}</span>}
          </Meta>
          <Meta k="Evaluated">{fmtDate(r.evaluatedAt)}</Meta>
          <Meta k="AI judge">{r.judgeModel ?? "—"}</Meta>
          <Meta k="Judge scores">
            <JudgeScores scores={r.judgeScores} />
          </Meta>
          <Meta k="Specialists consulted">{r.specialistsConsulted.length ? r.specialistsConsulted.map(humanize).join(", ") : "—"}</Meta>
          <Meta k="Council duration">{r.totalSeconds != null ? `${r.totalSeconds}s` : "—"}</Meta>
        </CardContent>
      </Card>
      {r.userQuestion && (
        <p className="text-sm">
          <span className="text-muted-foreground">Question evaluated:</span> {r.userQuestion}
        </p>
      )}
      {(failed.length > 0 || unknown.length > 0) && (
        <Card className="border-destructive/40" data-testid="eval-attention">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Needs attention ({failed.length + unknown.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckList items={[...failed, ...unknown]} />
          </CardContent>
        </Card>
      )}
      {failed.length === 0 && unknown.length === 0 && r.results.length > 0 && (
        <p className="rounded-lg border border-band-normal/40 bg-band-normal/10 px-3 py-2 text-sm font-medium" data-testid="eval-all-pass">
          Every stored check for this run passed.
        </p>
      )}
      {methods.map((m) => {
        const items = r.results.filter((x) => (x.method ?? "OTHER") === m)
        const meta = METHOD_TITLE[m]
        return (
          <Card key={m} data-testid={`method-${m}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {meta?.title ?? humanize(m)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {items.filter((x) => x.passed === true).length} of {items.length} passed
                </span>
              </CardTitle>
              {meta && <p className="text-sm text-muted-foreground">{meta.help}</p>}
            </CardHeader>
            <CardContent>
              <CheckList items={items} />
            </CardContent>
          </Card>
        )
      })}
      {r.results.length === 0 && <p className="text-sm text-muted-foreground">No individual check results are stored for this run.</p>}
      <JudgeNotes scores={r.judgeScores} />
      {r.notes && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-primary hover:underline">Evaluator notes</summary>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.notes}</p>
        </details>
      )}
    </div>
  )
}

function CheckList({ items }: { items: EvalResult[] }) {
  return (
    <ul className="divide-y">
      {items.map((x) => {
        const v = checkStatus(x.passed)
        return (
          <li key={`${x.method}-${x.criterion}`} className="py-2.5" data-testid={`check-${x.criterion}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Verdict v={v} />
              <span className="font-medium">{criterionLabel(x.criterion)}</span>
              {x.score != null && <span className="text-xs tabular-nums text-muted-foreground">score {x.score}</span>}
            </div>
            {x.detail && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{x.detail}</p>}
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-primary hover:underline">View technical details</summary>
              <dl className="mt-1 space-y-0.5">
                <div>
                  <dt className="inline text-muted-foreground">Criterion: </dt>
                  <dd className="inline font-mono">{x.criterion}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Method: </dt>
                  <dd className="inline">{x.method ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Stored result: </dt>
                  <dd className="inline">{x.passed == null ? "not recorded" : String(x.passed)}</dd>
                </div>
                {x.detail && <dd className="whitespace-pre-wrap break-words text-muted-foreground">{x.detail}</dd>}
              </dl>
            </details>
          </li>
        )
      })}
    </ul>
  )
}

function Meta({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
