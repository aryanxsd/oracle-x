"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowDown, ChevronRight, HelpCircle, Network } from "lucide-react"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { fmtDate, fmtNumber, humanize, splitRefs } from "@/lib/format"
import { refEntityIds, refProvenance, type ClaimDetail, type EvidenceClaim } from "@/lib/evidence-types"

/**
 * WHY — the one evidence inspector used everywhere (Investigation, Risk dimensions, Evidence page).
 * Renders a backend claim from INTEL.EVIDENCE_SUMMARY_SNAPSHOT as
 * CLAIM → DATA → CALCULATION → POLICY → SOURCE. Individual source records are only fetched
 * (via /api/evidence → AGENTS.TOOL_GET_EVIDENCE DETAIL) when the user asks for them.
 * All text is rendered as plain text; nothing is parsed as HTML.
 */
export function WhyPanel({
  claim,
  label = "Why?",
  entityId,
  defaultOpen = false,
}: {
  claim: EvidenceClaim | undefined
  label?: string
  /** Enables graph links and lazy source records. */
  entityId?: string
  defaultOpen?: boolean
}) {
  if (!claim) return null
  return (
    <details className="group" open={defaultOpen} data-testid={`why-${claim.claimId}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10">
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
        {label}
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <ol className="mt-3 space-y-1 rounded-xl border bg-card p-4 text-sm" aria-label="Evidence chain">
        <Step title="Claim" what="What the model says" kind="MODEL OUTPUT">
          {claim.claim}
        </Step>
        <Step title="Data" what="What was observed in the bank's records" kind="FACT">
          {claim.observed == null && claim.baseline == null ? (
            <span className="text-muted-foreground">No measured value recorded for this claim</span>
          ) : (
            <>
              Observed <strong>{fmtNumber(claim.observed)}</strong>
              {claim.baseline != null && (
                <>
                  {" "}
                  vs expected <strong>{fmtNumber(claim.baseline)}</strong>
                </>
              )}
              {claim.unit && <span className="text-muted-foreground"> ({claim.unit})</span>}
            </>
          )}
          {claim.detectedAt && <div className="mt-0.5 text-xs text-muted-foreground">Detected {fmtDate(claim.detectedAt)}</div>}
        </Step>
        <Step title="Calculation" what="How the backend calculated it" kind="MODEL OUTPUT">
          <span className="whitespace-pre-wrap">{claim.calculation ?? "Not recorded"}</span>
        </Step>
        <Step title="Policy" what="The rule that applies" kind="POLICY">
          <RefList items={splitRefs(claim.policyReference)} empty="No policy reference" />
          {claim.documentReference && (
            <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-teal-500/40 pl-3 text-xs text-muted-foreground">{claim.documentReference}</blockquote>
          )}
        </Step>
        <Step title="Source" what="Where the evidence comes from" kind="FACT" last>
          <RefList items={splitRefs(claim.sourceRecordIds ?? claim.sourceTables)} empty="Evidence is not currently available for this claim." entityId={entityId} />
          <div className="mt-1 text-xs text-muted-foreground">
            {claim.sourceRecordCount != null && <>{claim.sourceRecordCount} source records · </>}
            {claim.origin === "SEEDED_SIGNAL" ? "Curated risk signal" : claim.origin === "ENGINE_DIMENSION" ? "Risk engine dimension" : humanize(claim.origin)} · {claim.claimId}
          </div>
          {entityId && <SourceRecords entityId={entityId} claimId={claim.claimId} />}
        </Step>
      </ol>
    </details>
  )
}

function Step({ title, what, kind, children, last }: { title: string; what: string; kind: Parameters<typeof ProvenanceChip>[0]["kind"]; children: React.ReactNode; last?: boolean }) {
  return (
    <li data-step={title}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <ProvenanceChip kind={kind} />
        <span className="text-muted-foreground">{what}</span>
      </div>
      <div className="mt-1 break-words">{children}</div>
      {!last && <ArrowDown className="mx-auto my-1 h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />}
    </li>
  )
}

/** References with their own provenance (policy / narrative / fact) and graph links for entities. */
export function RefList({ items, empty, entityId, tagged = false }: { items: string[]; empty: string; entityId?: string; tagged?: boolean }) {
  if (!items.length) return <span className="text-muted-foreground">{empty}</span>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li key={i} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          {tagged && <ProvenanceChip kind={refProvenance(i)} />}
          {i}
          {entityId && <GraphLinks text={i} entityId={entityId} />}
        </li>
      ))}
    </ul>
  )
}

export function GraphLinks({ text, entityId }: { text: string; entityId: string }) {
  const ids = refEntityIds(text, entityId)
  if (!ids.length) return null
  return (
    <>
      {ids.map((id) => (
        <Link
          key={id}
          href={`/graph?entity=${encodeURIComponent(entityId)}&mode=paths&hops=2&through=${encodeURIComponent(id)}`}
          className="inline-flex items-center gap-0.5 font-sans text-primary hover:underline"
          title={`Show how ${entityId} connects to ${id}`}
        >
          <Network className="h-3 w-3" aria-hidden />
          {id}
        </Link>
      ))}
    </>
  )
}

const detailCache = new Map<string, Promise<ClaimDetail>>()

function loadDetail(entityId: string, claimId: string): Promise<ClaimDetail> {
  const key = `${entityId}|${claimId}`
  let p = detailCache.get(key)
  if (!p) {
    p = fetch(`/api/evidence?entity=${encodeURIComponent(entityId)}&claim=${encodeURIComponent(claimId)}`).then(async (r) => {
      if (!r.ok) throw new Error(r.status === 404 ? "not-found" : "failed")
      return (await r.json()) as ClaimDetail
    })
    p.catch(() => detailCache.delete(key))
    detailCache.set(key, p)
  }
  return p
}

/** Lazily loads the individual source records behind one claim. */
function SourceRecords({ entityId, claimId }: { entityId: string; claimId: string }) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "error" | "done"; data?: ClaimDetail }>({ status: "idle" })
  const load = () => {
    setState({ status: "loading" })
    loadDetail(entityId, claimId).then(
      (data) => setState({ status: "done", data }),
      () => setState({ status: "error" }),
    )
  }
  if (state.status === "idle")
    return (
      <button onClick={load} className="mt-2 text-xs font-medium text-primary hover:underline">
        Show the individual source records
      </button>
    )
  if (state.status === "loading") return <p className="mt-2 text-xs text-muted-foreground" aria-busy="true">Loading source records…</p>
  if (state.status === "error")
    return (
      <p role="alert" className="mt-2 text-xs text-destructive">
        Couldn’t load the source records.{" "}
        <button onClick={load} className="underline">
          Try again
        </button>
      </p>
    )
  const recs = state.data!.records
  if (!recs.length) return <p className="mt-2 text-xs text-muted-foreground">No individual source records are recorded for this claim.</p>
  return (
    <ul className="mt-2 space-y-1.5 text-xs" data-testid="source-records">
      {recs.map((r, i) => (
        <li key={i} className="rounded-lg border p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <ProvenanceChip kind={refProvenance(r.sourceTable ?? "")} />
            <span className="font-mono">{[r.sourceTable, r.sourceRecordId].filter(Boolean).join(" · ") || "Unnamed source"}</span>
            {r.sourceRecordId && <GraphLinks text={r.sourceRecordId} entityId={entityId} />}
          </div>
          {r.counter && <div className="mt-1 text-muted-foreground">Against: {r.counter}</div>}
        </li>
      ))}
    </ul>
  )
}
