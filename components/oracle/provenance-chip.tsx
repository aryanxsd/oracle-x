import { PROVENANCE_STYLE, type Provenance } from "@/lib/risk-style"
import { cn } from "@/lib/utils"

/** Shows where a statement comes from, in plain words, with the exact label on hover. */
export function ProvenanceChip({ kind, className }: { kind: Provenance; className?: string }) {
  const s = PROVENANCE_STYLE[kind]
  return (
    <span
      title={`${kind}: ${s.help}`}
      className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", s.chip, className)}
    >
      {s.short}
    </span>
  )
}
