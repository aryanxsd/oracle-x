"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery } from "@tanstack/react-query"
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Circle, Loader2, Play, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/oracle/markdown"
import { COUNCIL_STAGES } from "@/lib/risk-style"
import type { Brief } from "@/lib/brief"
import { cn } from "@/lib/utils"

type StageState = "idle" | "running" | "done" | "failed"
interface StageDetail {
  durationSeconds: number | null
  tools: string[]
  brief: Brief | null
}
interface CouncilStatus {
  runId: string
  status: "RUNNING" | "COMPLETED" | "FAILED" | "STALLED"
  phase: string | null
  startedAt: string | null
  elapsedSeconds: number | null
  stages: Record<string, StageState>
  stageDetails: Partial<Record<string, StageDetail>>
  finalResponse: string | null
  error: string | null
}

const POLL_MS = 5000
const STATE_LABEL: Record<StageState, string> = { idle: "Waiting", running: "Working", done: "Completed", failed: "Error" }

function plainPhase(phase: string | null, status: CouncilStatus["status"]): string {
  if (status === "COMPLETED") return "Finished — ORACLE has written the finding"
  if (status === "FAILED") return "The council could not finish"
  if (status === "STALLED") return "No progress reported for a long time"
  const p = (phase ?? "").toUpperCase()
  if (p.startsWith("PHASE_1")) return "Gathering facts, checking the score and comparing actions"
  if (p.startsWith("PHASE_2")) return "Mapping the findings to policy"
  if (p.startsWith("PHASE_3")) return "The Skeptic is challenging the findings"
  if (p.startsWith("PHASE_4")) return "ORACLE is writing the final finding"
  return "Starting…"
}

const mmss = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`)

/**
 * Runs and follows the existing Snowflake council (AGENTS.SP_RUN_COUNCIL) via /api/council and
 * /api/council/{runId}. No request stays open for the run; a repeated start re-uses the run in progress.
 */
export function CouncilRunner({ entityId, initialRunId, readOnly = false }: { entityId: string; initialRunId?: string | null; readOnly?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const [runId, setRunId] = useState<string | null>(search.get("run") ?? initialRunId ?? null)

  useEffect(() => {
    const r = search.get("run")
    if (r) setRunId(r)
  }, [search])

  const start = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? "Could not start the council")
      return j as { runId: string; reused: boolean }
    },
    onSuccess: ({ runId }) => {
      setRunId(runId)
      router.replace(`${pathname}?run=${encodeURIComponent(runId)}`, { scroll: false })
    },
  })

  const status = useQuery({
    queryKey: ["council", runId],
    enabled: !!runId,
    queryFn: async (): Promise<CouncilStatus> => {
      const r = await fetch(`/api/council/${encodeURIComponent(runId!)}`, { cache: "no-store" })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? "Could not read council progress")
      return j
    },
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "RUNNING" ? false : POLL_MS),
  })

  const s = status.data
  const running = start.isPending || s?.status === "RUNNING"

  return (
    <div className="space-y-5">
      {readOnly ? (
        <p className="text-sm text-muted-foreground" data-testid="council-read-only">
          Read-only deployment: showing the latest stored council run. New councils cannot be started here.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={() => start.mutate()} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {running ? "Council in progress" : s ? "Run a new council" : `Investigate ${entityId} with the council`}
          </Button>
          <p className="text-sm text-muted-foreground">
            About 5–7 minutes. You can leave this page — progress is kept in Snowflake.
          </p>
        </div>
      )}

      {start.isError && <ErrorLine text={(start.error as Error).message} />}
      {status.isError && <ErrorLine text={(status.error as Error).message} />}

      {runId && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-live="polite">
          {s?.status === "COMPLETED" ? (
            <CheckCircle2 className="h-4 w-4 text-band-normal" aria-hidden />
          ) : s?.status === "FAILED" || s?.status === "STALLED" ? (
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
          )}
          <span className="font-medium">{s ? plainPhase(s.phase, s.status) : "Loading the latest council run…"}</span>
          {s?.elapsedSeconds != null && <span className="text-muted-foreground">{s.status === "RUNNING" ? "Elapsed" : "Took"} {mmss(s.elapsedSeconds)}</span>}
          {s?.startedAt && <span className="text-xs text-muted-foreground">Started {new Date(s.startedAt).toLocaleString()}</span>}
        </div>
      )}

      {!runId && !start.isPending && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No council has been run for {entityId} yet.{readOnly ? "" : " Start one to see each specialist’s findings and the Skeptic’s challenges."}
        </p>
      )}

      {runId && (
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Council stages">
          {COUNCIL_STAGES.map((stage, i) => (
            <StageCard
              key={stage.key}
              index={i + 1}
              label={stage.label}
              role={stage.role}
              state={s?.stages[stage.key] ?? "idle"}
              detail={s?.stageDetails?.[stage.key]}
              highlight={stage.key === "SKEPTIC"}
              isOracle={stage.key === "ORACLE"}
            />
          ))}
        </ol>
      )}

      {s?.error && <ErrorLine text={s.error} />}

      {s?.finalResponse && (
        <section aria-label="Council finding" className="rounded-xl border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold">ORACLE council finding</h3>
              <p className="text-xs text-muted-foreground">Written by ORACLE from the five specialists’ outputs. It never states a fraud verdict while evidence is incomplete.</p>
            </div>
            <a href={`/cases?run=${encodeURIComponent(s.runId)}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Open as case file <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </header>
          <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
            <Markdown>{s.finalResponse}</Markdown>
          </div>
        </section>
      )}
    </div>
  )
}

function StageCard({
  index,
  label,
  role,
  state,
  detail,
  highlight,
  isOracle,
}: {
  index: number
  label: string
  role: string
  state: StageState
  detail?: StageDetail
  highlight?: boolean
  isOracle?: boolean
}) {
  const brief = detail?.brief
  const summary = (highlight ? brief?.contradictions?.length ? brief.contradictions : brief?.conclusions : brief?.conclusions) ?? []
  return (
    <li
      className={cn(
        "flex flex-col rounded-xl border bg-card p-4",
        state === "running" && "ring-2 ring-primary/30",
        state === "failed" && "border-destructive/50",
        highlight && "border-amber-500/40 bg-amber-500/[0.03]",
        isOracle && "border-primary/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Step {index}</div>
          <div className="font-semibold">{label}</div>
          <div className="text-xs text-muted-foreground">{role}</div>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {state === "done" && <CheckCircle2 className="h-4 w-4 text-band-normal" aria-hidden />}
          {state === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />}
          {state === "failed" && <XCircle className="h-4 w-4 text-destructive" aria-hidden />}
          {state === "idle" && <Circle className="h-4 w-4 text-muted-foreground/50" aria-hidden />}
          {STATE_LABEL[state]}
          {detail?.durationSeconds != null && state === "done" && <span className="font-normal text-muted-foreground">· {mmss(detail.durationSeconds)}</span>}
        </span>
      </div>

      {summary.length > 0 && (
        <div className="mt-3">
          {highlight && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Challenges raised</div>}
          <ul className="space-y-1.5 text-sm">
            {summary.slice(0, 3).map((c) => (
              <li key={c} className="line-clamp-3">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {isOracle && state === "done" && <p className="mt-3 text-sm text-muted-foreground">The full finding is shown below.</p>}

      {detail && (detail.tools.length > 0 || brief) && (
        <details className="group mt-3 border-t pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
            View technical details
          </summary>
          <div className="mt-2 space-y-3 text-xs">
            {detail.tools.length > 0 && (
              <div>
                <div className="font-medium text-muted-foreground">Tools used</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {detail.tools.map((t) => (
                    <code key={t} className="rounded bg-muted px-1.5 py-0.5">
                      {t}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {brief &&
              (["conclusions", "supporting", "contradictions", "missing", "sources"] as const).map((k) =>
                brief[k].length ? (
                  <div key={k}>
                    <div className="font-medium capitalize text-muted-foreground">{k === "supporting" ? "Supporting evidence" : k === "missing" ? "Missing evidence" : k}</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {brief[k].map((x) => (
                        <li key={x} className="break-words">
                          {x}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
          </div>
        </details>
      )}
    </li>
  )
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4" aria-hidden /> {text}
    </p>
  )
}
