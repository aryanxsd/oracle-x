"use client"

import Link from "next/link"
import { AlertTriangle, ArrowDown, Clock, Search, X } from "lucide-react"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { typeStyle } from "@/components/graph/entity-node"
import { NATURE_TEXT, evidenceText, relLabel, relText } from "@/lib/graph-text"
import { fmtDate, fmtNumber, humanize } from "@/lib/format"
import type { GraphEdge, GraphNode, RelatedSignal } from "@/lib/graph-types"
import { cn } from "@/lib/utils"

export type Selection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null

/** Side panel / drawer explaining the selected entity or relationship from backend fields only. */
export function GraphDetails({
  selection,
  nodes,
  edges,
  center,
  signals,
  onClose,
  onSelectEdge,
  onExpand,
  canExpand,
}: {
  selection: Selection
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  center: string
  signals: RelatedSignal[]
  onClose: () => void
  onSelectEdge: (id: string) => void
  onExpand: (id: string) => void
  canExpand: boolean
}) {
  if (!selection) {
    return (
      <div className="p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Select an entity or a connection</p>
        <p className="mt-1">Click any circle to see who or what it is and how it connects to {center}. Click a line to see why that relationship matters and the records behind it.</p>
      </div>
    )
  }

  if (selection.kind === "edge") {
    const e = edges.find((x) => x.id === selection.id)
    if (!e) return null
    return (
      <Panel title="Relationship" onClose={onClose}>
        <EdgeCard edge={e} nodes={nodes} signals={signals} />
      </Panel>
    )
  }

  const n = nodes.get(selection.id)
  if (!n) return null
  const s = typeStyle(n.type)
  const Icon = s.icon
  const links = edges.filter((e) => e.source === n.id || e.target === n.id)
  const nodeSignals = signals.filter((sg) => sg.mentions.includes(n.id))
  return (
    <Panel title={n.id === center ? "Centre entity" : "Connected entity"} onClose={onClose}>
      <Section title="Who / what">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", s.bg, s.text)}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="font-semibold">{n.name}</div>
            <div className="text-xs text-muted-foreground">
              {s.label} · {n.id}
              {n.riskTier && ` · recorded risk tier ${n.riskTier.toLowerCase()}`}
            </div>
          </div>
        </div>
        {n.flagged && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-band-critical">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Flagged in the bank’s records
          </p>
        )}
      </Section>

      {n.id !== center && (
        <Section title={`Connection to ${center}`}>
          {n.hop > 1 && <p className="mb-2 text-sm text-muted-foreground">Reached in {n.hop} steps through the bounded graph.</p>}
          <ul className="space-y-1.5">
            {links.map((e) => (
              <li key={e.id}>
                <button onClick={() => onSelectEdge(e.id)} className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent">
                  <span className="font-medium">{nodes.get(e.source)?.name ?? e.source}</span> {relText(e.relationship)}{" "}
                  <span className="font-medium">{nodes.get(e.target)?.name ?? e.target}</span>
                  {e.observations != null && e.observations > 1 && <span className="text-muted-foreground"> · {fmtNumber(e.observations)} times</span>}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Why it matters">
        {nodeSignals.length ? (
          <ul className="space-y-2 text-sm">
            {nodeSignals.map((sg) => (
              <li key={sg.claimId} className="rounded-lg bg-band-elevated/5 p-2.5">
                <div className="text-xs text-muted-foreground">{humanize(sg.signalType)} · {sg.claimId}</div>
                <div>{sg.claim}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {n.id === center
              ? "This is the entity being investigated."
              : "No risk signal for this investigation cites this entity. It appears because of the relationship records shown above."}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">A connection is not evidence of wrongdoing.</p>
      </Section>

      <div className="flex flex-wrap gap-2 px-5 pb-5">
        {canExpand && n.id !== center && (
          <button onClick={() => onExpand(n.id)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">
            <Search className="h-4 w-4" aria-hidden /> Show paths through {n.id}
          </button>
        )}
        {(n.type === "MERCHANT" || n.type === "CUSTOMER") && (
          <Link href={`/investigations/${n.id}`} className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">
            Open investigation
          </Link>
        )}
      </div>
    </Panel>
  )
}

function EdgeCard({ edge: e, nodes, signals }: { edge: GraphEdge; nodes: Map<string, GraphNode>; signals: RelatedSignal[] }) {
  const a = nodes.get(e.source)
  const b = nodes.get(e.target)
  const nature = e.nature ? NATURE_TEXT[e.nature] : undefined
  const related = signals.filter((s) => s.mentions.includes(e.source) || s.mentions.includes(e.target))
  return (
    <>
      <Section title="Relationship">
        <div className="space-y-1 text-center text-sm">
          <div className="rounded-lg border px-3 py-2 font-medium">{a?.name ?? e.source}</div>
          <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden />
          <div className="rounded-full bg-primary/10 px-3 py-1 text-primary">{relLabel(e.relationship)}</div>
          <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden />
          <div className="rounded-lg border px-3 py-2 font-medium">{b?.name ?? e.target}</div>
        </div>
      </Section>

      <Section title="Why does this relationship matter?">
        <ul className="space-y-2 text-sm">
          {nature && (
            <li>
              <span className="font-medium">{nature.label}.</span> {nature.why}
            </li>
          )}
          {e.observations != null && (
            <li>
              Seen <strong>{fmtNumber(e.observations)}</strong> {e.observations === 1 ? "time" : "times"}
              {e.amountUsd != null && (
                <>
                  , totalling <strong>${fmtNumber(e.amountUsd)}</strong>
                </>
              )}
              .
            </li>
          )}
          {e.concurrent === false && (
            <li className="flex gap-1.5 text-band-elevated">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <strong>Never at the same time.</strong> {e.temporalNote ?? "These links did not overlap in time (sequential, not concurrent)."}
              </span>
            </li>
          )}
          {e.confidence != null && e.confidence < 1 && (
            <li>
              Link confidence <strong>{Math.round(e.confidence * 100)}%</strong> — below 100% means unverified or partial. <ProvenanceChip kind="MODEL OUTPUT" />
            </li>
          )}
          {(e.validFrom || e.validTo) && (
            <li className="text-muted-foreground">
              {e.validFrom ? `From ${fmtDate(e.validFrom)}` : ""}
              {e.validTo ? ` to ${fmtDate(e.validTo)}` : e.isCurrent ? " — still current" : ""}
            </li>
          )}
          {related.map((s) => (
            <li key={s.claimId} className="rounded-lg bg-band-elevated/5 p-2.5">
              <div className="text-xs text-muted-foreground">Cited by risk signal {s.claimId}</div>
              {s.claim}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">A relationship is not evidence of wrongdoing.</p>
      </Section>

      <Section title="Evidence">
        {e.evidence.length ? (
          <ul className="space-y-1.5 text-sm">
            {e.evidence.map((ref) => (
              <li key={ref}>
                <div>{evidenceText(ref)}</div>
                <code className="block break-all text-[11px] text-muted-foreground">{ref}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No evidence reference was returned for this relationship.</p>
        )}
      </Section>

      <Section title="Provenance">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ProvenanceChip kind="FACT" /> relationship from Snowflake records
          {e.confidence != null && (
            <>
              <ProvenanceChip kind="MODEL OUTPUT" /> confidence
            </>
          )}
          {e.evidence.some((r) => r.includes("ANALYST_NOTES") || r.includes("SAR_FILINGS")) && (
            <>
              <ProvenanceChip kind="NARRATIVE EVIDENCE" /> analyst note / SAR
            </>
          )}
        </div>
        {e.origin && <div className="mt-1 text-xs text-muted-foreground">Source: {e.origin}</div>}
      </Section>
    </>
  )
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button onClick={onClose} aria-label="Close details" className="rounded-md p-1 hover:bg-accent">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b px-5 py-4 last:border-b-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}
