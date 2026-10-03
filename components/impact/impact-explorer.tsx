"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Network } from "lucide-react"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { typeStyle } from "@/components/graph/entity-node"
import { fmtUsd, type ImpactedEntity } from "@/lib/impact-types"
import { cn } from "@/lib/utils"

/**
 * Impacted entities from INTEL.BLAST_RADIUS_CACHE grouped by step (direct = 1 hop, indirect = 2 hops)
 * and type. Selecting one shows the backend path, exposure and impact score, with a link to the
 * Entity Graph for the full relationship view (no traversal happens here).
 */
export function ImpactExplorer({ rootId, entities }: { rootId: string; entities: ImpactedEntity[] }) {
  const hops = [...new Set(entities.map((e) => e.hop))].sort((a, b) => a - b)
  const [hop, setHop] = useState<number | null>(hops[0] ?? null)
  const [type, setType] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const inHop = useMemo(() => entities.filter((e) => e.hop === hop), [entities, hop])
  const types = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of inHop) m.set(e.type, (m.get(e.type) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [inHop])
  const shown = inHop.filter((e) => !type || e.type === type)
  const LIMIT = 60
  const sel = entities.find((e) => e.id === selected && e.hop === hop) ?? null

  if (!entities.length) return <p className="text-sm text-muted-foreground">No connected entities are recorded in the blast radius.</p>

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]" data-testid="impact-explorer">
      <div>
        <div role="tablist" aria-label="Distance from the entity" className="flex flex-wrap gap-2">
          {hops.map((h) => (
            <button
              key={h}
              role="tab"
              aria-selected={hop === h}
              onClick={() => {
                setHop(h)
                setType(null)
                setSelected(null)
              }}
              className={cn("rounded-lg border px-3 py-1.5 text-sm", hop === h ? "border-primary bg-primary/5 font-medium" : "hover:bg-accent")}
            >
              {h === 1 ? "Direct (1 step)" : `Indirect (${h} steps)`} · {entities.filter((e) => e.hop === h).length}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filter by type">
          <Chip active={!type} onClick={() => setType(null)}>
            All · {inHop.length}
          </Chip>
          {types.map(([t, n]) => (
            <Chip key={t} active={type === t} onClick={() => setType(t)}>
              {typeStyle(t).label} · {n}
            </Chip>
          ))}
        </div>
        <ul className="mt-3 divide-y rounded-xl border" data-testid="impact-list">
          {shown.slice(0, LIMIT).map((e) => {
            const s = typeStyle(e.type)
            const Icon = s.icon
            return (
              <li key={`${e.hop}-${e.id}`}>
                <button
                  onClick={() => setSelected(e.id)}
                  aria-pressed={selected === e.id}
                  className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent", selected === e.id && "bg-primary/5")}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{e.name ?? e.id}</span> <span className="text-muted-foreground">{e.id}</span>
                  </span>
                  <span className="w-24 text-right tabular-nums text-muted-foreground">{e.exposureUsd != null ? fmtUsd(e.exposureUsd) : "—"}</span>
                  <span className="w-12 text-right tabular-nums">{e.impactScore ?? "—"}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {shown.length > LIMIT ? `Showing the ${LIMIT} highest-impact of ${shown.length}. ` : ""}Columns: direct exposure with {rootId} (USD) · impact score.
        </p>
      </div>
      <aside className="rounded-xl border p-4 text-sm" aria-live="polite" data-testid="impact-detail">
        {sel ? (
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{typeStyle(sel.type).label}</div>
              <div className="font-medium">{sel.name ?? sel.id}</div>
              <div className="font-mono text-xs text-muted-foreground">{sel.id}</div>
            </div>
            <Field label="How it is connected" kind="FACT">
              <span className="break-words font-mono text-xs">{sel.path ?? "Path not recorded"}</span>
            </Field>
            <Field label={`Direct exposure with ${rootId}`} kind="FACT">
              {sel.exposureUsd != null ? fmtUsd(sel.exposureUsd) : "No direct card or wire value with this entity in the window"}
            </Field>
            <Field label="Impact score" kind="MODEL OUTPUT">
              {sel.impactScore ?? "—"} <span className="text-xs text-muted-foreground">(0–100, propagated risk along the path)</span>
            </Field>
            <Link
              href={`/graph?entity=${encodeURIComponent(rootId)}&mode=paths&hops=${Math.max(2, sel.hop)}&through=${encodeURIComponent(sel.id)}`}
              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            >
              <Network className="h-4 w-4" aria-hidden /> Show on the Entity Graph
            </Link>
          </div>
        ) : (
          <p className="text-muted-foreground">Select an entity to see how it connects to {rootId} and how much is exposed.</p>
        )}
      </aside>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn("rounded-full border px-2.5 py-0.5 text-xs", active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>
      {children}
    </button>
  )
}

function Field({ label, kind, children }: { label: string; kind: Parameters<typeof ProvenanceChip>[0]["kind"]; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label} <ProvenanceChip kind={kind} />
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
