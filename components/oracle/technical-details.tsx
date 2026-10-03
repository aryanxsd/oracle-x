import { ChevronRight } from "lucide-react"
import type { DataSource } from "@/lib/data-sources"

/**
 * Progressive disclosure for technical detail. Collapsed by default so
 * first-time users see the plain-language view; analysts can open it.
 */
export function TechnicalDetails({
  title = "Technical details",
  sources,
  children,
}: {
  title?: string
  sources?: DataSource[]
  children?: React.ReactNode
}) {
  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
        {title}
      </summary>
      <div className="space-y-3 border-t px-4 py-3 text-sm">
        {children}
        {sources && (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.object} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{s.object}</code>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.kind.replace("_", " ").toLowerCase()} · {s.via === "AGENT_REST" ? "Cortex Agent API" : "SQL"}</span>
                <span className="w-full text-muted-foreground">{s.use}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
