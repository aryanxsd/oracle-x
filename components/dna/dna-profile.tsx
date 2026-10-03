"use client"

import { useState } from "react"
import Link from "next/link"
import { HelpCircle } from "lucide-react"
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { DNA_DIMENSIONS, FEATURE_LABEL, fmtDim, type DnaSnapshot } from "@/lib/dna-types"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface ClaimRef {
  claimId: string
  claim: string
  signalType: string
}

/**
 * The Risk DNA profile (INTEL.V_RISK_DNA): a radar of the seven 0–1 dimensions for the selected
 * snapshot, optionally overlaid on an earlier snapshot, plus one card per dimension with its
 * backend meaning, the features it is built from and a WHY link when an evidence claim exists.
 */
export function DnaProfile({ entityId, snapshots, claims }: { entityId: string; snapshots: DnaSnapshot[]; claims: ClaimRef[] | null }) {
  const [sel, setSel] = useState(0)
  const [compare, setCompare] = useState<number | null>(snapshots.length > 1 ? snapshots.length - 1 : null)
  if (!snapshots.length) return <p className="text-sm text-muted-foreground">No Risk DNA has been computed for this entity.</p>
  const s = snapshots[sel]
  const c = compare != null && compare !== sel ? snapshots[compare] : null
  const data = DNA_DIMENSIONS.map((d) => ({ dim: d.label, current: s.dims[d.key] ?? 0, earlier: c ? (c.dims[d.key] ?? 0) : undefined }))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Risk DNA profile <ProvenanceChip kind="MODEL OUTPUT" />
            <span className="text-sm font-normal text-muted-foreground">each dimension 0 (none) – 1 (strongest)</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Snapshot</span>
            {snapshots.map((x, i) => (
              <button
                key={x.dnaId}
                onClick={() => setSel(i)}
                aria-pressed={sel === i}
                className={cn("rounded-lg border px-2.5 py-1 text-xs", sel === i ? "border-primary bg-primary/5 font-medium" : "hover:bg-accent")}
              >
                {fmtDate(x.asOf)}
              </button>
            ))}
            {snapshots.length > 1 && (
              <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                Compare with
                <select
                  className="rounded border bg-background px-1.5 py-1"
                  value={compare ?? ""}
                  onChange={(e) => setCompare(e.target.value === "" ? null : Number(e.target.value))}
                  aria-label="Compare with snapshot"
                >
                  <option value="">none</option>
                  {snapshots.map((x, i) => (
                    <option key={x.dnaId} value={i}>
                      {fmtDate(x.asOf)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="h-72" aria-hidden>
            <ResponsiveContainer>
              <RadarChart data={data} outerRadius="75%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                {c && <Radar dataKey="earlier" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} isAnimationActive={false} name={fmtDate(c.asOf)} />}
                <Radar dataKey="current" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.25} isAnimationActive={false} name={fmtDate(s.asOf)} />
                <Tooltip formatter={(v) => fmtDim(Number(v))} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-sm" data-testid="dna-values">
            <p className="text-muted-foreground">
              Snapshot of {fmtDate(s.asOf)}
              {c && <> compared with {fmtDate(c.asOf)} (grey)</>}.
            </p>
            <ul className="mt-3 space-y-2">
              {DNA_DIMENSIONS.map((d) => (
                <li key={d.key} className="grid grid-cols-[7rem_1fr_3rem_3rem] items-center gap-2" data-testid={`dna-row-${d.key}`}>
                  <span>{d.label}</span>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(1, s.dims[d.key] ?? 0) * 100}%` }} />
                  </div>
                  <span className="text-right font-medium tabular-nums">{fmtDim(s.dims[d.key])}</span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">{c ? fmtDim(c.dims[d.key]) : ""}</span>
                </li>
              ))}
            </ul>
            {s.seasonality != null && (
              <p className="mt-3 text-xs text-muted-foreground">
                Seasonality context {fmtDim(s.seasonality)} — recorded alongside the profile as context; it is not one of the seven dimensions.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {DNA_DIMENSIONS.map((d) => {
          const related = claims?.filter((x) => d.signalTypes.includes(x.signalType)) ?? []
          return (
            <Card key={d.key} data-testid={`dna-card-${d.key}`}>
              <CardContent className="space-y-2 p-4 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{d.label}</span>
                  <span className="text-xl font-semibold tabular-nums">{fmtDim(s.dims[d.key])}</span>
                </div>
                <p className="text-muted-foreground">{d.meaning}</p>
                {d.features.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <ProvenanceChip kind="MODEL OUTPUT" /> Built from{" "}
                    {d.features.map((f) => (
                      <span key={f} className="rounded bg-muted px-1.5 py-0.5">
                        {FEATURE_LABEL[f] ?? f} {fmtDim(s.features[f] ?? null)}
                      </span>
                    ))}
                  </p>
                )}
                <div className="border-t pt-2 text-xs">
                  {d.key === "document" ? (
                    <Link href={`/evidence?entity=${entityId}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      <HelpCircle className="h-3.5 w-3.5" aria-hidden /> See the missing evidence
                    </Link>
                  ) : claims == null ? (
                    <span className="text-muted-foreground">Evidence links unavailable right now.</span>
                  ) : related.length ? (
                    <ul className="space-y-1">
                      {related.map((r) => (
                        <li key={r.claimId}>
                          <Link href={`/evidence?entity=${entityId}&claim=${encodeURIComponent(r.claimId)}#claim-${encodeURIComponent(r.claimId)}`} className="inline-flex items-start gap-1 text-primary hover:underline">
                            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> WHY: {r.claim}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground" data-testid={`no-why-${d.key}`}>
                      The backend has no evidence claim (WHY) for this dimension.
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
