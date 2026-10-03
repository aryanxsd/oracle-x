import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { RiskBandBadge } from "@/components/oracle/risk-band-badge"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { isAdjusted } from "@/components/investigation/dimension-breakdown"
import { BAND_STYLE, asBand, type BandRange } from "@/lib/risk-style"
import { fmtDate, fmtScore } from "@/lib/format"
import type { RiskSummary } from "@/lib/server/investigation"
import { cn } from "@/lib/utils"

const bandLabel = (b: string | null | undefined) => {
  const k = asBand(b)
  return k ? BAND_STYLE[k].label : (b ?? "—")
}

/** Current score in both models, the difference and the backend's recommended action. */
export function RiskOverview({ risk, bands }: { risk: RiskSummary; bands: BandRange[] }) {
  const diff = risk.overallDedup != null ? risk.overallDedup - risk.overall : null
  const current = bands.find((b) => b.band === risk.band)
  return (
    <Card className="overflow-hidden" data-testid="risk-overview">
      <div className="grid sm:grid-cols-3">
        <Score title="Standard score" subtitle="Model v1" score={risk.overall} band={risk.band} />
        <Score title="Adjusted score" subtitle="Model v2 · double counting removed" score={risk.overallDedup} band={risk.bandDedup} />
        <div className="flex flex-col justify-center gap-1 border-t p-6 sm:border-l sm:border-t-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Difference <ProvenanceChip kind="MODEL OUTPUT" />
          </div>
          <div className="text-3xl font-semibold tabular-nums">{diff == null ? "—" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmtScore(Math.abs(diff))}`}</div>
          <div className="text-xs text-muted-foreground">
            {risk.dedupAdjustment != null ? `Backend adjustment: ${fmtScore(risk.dedupAdjustment)} points removed` : "No adjusted score for this entity"}
            {risk.bandDedup && risk.bandDedup !== risk.band && <> · band moves to {bandLabel(risk.bandDedup).toLowerCase()}</>}
            {risk.bandDedup && risk.bandDedup === risk.band && <> · band unchanged</>}
          </div>
        </div>
      </div>
      <div className="border-t bg-secondary/40 px-6 py-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Recommended action</span> <ProvenanceChip kind="POLICY" />
        </div>
        <p className="mt-1">{current?.action ?? risk.bandAction ?? "No action is configured for this band."}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Scored {fmtDate(risk.scoreDate)}. A risk band is a model output that sets review priority — it is not a finding of fraud or money laundering.
        </p>
      </div>
    </Card>
  )
}

function Score({ title, subtitle, score, band }: { title: string; subtitle: string; score: number | null; band: string | null }) {
  const b = asBand(band)
  return (
    <div className="flex flex-col justify-center gap-2 border-t p-6 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {title} <ProvenanceChip kind="MODEL OUTPUT" />
      </div>
      <div className={cn("text-4xl font-semibold tabular-nums", b === "CRITICAL" && "text-band-critical", b === "ELEVATED" && "text-band-elevated")}>{fmtScore(score)}</div>
      <div className="flex items-center gap-2">
        {b ? <RiskBandBadge band={b} /> : <span className="text-xs text-muted-foreground">No band</span>}
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
    </div>
  )
}

/** "Why is M044 Elevated?" — band placement from config plus the top contributing dimensions. */
export function WhyBand({ entityId, risk, bands }: { entityId: string; risk: RiskSummary; bands: BandRange[] }) {
  const top = [...risk.dimensions].sort((a, b) => b.contribution - a.contribution).slice(0, 3)
  const topShare = top.reduce((s, d) => s + d.contribution, 0)
  const current = bands.find((b) => b.band === risk.band)
  return (
    <Card data-testid="why-band">
      <CardHeader>
        <CardTitle className="text-base">
          Why is {entityId} {bandLabel(risk.band)}?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <ProvenanceChip kind="POLICY" />
          <span>
            The {bandLabel(risk.band)} band covers scores from <strong>{current?.lower ?? "—"}</strong> up to <strong>{current?.upper ?? "—"}</strong>. The standard
            score is <strong>{fmtScore(risk.overall)}</strong>
            {risk.overallDedup != null && (
              <>
                {" "}
                and the adjusted score is <strong>{fmtScore(risk.overallDedup)}</strong> ({bandLabel(risk.bandDedup).toLowerCase()})
              </>
            )}
            .
          </span>
        </p>
        <div>
          <p className="flex items-center gap-2">
            <ProvenanceChip kind="MODEL OUTPUT" /> Three dimensions add {fmtScore(topShare)} of the {fmtScore(risk.overall)} points:
          </p>
          <ol className="mt-2 space-y-2">
            {top.map((d, i) => (
              <li key={d.key} className="flex items-baseline gap-3">
                <span className="w-5 shrink-0 text-muted-foreground">{i + 1}.</span>
                <span>
                  <strong>{d.label}</strong> scores {fmtScore(d.score, 1)} at {d.weight != null ? `${Math.round(d.weight * 100)}%` : "an unknown"} weight, adding{" "}
                  <strong>{fmtScore(d.contribution, 2)} points</strong>
                  {isAdjusted(d) && <> (adjusted model: {fmtScore(d.scoreDedup, 2)})</>}.
                </span>
              </li>
            ))}
          </ol>
        </div>
        {risk.bindingComponent && (
          <p className="flex flex-wrap items-center gap-2">
            <ProvenanceChip kind="FACT" /> The transaction dimension is driven by the <strong>{risk.bindingComponent.toLowerCase().replace(/_/g, " ")}</strong> pattern in
            the bank’s records.
          </p>
        )}
        <TechnicalDetails title="Model explanation (from Snowflake)">
          <p className="whitespace-pre-wrap text-muted-foreground">{risk.explanation}</p>
        </TechnicalDetails>
        <p className="text-xs text-muted-foreground">
          The evidence behind each dimension (records, calculations, policy and narrative sources) is on the Evidence screen and the investigation workspace.
        </p>
      </CardContent>
    </Card>
  )
}

/** Band thresholds and actions straight from INTEL.V_RISK_BAND_CONFIG, with the current band marked. */
export function BandScale({ bands, band, bandDedup }: { bands: BandRange[]; band: string; bandDedup: string | null }) {
  return (
    <Card data-testid="band-scale">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Risk bands <ProvenanceChip kind="POLICY" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bands.length === 0 ? (
          <p className="text-sm text-muted-foreground">No band configuration was returned.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {bands.map((b) => {
              const k = asBand(b.band)
              const here = b.band === band
              return (
                <li key={b.band} className={cn("flex items-start gap-3 rounded-lg border p-3", here && "border-primary bg-primary/5")}>
                  <span className="w-24 shrink-0">{k ? <RiskBandBadge band={k} /> : b.band}</span>
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                    {b.lower}–{b.upper >= 100 ? "100" : b.upper}
                  </span>
                  <span className="flex-1">{b.action ?? "—"}</span>
                  {here && <span className="shrink-0 text-xs font-medium text-primary">{bandDedup === band ? "v1 & v2" : "v1"}</span>}
                  {!here && b.band === bandDedup && <span className="shrink-0 text-xs font-medium text-indigo-600">v2</span>}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Standard vs adjusted per dimension. Only dimensions with a backend *_SCORE_DEDUP column (R1/R2/R3)
 * can differ; the other five are shown as "same in both models" because v2 reuses their v1 value.
 */
export function ModelComparison({ risk }: { risk: RiskSummary }) {
  return (
    <Card data-testid="model-comparison">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          What changes in the adjusted model <ProvenanceChip kind="MODEL OUTPUT" />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The adjusted model (v2) stops the same facts being counted twice. It has rules for three dimensions only; the other five keep their standard value.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Dimension</th>
                <th className="py-2 pr-4 text-right font-medium">Standard</th>
                <th className="py-2 pr-4 text-right font-medium">Adjusted</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {risk.dimensions.map((d) => {
                const adj = isAdjusted(d)
                const hasV2 = d.dedupRule != null
                return (
                  <tr key={d.key} data-testid={`cmp-${d.key}`} data-adjusted={adj ? "true" : "false"}>
                    <td className="py-2 pr-4">{d.label}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtScore(d.score, 2)}</td>
                    <td className={cn("py-2 pr-4 text-right tabular-nums", adj && "font-semibold text-indigo-700 dark:text-indigo-300")}>
                      {adj ? fmtScore(d.scoreDedup, 2) : fmtScore(d.score, 2)}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {adj ? `Adjusted by rule ${d.dedupRule}` : hasV2 ? `Rule ${d.dedupRule} not applied — unchanged` : "Same in both models"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {risk.dedupExplanation && (
          <TechnicalDetails title="Adjustment rules (from Snowflake)">
            <p className="whitespace-pre-wrap text-muted-foreground">{risk.dedupExplanation}</p>
          </TechnicalDetails>
        )}
      </CardContent>
    </Card>
  )
}
