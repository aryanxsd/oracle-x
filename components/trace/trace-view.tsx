import { Suspense, use } from "react"
import { ArrowDown, CheckCircle2, CircleDashed, ShieldAlert, XCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { Markdown } from "@/components/oracle/markdown"
import { parseReport } from "@/lib/case-types"
import { COUNCIL_STAGES } from "@/lib/risk-style"
import { fmtDate, humanize } from "@/lib/format"
import type { StageStatus, ToolCall, Trace, TraceStage } from "@/lib/trace-types"
import { cn } from "@/lib/utils"

type Calls = Promise<ToolCall[] | null>

const LABEL = Object.fromEntries(COUNCIL_STAGES.map((s) => [s.key, s])) as Record<string, (typeof COUNCIL_STAGES)[number]>
const SPECIALIST_ORDER = ["INVESTIGATOR", "RISK_ANALYST", "COMPLIANCE", "SKEPTIC", "SCENARIO"]

const STATUS_STYLE: Record<StageStatus | "GUARDRAIL", { label: string; cls: string; icon: React.ReactNode }> = {
  COMPLETED: { label: "Completed", cls: "bg-band-normal/12 text-band-normal", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
  WORKING: { label: "Working", cls: "bg-primary/10 text-primary", icon: <CircleDashed className="h-3.5 w-3.5 animate-spin" aria-hidden /> },
  FAILED: { label: "Failed", cls: "bg-destructive/10 text-destructive", icon: <XCircle className="h-3.5 w-3.5" aria-hidden /> },
  NOT_RUN: { label: "Not run", cls: "bg-muted text-muted-foreground", icon: <CircleDashed className="h-3.5 w-3.5" aria-hidden /> },
  GUARDRAIL: { label: "Guardrail block (intentional)", cls: "bg-amber-500/12 text-amber-800 dark:text-amber-300", icon: <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> },
}

export function StatusPill({ status, testId }: { status: StageStatus | "GUARDRAIL"; testId?: string }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", s.cls)} data-testid={testId}>
      {s.icon} {s.label}
    </span>
  )
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs" aria-label="Status legend">
      {(["COMPLETED", "WORKING", "FAILED", "GUARDRAIL"] as const).map((s) => (
        <StatusPill key={s} status={s} />
      ))}
      <span className="text-muted-foreground">A guardrail block is a safety limit doing its job, not a failure.</span>
    </div>
  )
}

const fmtSec = (s: number | null) => (s == null ? "—" : s >= 90 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${s}s`)

/** The council as a vertical flow: question → ORACLE → plan → tools → five specialists → synthesis → finding. */
export function TraceFlow({ t, calls }: { t: Trace; calls: Calls }) {
  const byRole = new Map(t.stages.map((s) => [s.role, s]))
  const specialists = SPECIALIST_ORDER.map((r) => byRole.get(r)).filter((s): s is TraceStage => !!s)
  const extra = t.stages.filter((s) => !SPECIALIST_ORDER.includes(s.role))
  const allTools = [...new Set(t.stages.flatMap((s) => s.tools))]
  const report = parseReport(t.finalResponse)
  const finding = report.sections.find((s) => s.number === 8)
  const synthesisStatus: StageStatus = t.status === "COMPLETED" ? "COMPLETED" : t.status === "FAILED" ? "FAILED" : t.status === "RUNNING" ? "WORKING" : "NOT_RUN"

  return (
    <ol className="space-y-1" aria-label="How ORACLE reached the answer" data-testid="trace-flow">
      <Step n="Question" title="What was asked" testId="flow-question">
        <p className="text-sm">{t.question ?? "Not recorded"}</p>
      </Step>
      <Step n="ORACLE" title="ORACLE orchestrator" testId="flow-orchestrator" status={t.status === "COMPLETED" ? "COMPLETED" : synthesisStatus}>
        <p className="text-sm text-muted-foreground">
          {t.mode === "PHASED_ASYNC" ? "Convened the full investigation council" : `Ran in ${humanize(t.mode).toLowerCase()} mode`} · {t.specialistsOk ?? 0} specialists answered
          {t.specialistsFailed ? `, ${t.specialistsFailed} failed` : ""}.
        </p>
      </Step>
      <Step n="Plan" title="Investigation plan" testId="flow-plan">
        {t.mode === "PHASED_ASYNC" ? (
          <ul className="space-y-0.5 text-sm">
            <li>1. Investigator, Risk Analyst and Scenario work in parallel{t.phase1DoneAt && <span className="text-muted-foreground"> — done {time(t.phase1DoneAt)}</span>}</li>
            <li>2. Compliance checks the Investigator’s claims against policy{t.complianceDoneAt && <span className="text-muted-foreground"> — done {time(t.complianceDoneAt)}</span>}</li>
            <li>3. Skeptic challenges every finding{t.skepticDoneAt && <span className="text-muted-foreground"> — done {time(t.skepticDoneAt)}</span>}</li>
            <li>4. ORACLE writes one evidence-grounded answer{t.finishedAt && <span className="text-muted-foreground"> — done {time(t.finishedAt)}</span>}</li>
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">ORACLE chose which specialists to consult for this focused question.</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Plan as recorded by the council procedure; times from the run record.</p>
      </Step>
      <Step n="Data" title="Tools and data sources" testId="flow-tools">
        {allTools.length ? (
          <div className="flex flex-wrap gap-1.5">
            {allTools.map((x) => (
              <span key={x} className="rounded-full border px-2 py-0.5 text-xs">
                {humanize(x)}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No tool use was recorded.</p>
        )}
        <Suspense fallback={<p className="mt-1 text-xs text-muted-foreground">Loading tool-call outcomes…</p>}>
          <CallSummary calls={calls} />
        </Suspense>
      </Step>
      {[...specialists, ...extra].map((s) => (
        <Step key={s.role} n={LABEL[s.role]?.label ?? humanize(s.role)} title={LABEL[s.role]?.role ?? "Specialist"} status={s.status} testId={`flow-${s.role}`} highlight={s.role === "SKEPTIC"}>
          <StageBody s={s} calls={calls} />
        </Step>
      ))}
      <Step n="Synthesis" title="ORACLE synthesis" status={synthesisStatus} testId="flow-synthesis">
        <p className="text-sm text-muted-foreground">
          ORACLE combined the five briefs into one report with nine sections{t.totalSeconds != null && <> · whole council {fmtSec(t.totalSeconds)}</>}.
        </p>
      </Step>
      <Step n="Finding" title="Final evidence-grounded finding" last testId="flow-finding">
        {finding ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <Markdown>{finding.body}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No final finding is recorded for this run.</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Model-assisted analysis for review — not a finding of fraud or money laundering.</p>
      </Step>
    </ol>
  )
}

function Step({ n, title, status, children, last, testId, highlight }: { n: string; title: string; status?: StageStatus; children: React.ReactNode; last?: boolean; testId?: string; highlight?: boolean }) {
  return (
    <li data-testid={testId}>
      <Card className={cn(highlight && "border-amber-500/50")}>
        <CardContent className="p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-semibold">{n}</span>
            <span className="text-sm text-muted-foreground">{title}</span>
            {status && (
              <span className="ml-auto">
                <StatusPill status={status} />
              </span>
            )}
          </div>
          {children}
        </CardContent>
      </Card>
      {!last && <ArrowDown className="mx-auto my-1 h-4 w-4 text-muted-foreground/60" aria-hidden />}
    </li>
  )
}

function StageBody({ s, calls }: { s: TraceStage; calls: Calls }) {
  const b = s.brief
  const isSkeptic = s.role === "SKEPTIC"
  return (
    <div className="space-y-2 text-sm">
      <div className="text-xs text-muted-foreground">
        {fmtSec(s.durationSeconds)}
        {s.offsetSeconds != null && <> · started {fmtSec(s.offsetSeconds)} into the council</>}
        {s.tools.length > 0 && <> · {s.tools.length} tools</>}
      </div>
      {b ? (
        <>
          {b.conclusions.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4">
              {b.conclusions.slice(0, 3).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {isSkeptic && b.contradictions.length > 0 && (
            <div className="rounded-lg border-l-4 border-amber-500 bg-amber-500/10 p-2" data-testid="skeptic-challenges">
              <div className="text-xs font-medium uppercase tracking-wide text-amber-900 dark:text-amber-200">Challenges raised</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {b.contradictions.slice(0, 5).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {b.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <ProvenanceChip kind="FACT" />
              {b.sources.slice(0, 4).map((x, i) => (
                <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  {x.length > 80 ? `${x.slice(0, 77)}…` : x}
                </span>
              ))}
              {b.sources.length > 4 && <span className="text-muted-foreground">+{b.sources.length - 4} more</span>}
            </div>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">No structured brief was recorded for this specialist.</p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-primary hover:underline">View technical details</summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <Item k="Backend status">{s.backendStatus ?? "—"}</Item>
          <Item k="Started">{fmtDate(s.startedAt)} {time(s.startedAt)}</Item>
          <Item k="Duration">{fmtSec(s.durationSeconds)}</Item>
          <Item k="Tokens (in / out)">
            {s.inputTokens ?? "—"} / {s.outputTokens ?? "—"}
          </Item>
          <Item k="Tools">{s.tools.length ? s.tools.join(", ") : "—"}</Item>
        </dl>
        {b && (b.supporting.length > 0 || b.missing.length > 0) && (
          <div className="mt-2 space-y-1">
            {b.supporting.length > 0 && <p><span className="text-muted-foreground">Supporting evidence:</span> {b.supporting.join(" · ")}</p>}
            {b.missing.length > 0 && <p><span className="text-muted-foreground">Missing evidence:</span> {b.missing.join(" · ")}</p>}
            {b.sources.length > 0 && <p><span className="text-muted-foreground">Evidence references:</span> {b.sources.join(" · ")}</p>}
          </div>
        )}
        <Suspense fallback={<p className="mt-2 text-muted-foreground">Loading tool calls…</p>}>
          <StageCalls calls={calls} role={s.role} />
        </Suspense>
      </details>
    </div>
  )
}

function Item({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="inline text-muted-foreground">{k}: </dt>
      <dd className="inline">{children}</dd>
    </div>
  )
}

function CallSummary({ calls }: { calls: Calls }) {
  const c = use(calls)
  if (c == null) return <p className="mt-1 text-xs text-muted-foreground">Tool-call outcomes are unavailable right now.</p>
  const n = (o: string) => c.filter((x) => x.outcome === o).length
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-testid="call-summary">
      <span>{c.length} tool calls:</span>
      <span className="rounded-full bg-band-normal/12 px-2 py-0.5 text-band-normal">{n("SUCCESS")} succeeded</span>
      <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-amber-800 dark:text-amber-300">{n("GUARDRAIL_REJECTION")} guardrail blocks (intentional)</span>
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{n("TOOL_FAILURE")} failures</span>
    </p>
  )
}

function StageCalls({ calls, role }: { calls: Calls; role: string }) {
  const all = use(calls)
  if (all == null) return <p className="mt-2 text-muted-foreground">Tool calls are unavailable right now.</p>
  const mine = all.filter((c) => c.role === role)
  if (!mine.length) return <p className="mt-2 text-muted-foreground">No tool calls recorded for this stage.</p>
  return (
    <ul className="mt-2 space-y-1" data-testid={`calls-${role}`}>
      {mine.map((c) => (
        <li key={`${c.role}-${c.seq}`} className="flex flex-wrap items-center gap-2">
          <StatusPill status={c.outcome === "SUCCESS" ? "COMPLETED" : c.outcome === "GUARDRAIL_REJECTION" ? "GUARDRAIL" : "FAILED"} />
          <span className="font-mono">{c.name}</span>
          {c.graphHopsRequested != null && (
            <span className="text-muted-foreground">
              graph: {c.graphHopsRequested} hops / {c.graphPathsRequested ?? "—"} paths requested, {c.graphPathsReturned ?? "—"} returned
            </span>
          )}
          {c.errorCode && <span className="text-muted-foreground">({humanize(c.errorCode)})</span>}
        </li>
      ))}
    </ul>
  )
}

function time(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC"
}

/** Horizontal timeline from real start offsets and durations (run record + transcripts). */
export function TraceTimeline({ t }: { t: Trace }) {
  const total = t.totalSeconds ?? Math.max(1, ...t.stages.map((s) => (s.offsetSeconds ?? 0) + (s.durationSeconds ?? 0)))
  const start = t.startedAt ? new Date(t.startedAt).getTime() : null
  const at = (iso: string | null) => (start != null && iso ? Math.round((new Date(iso).getTime() - start) / 1000) : null)
  const order = (r: string) => (SPECIALIST_ORDER.indexOf(r) === -1 ? 99 : SPECIALIST_ORDER.indexOf(r))
  const rows = [...t.stages].sort((a, b) => order(a.role) - order(b.role))
  const synthStart = at(t.skepticDoneAt)
  const synthEnd = at(t.finishedAt)
  const milestones = [
    { label: "Question", s: 0 },
    { label: "Data gathering & analysis done", s: at(t.phase1DoneAt) },
    { label: "Compliance review done", s: at(t.complianceDoneAt) },
    { label: "Skeptic challenge done", s: at(t.skepticDoneAt) },
    { label: "Synthesis done", s: synthEnd },
  ].filter((m) => m.s != null) as { label: string; s: number }[]
  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / total) * 100))}%`

  return (
    <div className="space-y-2" data-testid="trace-timeline">
      <div className="relative ml-28 h-6 border-b text-[10px] text-muted-foreground">
        {milestones.map((m) => (
          <span key={m.label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(m.s) }} title={`${m.label} at ${fmtSec(m.s)}`}>
            │
          </span>
        ))}
      </div>
      {rows.map((s) => (
        <div key={s.role} className="flex items-center gap-2 text-xs" data-testid={`bar-${s.role}`}>
          <span className="w-26 shrink-0 truncate">{LABEL[s.role]?.label ?? humanize(s.role)}</span>
          <div className="relative h-4 flex-1 rounded bg-muted">
            {s.offsetSeconds != null && s.durationSeconds != null && (
              <div
                className={cn("absolute h-full rounded", s.status === "FAILED" ? "bg-destructive/70" : s.role === "SKEPTIC" ? "bg-amber-500/70" : "bg-primary/60")}
                style={{ left: pct(s.offsetSeconds), width: pct(s.durationSeconds) }}
                title={`${fmtSec(s.offsetSeconds)} → ${fmtSec(s.offsetSeconds + s.durationSeconds)}`}
              />
            )}
          </div>
          <span className="w-16 text-right tabular-nums text-muted-foreground">{fmtSec(s.durationSeconds)}</span>
        </div>
      ))}
      {synthStart != null && synthEnd != null && (
        <div className="flex items-center gap-2 text-xs" data-testid="bar-SYNTHESIS">
          <span className="w-26 shrink-0">ORACLE synthesis</span>
          <div className="relative h-4 flex-1 rounded bg-muted">
            <div className="absolute h-full rounded bg-band-normal/60" style={{ left: pct(synthStart), width: pct(Math.max(1, synthEnd - synthStart)) }} />
          </div>
          <span className="w-16 text-right tabular-nums text-muted-foreground">{fmtSec(synthEnd - synthStart)}</span>
        </div>
      )}
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {milestones.map((m) => (
          <li key={m.label}>
            {m.label}: <span className="tabular-nums text-foreground">{fmtSec(m.s)}</span>
          </li>
        ))}
        {t.totalSeconds != null && <li>Total: <span className="tabular-nums text-foreground">{fmtSec(t.totalSeconds)}</span></li>}
      </ol>
    </div>
  )
}
