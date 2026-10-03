import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { WhyPanel } from "@/components/investigation/why-panel"
import { fmtScore } from "@/lib/format"
import { BAND_STYLE, bandForScore, type BandRange } from "@/lib/risk-style"
import type { EvidenceClaim, RiskSummary } from "@/lib/server/investigation"
import { cn } from "@/lib/utils"

/** True only where the backend has a separate v2 column for the dimension AND its rule fired. */
export function isAdjusted(d: RiskSummary["dimensions"][number]) {
  return d.scoreDedup != null && d.dedupApplied && Math.abs(d.scoreDedup - d.score) > 0.005
}

/**
 * The eight risk dimensions: score, weight and points (contribution), all from
 * INTEL.V_ENTITY_RISK_INTELLIGENCE / V_RISK_MODEL_CONFIG. Bars are tinted with the backend band
 * ranges. Only the three dimensions with a *_SCORE_DEDUP column can show an adjusted value.
 */
export function DimensionBreakdown({ risk, claims, bands, entityId }: { risk: RiskSummary; claims?: EvidenceClaim[]; bands: BandRange[]; entityId?: string }) {
  const engineClaim = (key: string) => claims?.find((c) => c.origin === "ENGINE_DIMENSION" && c.signalType === key)
  const maxContribution = Math.max(...risk.dimensions.map((d) => d.contribution), 1)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Eight risk dimensions <ProvenanceChip kind="MODEL OUTPUT" />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Each dimension is scored 0–100 and multiplied by its weight. The points are what each one adds to the overall score of{" "}
          <strong className="text-foreground">{fmtScore(risk.overall)}</strong>. Where the adjusted model removes double counting, the adjusted score
          is shown next to it.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-2 hidden grid-cols-[minmax(10rem,1.2fr)_5rem_4.5rem_minmax(8rem,1fr)] gap-4 text-xs uppercase tracking-wide text-muted-foreground md:grid">
          <span>Dimension</span>
          <span className="text-right">Score</span>
          <span className="text-right">Weight</span>
          <span>Points added</span>
        </div>
        <ul className="divide-y">
          {risk.dimensions.map((d) => {
            const adjusted = isAdjusted(d)
            const tint = bandForScore(d.score, bands)
            return (
              <li key={d.key} className="py-3 first:pt-0 last:pb-0" data-testid={`dim-${d.key}`}>
                <div className="grid items-center gap-x-4 gap-y-1 md:grid-cols-[minmax(10rem,1.2fr)_5rem_4.5rem_minmax(8rem,1fr)]">
                  <div>
                    <div className="font-medium">{d.label}</div>
                    <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className={cn("h-full rounded-full", tint ? BAND_STYLE[tint].dot : "bg-muted-foreground")} style={{ width: `${Math.min(d.score, 100)}%` }} />
                      {adjusted && <div className="absolute top-0 h-full w-0.5 bg-indigo-600" style={{ left: `${Math.min(d.scoreDedup!, 100)}%` }} />}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums md:text-right">
                    <strong>{fmtScore(d.score, 1)}</strong>
                    {adjusted && (
                      <div className="text-xs text-indigo-700 dark:text-indigo-300" title={`Adjusted by rule ${d.dedupRule}`}>
                        → {fmtScore(d.scoreDedup, 2)} ({d.dedupRule})
                      </div>
                    )}
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground md:text-right">{d.weight != null ? `${Math.round(d.weight * 100)}%` : "—"}</div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 flex-1 rounded bg-muted" aria-hidden>
                      <div className="h-full rounded bg-primary/70" style={{ width: `${(d.contribution / maxContribution) * 100}%` }} />
                    </div>
                    <span className="w-14 text-right text-sm tabular-nums">+{fmtScore(d.contribution, 2)}</span>
                  </div>
                </div>
                {claims && (
                  <div className="mt-1.5">
                    <WhyPanel claim={engineClaim(d.key)} entityId={entityId} label={`Why is ${d.label.toLowerCase()} ${fmtScore(d.score, 0)}?`} />
                  </div>
                )}
                {!claims && d.formula && (
                  <details className="mt-1.5 text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">How this is calculated</summary>
                    <p className="mt-1 whitespace-pre-wrap">{d.formula}</p>
                    {d.policyReference && (
                      <p className="mt-1 flex items-center gap-1.5">
                        <ProvenanceChip kind="POLICY" /> {d.policyReference}
                      </p>
                    )}
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
