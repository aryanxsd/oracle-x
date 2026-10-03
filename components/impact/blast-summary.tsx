import { ArrowDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { ImpactExplorer } from "@/components/impact/impact-explorer"
import { BLAST_METRIC_META, fmtCount, fmtUsd, type BlastMetric, type BlastRadius } from "@/lib/impact-types"
import { fmtDate, humanize } from "@/lib/format"

const TIERS = [
  { key: "direct", title: "Direct impact", help: "Who and what dealt with the entity directly in the window." },
  { key: "indirect", title: "Indirect impact", help: "Connected one step further out: other accounts of those customers and merchants sharing devices or wire counterparties." },
  { key: "exposure", title: "Connected exposure", help: "Money that flowed through the entity in the window, and the part the backend counts as at risk." },
] as const

/** Root → direct → indirect → exposure, every number from INTEL.BLAST_RADIUS_CACHE with its methodology. */
export function BlastSummary({ entityName, br }: { entityName: string; br: BlastRadius }) {
  const known = br.metrics.filter((m) => BLAST_METRIC_META[m.name])
  const other = br.metrics.filter((m) => !BLAST_METRIC_META[m.name])
  const hop = (h: number) => br.entities.filter((e) => e.hop === h).length
  return (
    <div className="space-y-2" data-testid="blast-summary">
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Starting point</div>
            <div className="text-lg font-semibold">
              {entityName} <span className="font-normal text-muted-foreground">({br.rootId})</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Window {fmtDate(br.windowStart)} – {fmtDate(br.windowEnd)} · up to {br.maxDepth ?? "—"} steps · computed {fmtDate(br.computedAt)}
            {br.modelVersion && <> · {br.modelVersion}</>}
          </div>
        </CardContent>
      </Card>
      {TIERS.map((t) => {
        const ms = known.filter((m) => BLAST_METRIC_META[m.name].tier === t.key)
        if (!ms.length) return null
        return (
          <div key={t.key}>
            <ArrowDown className="mx-auto my-1 h-5 w-5 text-muted-foreground/60" aria-hidden />
            <section aria-labelledby={`tier-${t.key}`} data-testid={`tier-${t.key}`}>
              <h3 id={`tier-${t.key}`} className="text-base font-semibold">
                {t.title}
                {t.key === "direct" && hop(1) > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{hop(1)} connected entities one step away</span>}
                {t.key === "indirect" && hop(2) > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{hop(2)} connected entities two steps away</span>}
              </h3>
              <p className="text-sm text-muted-foreground">{t.help}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ms.map((m) => (
                  <MetricCard key={m.name} m={m} />
                ))}
              </div>
            </section>
          </div>
        )
      })}
      {other.length > 0 && (
        <div className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          {other.map((m) => (
            <MetricCard key={m.name} m={m} />
          ))}
        </div>
      )}
    </div>
  )
}

function MetricCard({ m }: { m: BlastMetric }) {
  const meta = BLAST_METRIC_META[m.name]
  const isRisk = m.name === "risk_exposure"
  return (
    <Card className={isRisk ? "border-band-elevated/50" : undefined} data-testid={`metric-${m.name}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {meta?.label ?? humanize(m.name)} <ProvenanceChip kind={meta?.kind ?? "MODEL OUTPUT"} />
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{meta?.usd ? fmtUsd(m.value) : fmtCount(m.value)}</div>
        {isRisk && <div className="text-xs text-muted-foreground">Exposure at risk — not a loss estimate</div>}
        {m.methodology && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-primary hover:underline">How this is derived</summary>
            <p className="mt-1 text-muted-foreground">{m.methodology}</p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">Source: INTEL.BLAST_RADIUS_CACHE · {m.name}</p>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

export function ConnectedEntities({ br }: { br: BlastRadius }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Connected entities <ProvenanceChip kind="MODEL OUTPUT" />
        </CardTitle>
        {br.entityMethodology && (
          <details className="text-xs">
            <summary className="cursor-pointer text-primary hover:underline">Which entities are included, and how impact is scored</summary>
            <p className="mt-1 text-muted-foreground">{br.entityMethodology}</p>
          </details>
        )}
      </CardHeader>
      <CardContent>
        <ImpactExplorer rootId={br.rootId} entities={br.entities} />
      </CardContent>
    </Card>
  )
}
