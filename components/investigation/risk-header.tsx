import { Building2, ShieldAlert } from "lucide-react"
import { Card } from "@/components/ui/card"
import { RiskBandBadge } from "@/components/oracle/risk-band-badge"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { BAND_STYLE, asBand } from "@/lib/risk-style"
import { fmtDate, fmtScore } from "@/lib/format"
import type { Identity, RiskSummary } from "@/lib/server/investigation"
import { cn } from "@/lib/utils"

/** Who the entity is and its current risk state (v1 and v2), in plain words. */
export function RiskHeader({ identity, risk }: { identity: Identity; risk: RiskSummary | null }) {
  const band = asBand(risk?.band)
  const bandDedup = asBand(risk?.bandDedup)
  const top = risk ? [...risk.dimensions].sort((a, b) => b.contribution - a.contribution).slice(0, 3) : []
  const category = typeof identity.attributes.category === "string" ? identity.attributes.category : null

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
        <div className="p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-4 w-4" aria-hidden />
            {identity.type.toLowerCase().replace(/_/g, " ")} · {identity.entityId}
            {identity.isInvestigationSubject && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 normal-case tracking-normal text-primary">Under investigation</span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{identity.name}</h1>
          {category && <p className="text-sm text-muted-foreground">{category}</p>}

          {risk ? (
            <div className="mt-5 space-y-3 text-sm leading-relaxed">
              <p>
                <span className="font-medium">What is happening:</span> the ORACLE X risk model rates this entity{" "}
                <strong>{band ? BAND_STYLE[band].label : risk.band}</strong> ({fmtScore(risk.overall)} out of 100) as of{" "}
                {fmtDate(risk.scoreDate)}. The biggest contributors are{" "}
                {top.map((d, i) => (
                  <span key={d.key}>
                    <strong>{d.label.toLowerCase()}</strong> ({fmtScore(d.contribution, 1)} pts){i < top.length - 2 ? ", " : i === top.length - 2 ? " and " : ""}
                  </span>
                ))}
                .
              </p>
              <p>
                <span className="font-medium">Why it matters:</span>{" "}
                {risk.bandAction ? <>Recommended action for this band: {risk.bandAction}.</> : "Review the drivers below."} A risk band is a
                model output, not a fraud verdict.
              </p>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">This entity has no risk score in the ORACLE X model.</p>
          )}
        </div>

        {risk && (
          <div className="grid grid-cols-2 border-t bg-secondary/40 lg:border-l lg:border-t-0">
            <ScoreBlock title="Risk score" subtitle="Standard model (v1)" score={risk.overall} band={band} />
            <ScoreBlock
              title="Adjusted score"
              subtitle="Double counting removed (v2)"
              score={risk.overallDedup}
              band={bandDedup}
              note={risk.dedupAdjustment != null ? `−${fmtScore(risk.dedupAdjustment)} pts` : undefined}
            />
          </div>
        )}
      </div>
    </Card>
  )
}

function ScoreBlock({ title, subtitle, score, band, note }: { title: string; subtitle: string; score: number | null; band: ReturnType<typeof asBand>; note?: string }) {
  return (
    <div className="flex flex-col justify-center gap-2 border-r p-6 last:border-r-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {title} <ProvenanceChip kind="MODEL OUTPUT" />
      </div>
      <div className={cn("text-4xl font-semibold tabular-nums", band === "CRITICAL" && "text-band-critical", band === "ELEVATED" && "text-band-elevated")}>
        {fmtScore(score)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {band && <RiskBandBadge band={band} />}
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
  )
}

export function NoRiskNotice() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <ShieldAlert className="h-4 w-4" aria-hidden /> No risk score is available for this entity.
    </p>
  )
}
