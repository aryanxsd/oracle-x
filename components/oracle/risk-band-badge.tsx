import { BAND_STYLE, type RiskBand } from "@/lib/risk-style"
import { cn } from "@/lib/utils"

export function RiskBandBadge({ band, className }: { band: RiskBand; className?: string }) {
  const s = BAND_STYLE[band]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", s.chip, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  )
}
