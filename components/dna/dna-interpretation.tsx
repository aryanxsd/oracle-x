import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { isAdjusted } from "@/components/investigation/dimension-breakdown"
import { DNA_DIMENSIONS, fmtDim, type DnaSnapshot } from "@/lib/dna-types"
import type { EvidenceBalance } from "@/lib/evidence-types"
import type { RiskSummary } from "@/lib/server/investigation"
import { fmtDate, fmtScore, humanize } from "@/lib/format"

/**
 * "What kind of risk pattern does this entity have?" — only orderings and values taken directly
 * from the backend: the DNA dimensions ranked by their own values, the risk-score dimensions the
 * adjusted model changed, and the evidence balance. No thresholds, labels or verdicts are added.
 */
export function DnaInterpretation({ entityId, snapshot, risk, balance }: { entityId: string; snapshot: DnaSnapshot; risk: RiskSummary | null; balance: EvidenceBalance | null }) {
  const ranked = DNA_DIMENSIONS.map((d) => ({ ...d, v: snapshot.dims[d.key] })).filter((d) => d.v != null).sort((a, b) => b.v! - a.v!)
  const top = ranked.slice(0, 3)
  const next = ranked.slice(3, Math.max(3, ranked.length - 2))
  const low = ranked.length > 3 ? ranked.slice(-2) : []
  const adjusted = risk?.dimensions.filter(isAdjusted) ?? []
  const list = (xs: typeof ranked) => xs.map((d) => `${d.label} ${fmtDim(d.v)}`).join(" · ")

  return (
    <Card data-testid="dna-interpretation">
      <CardHeader>
        <CardTitle className="text-base">What kind of risk pattern does {entityId} have?</CardTitle>
        <p className="text-sm text-muted-foreground">
          Read from the Risk DNA of {fmtDate(snapshot.asOf)}. Risk DNA describes the shape of the risk; it is not a finding of fraud or money laundering.
        </p>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Item title="Dominant pattern" kind="MODEL OUTPUT" testId="interp-dominant">
            {top.length ? list(top) : "No dimensions available"}
            <div className="text-xs text-muted-foreground">The three highest Risk DNA dimensions.</div>
          </Item>
          <Item title="Supporting dimensions" kind="MODEL OUTPUT" testId="interp-supporting">
            {next.length ? list(next) : "—"}
          </Item>
          <Item title="Lower-risk dimensions" kind="MODEL OUTPUT" testId="interp-lower">
            {low.length ? list(low) : "—"}
            <div className="text-xs text-muted-foreground">The two lowest Risk DNA dimensions.</div>
          </Item>
          <Item title="Adjusted dimensions (risk score)" kind="MODEL OUTPUT" testId="interp-adjusted">
            {risk == null ? (
              <span className="text-muted-foreground">The risk score is unavailable right now.</span>
            ) : adjusted.length ? (
              adjusted.map((d) => (
                <div key={d.key}>
                  {d.label}: {fmtScore(d.score, 2)} standard → {fmtScore(d.scoreDedup, 2)} adjusted (rule {d.dedupRule})
                </div>
              ))
            ) : (
              "The adjusted model changed no dimension for this entity."
            )}
            <div className="text-xs text-muted-foreground">From the risk score (a separate model from Risk DNA).</div>
          </Item>
          <Item title="Evidence gaps" kind="MODEL OUTPUT" testId="interp-gaps">
            {balance ? (
              <>
                {balance.missing} pieces of evidence missing · {humanize(balance.posture).toLowerCase()} · uncertainty {balance.uncertainty.toLowerCase()}
              </>
            ) : (
              <span className="text-muted-foreground">No evidence balance is available.</span>
            )}
            <div className="text-xs text-muted-foreground">The Document dimension ({fmtDim(snapshot.dims.document)}) is the share of evidence still missing.</div>
          </Item>
          {snapshot.seasonality != null && (
            <Item title="Context" kind="MODEL OUTPUT" testId="interp-context">
              Seasonality {fmtDim(snapshot.seasonality)} recorded with this profile.
            </Item>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}

function Item({ title, kind, testId, children }: { title: string; kind: Parameters<typeof ProvenanceChip>[0]["kind"]; testId: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3" data-testid={testId}>
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} <ProvenanceChip kind={kind} />
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}
