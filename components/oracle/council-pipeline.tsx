import { ArrowRight } from "lucide-react"
import { COUNCIL_STAGES } from "@/lib/risk-style"
import { cn } from "@/lib/utils"

export type StageState = "idle" | "running" | "done" | "failed"

/**
 * Visual of the ORACLE X council order:
 * Investigator → Risk Analyst → Compliance → Skeptic → Scenario → ORACLE synthesis.
 * Stage states are supplied by the caller from CASES.COUNCIL_RUNS / COUNCIL_TRANSCRIPTS.
 */
export function CouncilPipeline({ states = {} }: { states?: Partial<Record<string, StageState>> }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-2" aria-label="Council steps">
      {COUNCIL_STAGES.map((s, i) => {
        const st = states[s.key] ?? "idle"
        return (
          <li key={s.key} className="flex items-center gap-2">
            <div
              className={cn(
                "min-w-32 rounded-xl border bg-card px-3 py-2",
                s.key === "SKEPTIC" && "border-amber-500/40",
                s.key === "ORACLE" && "border-primary/40",
                st === "running" && "ring-2 ring-primary/40",
                st === "failed" && "border-destructive/50",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    st === "idle" && "bg-muted-foreground/40",
                    st === "running" && "animate-pulse bg-primary",
                    st === "done" && "bg-band-normal",
                    st === "failed" && "bg-destructive",
                  )}
                  aria-hidden
                />
                {s.label}
              </div>
              <div className="text-xs text-muted-foreground">{s.role}</div>
            </div>
            {i < COUNCIL_STAGES.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}
