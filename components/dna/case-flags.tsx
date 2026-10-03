"use client"

import { Suspense, use } from "react"
import { CHARACTERISTICS, type CaseCharacteristics } from "@/lib/dna-types"
import { cn } from "@/lib/utils"

type Chars = Promise<CaseCharacteristics | null>

/**
 * "In both / only today / only in the past case" from backend characteristic flags. The flags
 * stream in separately (their view is slow to compile), so the rest of the case card never waits.
 */
export function CaseFlags({ chars, caseId, group }: { chars: Chars; caseId: string; group: "signals" | "relationships" }) {
  return (
    <Suspense fallback={<p className="text-xs text-muted-foreground" aria-busy="true">Loading matching characteristics…</p>}>
      <Flags chars={chars} caseId={caseId} group={group} />
    </Suspense>
  )
}

function Flags({ chars, caseId, group }: { chars: Chars; caseId: string; group: "signals" | "relationships" }) {
  const c = use(chars)
  if (c == null) return <p className="text-muted-foreground">Matching characteristics are unavailable right now.</p>
  const subject = c.subject
  const other = c.byCase[caseId]?.flags
  if (!subject || !other) return <p className="text-muted-foreground">The backend has no characteristic data for this comparison.</p>
  const cols = CHARACTERISTICS.filter((x) => x.group === group)
  const both = cols.filter((x) => subject[x.col] && other[x.col])
  const onlySubject = cols.filter((x) => subject[x.col] && !other[x.col])
  const onlyOther = cols.filter((x) => !subject[x.col] && other[x.col])
  return (
    <div className="space-y-1">
      <Chips label="In both" items={both.map((x) => x.label)} tone="bg-primary/10 text-primary" empty="None in common" />
      <Chips label="Only today" items={onlySubject.map((x) => x.label)} tone="bg-muted" />
      <Chips label="Only in the past case" items={onlyOther.map((x) => x.label)} tone="bg-muted" />
      {group === "signals" && (
        <p className="text-xs text-muted-foreground">For today’s entity these are measured from records; for past cases they come from the case’s recorded indicators.</p>
      )}
    </div>
  )
}

function Chips({ label, items, tone, empty }: { label: string; items: string[]; tone: string; empty?: string }) {
  if (!items.length && !empty) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-36 shrink-0 text-xs text-muted-foreground">{label}</span>
      {items.length ? (
        items.map((i) => (
          <span key={i} className={cn("rounded-full px-2 py-0.5 text-xs", tone)}>
            {i}
          </span>
        ))
      ) : (
        <span className="text-xs text-muted-foreground">{empty}</span>
      )}
    </div>
  )
}
