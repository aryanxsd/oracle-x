"use client"

import "@xyflow/react/dist/style.css"
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Background, Controls, MarkerType, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node } from "@xyflow/react"
import { AlertTriangle, ArrowLeft, Info, Loader2, Maximize2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EntityNode, TYPE_STYLE, typeStyle, type EntityNodeData } from "@/components/graph/entity-node"
import { GraphDetails, type Selection } from "@/components/graph/graph-details"
import { radialLayout } from "@/lib/graph-layout"
import { relLabel } from "@/lib/graph-text"
import { GRAPH_LIMITS_DISPLAY, GRAPH_MAX_HOPS } from "@/lib/graph-limits"
import type { GraphResponse } from "@/lib/graph-types"
import { cn } from "@/lib/utils"

const nodeTypes = { entity: EntityNode }

const NATURE_EDGE: Record<string, { stroke: string; dash?: string }> = {
  STRUCTURAL_OR_DOCUMENTED: { stroke: "#64748b" },
  BEHAVIORAL_OBSERVED: { stroke: "#0ea5e9" },
  ADVERSE_OR_UNVERIFIED: { stroke: "#dc2626", dash: "6 4" },
}

type View = { mode: "direct" } | { mode: "paths"; hops: number; through: string | null }

export function GraphExplorer({ entityId }: { entityId: string }) {
  return (
    <ReactFlowProvider>
      <Explorer entityId={entityId} />
    </ReactFlowProvider>
  )
}

function Explorer({ entityId }: { entityId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const [view, setView] = useState<View>(() => readView(search))
  const [selection, setSelection] = useState<Selection>(null)
  const flow = useReactFlow()

  useEffect(() => {
    const q = new URLSearchParams({ entity: entityId })
    if (view.mode === "paths") {
      q.set("mode", "paths")
      q.set("hops", String(view.hops))
      if (view.through) q.set("through", view.through)
    }
    router.replace(`${pathname}?${q}`, { scroll: false })
    setSelection(null)
  }, [view, entityId, pathname, router])

  const query = useQuery({
    queryKey: ["graph", entityId, view],
    queryFn: async (): Promise<GraphResponse> => {
      const q = new URLSearchParams({ entity: entityId })
      if (view.mode === "paths") {
        q.set("mode", "paths")
        q.set("hops", String(view.hops))
        q.set("paths", "60")
        if (view.through) q.set("through", view.through)
      }
      const r = await fetch(`/api/graph?${q}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw Object.assign(new Error(j.error ?? "Could not load the graph"), { status: r.status })
      return j
    },
    staleTime: 60_000,
  })
  const g = query.data

  const nodeMap = useMemo(() => new Map((g?.nodes ?? []).map((n) => [n.id, n])), [g])
  const highlight = useMemo(() => {
    if (!selection || !g) return null
    if (selection.kind === "node") {
      const ids = new Set([selection.id])
      for (const e of g.edges) if (e.source === selection.id || e.target === selection.id) ids.add(e.source).add(e.target)
      return ids
    }
    const e = g.edges.find((x) => x.id === selection.id)
    return e ? new Set([e.source, e.target]) : null
  }, [selection, g])

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!g) return { rfNodes: [] as Node[], rfEdges: [] as Edge[] }
    const pos = radialLayout(g.nodes, g.center, g.edges)
    const rfNodes: Node[] = g.nodes.map((n) => ({
      id: n.id,
      type: "entity",
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: {
        id: n.id,
        type: n.type,
        name: n.name,
        flagged: n.flagged,
        center: n.id === g.center,
        selected: selection?.kind === "node" && selection.id === n.id,
        dimmed: highlight ? !highlight.has(n.id) : false,
      } satisfies EntityNodeData,
      ariaLabel: `${typeStyle(n.type).label} ${n.name}`,
    }))
    const rfEdges: Edge[] = g.edges.map((e) => {
      const st = NATURE_EDGE[e.nature ?? ""] ?? { stroke: "#94a3b8" }
      const active = selection?.kind === "edge" ? selection.id === e.id : highlight ? highlight.has(e.source) && highlight.has(e.target) : false
      const dim = highlight ? !active : false
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: active ? relLabel(e.relationship) : undefined,
        labelStyle: { fontSize: 11 },
        labelBgStyle: { fill: "var(--card)" },
        style: { stroke: st.stroke, strokeDasharray: st.dash, strokeWidth: active ? 3 : 1.4, opacity: dim ? 0.15 : 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, color: st.stroke, width: 14, height: 14 },
        interactionWidth: 18,
        ariaLabel: `${e.source} ${relLabel(e.relationship)} ${e.target}`,
      }
    })
    return { rfNodes, rfEdges }
  }, [g, selection, highlight])

  useEffect(() => {
    if (g) requestAnimationFrame(() => flow.fitView({ padding: 0.15, duration: 300 }))
  }, [g, flow])

  const focusSelected = useCallback(() => {
    if (!highlight) return
    flow.fitView({ nodes: [...highlight].map((id) => ({ id })), padding: 0.4, duration: 300 })
  }, [flow, highlight])

  const reset = () => {
    setSelection(null)
    setView({ mode: "direct" })
    flow.fitView({ padding: 0.15, duration: 300 })
  }

  const err = query.error as (Error & { status?: number }) | null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/investigations/${entityId}`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to investigation
        </Link>
        <div role="tablist" aria-label="Graph view" className="inline-flex rounded-lg border p-0.5">
          <TabButton active={view.mode === "direct"} onClick={() => setView({ mode: "direct" })}>
            Direct connections
          </TabButton>
          {[1, 2, 3].filter((h) => h <= GRAPH_MAX_HOPS).map((h) => (
            <TabButton key={h} active={view.mode === "paths" && view.hops === h && !view.through} onClick={() => setView({ mode: "paths", hops: h, through: null })}>
              {h} {h === 1 ? "step" : "steps"}
            </TabButton>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => flow.fitView({ padding: 0.15, duration: 300 })}>
          <Maximize2 className="h-4 w-4" aria-hidden /> Fit
        </Button>
        <Button variant="outline" size="sm" onClick={focusSelected} disabled={!highlight}>
          Focus selection
        </Button>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Reset
        </Button>
      </div>

      {g && <CountNotice g={g} view={view} onClear={() => setView({ mode: "paths", hops: view.mode === "paths" ? view.hops : 2, through: null })} />}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="relative h-[70vh] min-h-[480px] overflow-hidden rounded-xl border bg-card">
          {query.isLoading && <GraphSkeleton />}
          {err && (
            <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
              <p className="font-medium">{err.status === 404 ? `${entityId} was not found` : err.status === 400 ? "That graph request is outside the allowed limits" : "The graph couldn’t be loaded from Snowflake"}</p>
              <p className="text-sm text-muted-foreground">{err.status === 404 ? "Check the entity id and try again." : err.message}</p>
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {g && g.nodes.length <= 1 && (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground">
              <Info className="mb-2 h-6 w-6" aria-hidden />
              {entityId} has no recorded relationships{view.mode === "paths" ? " within these limits" : ""}.
            </div>
          )}
          {g && g.nodes.length > 1 && (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, n) => setSelection({ kind: "node", id: n.id })}
              onEdgeClick={(_, e) => setSelection({ kind: "edge", id: e.id })}
              onPaneClick={() => setSelection(null)}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
          {query.isFetching && g && (
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs shadow">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Updating
            </div>
          )}
        </div>

        <aside
          aria-label="Selection details"
          className={cn(
            "rounded-xl border bg-card lg:static lg:block lg:max-h-[70vh] lg:overflow-y-auto",
            selection ? "fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-b-none shadow-2xl" : "hidden",
          )}
        >
          {g && (
            <GraphDetails
              selection={selection}
              nodes={nodeMap}
              edges={g.edges}
              center={g.center}
              signals={g.signals}
              onClose={() => setSelection(null)}
              onSelectEdge={(id) => setSelection({ kind: "edge", id })}
              onExpand={(id) => setView({ mode: "paths", hops: Math.min(GRAPH_MAX_HOPS, 2), through: id })}
              canExpand
            />
          )}
        </aside>
      </div>

      <Legend />
      {g?.provenance && <p className="text-xs text-muted-foreground">{g.provenance}</p>}
    </div>
  )
}

function CountNotice({ g, view, onClear }: { g: GraphResponse; view: View; onClear: () => void }) {
  const relCount = g.edges.length
  if (g.mode === "direct") {
    const hidden = g.totals.filter((t) => t.shown < t.total)
    return (
      <div className="rounded-xl border bg-secondary/40 px-4 py-3 text-sm">
        Showing <strong>{relCount}</strong> of <strong>{g.totalDirect.toLocaleString("en-US")}</strong> direct relationships — every relationship type, every flagged entity, and the most active entities of each type.
        {hidden.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">What is not shown</summary>
            <ul className="mt-1 grid gap-x-6 text-xs text-muted-foreground sm:grid-cols-2">
              {hidden.map((t) => (
                <li key={`${t.relationship}|${t.neighborType}`}>
                  {relLabel(t.relationship)} ({typeStyle(t.neighborType).label.toLowerCase()}): {t.shown} of {t.total.toLocaleString("en-US")}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    )
  }
  return (
    <div className="rounded-xl border bg-secondary/40 px-4 py-3 text-sm">
      Showing <strong>{g.pathsReturned}</strong> of <strong>{g.pathsMatching?.toLocaleString("en-US")}</strong> paths within {g.bounds?.maxHops} {g.bounds?.maxHops === 1 ? "step" : "steps"}
      {view.mode === "paths" && view.through && (
        <>
          {" "}that pass through <strong>{view.through}</strong>{" "}
          <button onClick={onClear} className="text-primary hover:underline">
            (clear)
          </button>
        </>
      )}
      . {g.truncated && <>The graph is limited to {GRAPH_LIMITS_DISPLAY} per request; Snowflake ranks paths by fewest steps first, then flagged end entities and propagated risk.</>}
      {g.truncated && (g.bounds?.maxHops ?? 1) > Math.max(0, ...g.nodes.map((n) => n.hop)) && (
        <p className="mt-1 text-xs text-muted-foreground">
          All returned paths are shorter than {g.bounds?.maxHops} steps because shorter paths rank first. Select an entity and choose “Show paths through” to see longer chains.
        </p>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      {Object.entries(TYPE_STYLE)
        .filter(([k]) => k !== "TRANSACTION")
        .map(([k, s]) => {
          const Icon = s.icon
          return (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded", s.bg, s.text)}>
                <Icon className="h-3 w-3" aria-hidden />
              </span>
              {s.label}
            </span>
          )
        })}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-5 bg-slate-500" /> documented
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-5 bg-sky-500" /> observed in activity
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-5 border-t-2 border-dashed border-red-600" /> adverse / unverified
      </span>
      <span>Card transactions are shown as counts on relationships, not as separate circles.</span>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick} className={cn("rounded-md px-3 py-1 text-sm", active ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
      {children}
    </button>
  )
}

function GraphSkeleton() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4" aria-busy="true" aria-label="Loading graph">
      <div className="relative h-48 w-48">
        <Skeleton className="absolute left-1/2 top-1/2 h-10 w-24 -translate-x-1/2 -translate-y-1/2 rounded-xl" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <Skeleton key={a} className="absolute h-6 w-14 rounded-lg" style={{ left: `${50 + 42 * Math.cos((a * Math.PI) / 180)}%`, top: `${50 + 42 * Math.sin((a * Math.PI) / 180)}%`, transform: "translate(-50%,-50%)" }} />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Loading connections from Snowflake…</p>
    </div>
  )
}

function readView(search: URLSearchParams): View {
  if (search.get("mode") !== "paths") return { mode: "direct" }
  const h = Math.min(Math.max(Number(search.get("hops")) || 2, 1), GRAPH_MAX_HOPS)
  const t = search.get("through")
  return { mode: "paths", hops: h, through: t && /^[A-Z]{1,3}[0-9]{2,6}$/.test(t.toUpperCase()) ? t.toUpperCase() : null }
}
