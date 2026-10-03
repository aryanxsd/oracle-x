import Link from "next/link"
import { ArrowDown, ChevronRight, Network } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { CaseFlags } from "@/components/dna/case-flags"
import { DNA_DIMENSIONS, OUTCOME_LABEL, fmtDim, type CaseCharacteristics, type SimilarCase, type SimilarCases } from "@/lib/dna-types"
import { fmtDate, humanize, splitRefs } from "@/lib/format"
import { cn } from "@/lib/utils"

const OPEN_BY_DEFAULT = 3
type Chars = Promise<CaseCharacteristics | null>

/** "Have we seen a similar risk pattern before?" — backend-ranked historical cases with progressive "Why similar?". */
export function SimilarCaseList({ data, chars }: { data: SimilarCases; chars: Chars }) {
  if (!data.cases.length) return <p className="text-sm text-muted-foreground">The backend found no historical investigations to compare with this entity.</p>
  const top = data.cases[0]
  return (
    <div className="space-y-4">
      <Card data-testid="similar-answer">
        <CardContent className="space-y-2 p-5 text-sm">
          <p className="text-base">
            <strong>{data.cases.length}</strong> historical investigations were compared with {data.entityId}’s Risk DNA. The closest profile is{" "}
            <strong>{top.caseId}</strong> ({top.historicalEntityName ?? top.historicalEntityId}), with a profile similarity of{" "}
            <strong className="tabular-nums">{top.similarity}</strong>.
          </p>
          {top.interpretationNote && (
            <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-medium text-amber-900 dark:text-amber-200">
              {top.interpretationNote}
            </p>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-primary hover:underline">How is similarity calculated?</summary>
            <p className="mt-1 text-muted-foreground">{data.methodology}</p>
            <p className="mt-1 text-muted-foreground">
              The score runs from 0 (nothing in common) to 1 (identical profile shape) and is shown exactly as the backend returns it. Compared profile:{" "}
              {data.entityId} as of {fmtDate(data.subjectAsOf)}.
            </p>
          </details>
        </CardContent>
      </Card>
      <ol className="space-y-3" data-testid="similar-list">
        {data.cases.map((c, i) => (
          <CaseCard key={c.caseId} c={c} data={data} chars={chars} defaultOpen={i < OPEN_BY_DEFAULT} />
        ))}
      </ol>
    </div>
  )
}

function CaseCard({ c, data, chars, defaultOpen }: { c: SimilarCase; data: SimilarCases; chars: Chars; defaultOpen: boolean }) {
  return (
    <li>
      <Card data-testid={`case-${c.caseId}`}>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">#{c.rank}</span>
                <span className="font-mono">{c.caseId}</span>
                <span>opened {fmtDate(c.openedAt)}</span>
                {c.closedAt && <span>closed {fmtDate(c.closedAt)}</span>}
                {c.connectedHop != null && (
                  <span className="rounded-full bg-band-elevated/12 px-2 py-0.5 font-medium text-band-elevated" data-testid={`connected-${c.caseId}`}>
                    Connected to {data.entityId} today ({c.connectedHop === 1 ? "directly" : `${c.connectedHop} steps`})
                  </span>
                )}
              </div>
              <h3 className="mt-1 font-medium">
                {c.historicalEntityName ?? c.historicalEntityId} <span className="font-normal text-muted-foreground">({c.historicalEntityId})</span>
              </h3>
              <p className="text-sm text-muted-foreground">{humanize(c.typology)}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                Profile similarity <ProvenanceChip kind="MODEL OUTPUT" />
              </div>
              <div className="text-2xl font-semibold tabular-nums" data-testid={`sim-${c.caseId}`}>
                {c.similarity}
              </div>
              <div className="h-1.5 w-28 rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(0, Math.min(1, c.similarity)) * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Historical outcome:</span> {c.outcome ? (OUTCOME_LABEL[c.outcome] ?? humanize(c.outcome)) : "—"}{" "}
              <span className="text-xs text-muted-foreground">(context only)</span>
            </span>
            {c.riskScoreAtOpen != null && (
              <span>
                <span className="text-muted-foreground">Risk score when opened:</span> {c.riskScoreAtOpen} <span className="text-xs text-muted-foreground">(no band recorded)</span>
              </span>
            )}
          </div>

          <details className="group rounded-xl border" open={defaultOpen} data-testid={`why-similar-${c.caseId}`}>
            <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-medium text-primary">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden /> Why similar?
            </summary>
            <div className="space-y-1 border-t p-4 text-sm">
              <Step title={data.entityId} kind="MODEL OUTPUT" what="The entity under investigation">
                Compared using its Risk DNA of {fmtDate(data.subjectAsOf)}.
              </Step>
              <Step title="Matching risk signals" kind="FACT" what="Characteristics recorded for both" testId={`step-signals-${c.caseId}`}>
                <CaseFlags chars={chars} caseId={c.caseId} group="signals" />
              </Step>
              <Step title="Matching behaviour" kind="MODEL OUTPUT" what="Risk DNA dimensions side by side" testId={`step-behaviour-${c.caseId}`}>
                <DnaCompare subject={data.subjectDna} other={c.dna} otherAsOf={c.dnaAsOf} subjectId={data.entityId} />
              </Step>
              <Step title="Matching relationships" kind="FACT" what="Network characteristics recorded for both" testId={`step-relationships-${c.caseId}`}>
                <CaseFlags chars={chars} caseId={c.caseId} group="relationships" />
                {c.connectedHop != null ? (
                  <p className="mt-2">
                    {c.historicalEntityId} is in {data.entityId}’s blast radius today, {c.connectedHop === 1 ? "one step" : `${c.connectedHop} steps`} away.{" "}
                    <Link
                      href={`/graph?entity=${data.entityId}&mode=paths&hops=${Math.max(2, c.connectedHop)}&through=${c.historicalEntityId}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Network className="h-3.5 w-3.5" aria-hidden /> Show on the Entity Graph
                    </Link>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {c.historicalEntityId} is not in {data.entityId}’s blast radius.
                  </p>
                )}
              </Step>
              <Step title="Historical case" kind="NARRATIVE EVIDENCE" what="What the past investigation recorded" last testId={`step-case-${c.caseId}`}>
                <dl className="space-y-1.5">
                  {c.keyIndicators && <Row term="Key indicators">{c.keyIndicators}</Row>}
                  {c.decidingFactors && <Row term="Deciding factors">{c.decidingFactors}</Row>}
                  {c.summary && <Row term="Summary">{c.summary}</Row>}
                </dl>
                <CaseEvidenceList c={c} />
              </Step>
            </div>
          </details>
        </CardContent>
      </Card>
    </li>
  )
}

function Step({ title, kind, what, children, last, testId }: { title: string; kind: Parameters<typeof ProvenanceChip>[0]["kind"]; what: string; children: React.ReactNode; last?: boolean; testId?: string }) {
  return (
    <div data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">{title}</span> <ProvenanceChip kind={kind} />
        <span className="text-muted-foreground">{what}</span>
      </div>
      <div className="mt-1">{children}</div>
      {!last && <ArrowDown className="mx-auto my-1 h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />}
    </div>
  )
}

function DnaCompare({ subject, other, otherAsOf, subjectId }: { subject: SimilarCases["subjectDna"]; other: SimilarCase["dna"]; otherAsOf: string | null; subjectId: string }) {
  if (!subject || !other) return <p className="text-muted-foreground">The backend has no Risk DNA for one side of this comparison.</p>
  return (
    <div>
      <div className="grid grid-cols-[6.5rem_1fr_1fr] gap-x-3 text-xs text-muted-foreground">
        <span />
        <span>{subjectId}</span>
        <span>Past case ({fmtDate(otherAsOf)})</span>
      </div>
      <ul className="mt-1 space-y-1">
        {DNA_DIMENSIONS.map((d) => (
          <li key={d.key} className="grid grid-cols-[6.5rem_1fr_1fr] items-center gap-x-3 text-xs">
            <span>{d.label}</span>
            <Bar v={subject[d.key]} tone="bg-primary/70" />
            <Bar v={other[d.key]} tone="bg-slate-400" />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Bar({ v, tone }: { v: number | null; tone: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.min(1, v ?? 0) * 100}%` }} />
      </span>
      <span className="w-8 text-right tabular-nums">{fmtDim(v)}</span>
    </span>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function CaseEvidenceList({ c }: { c: SimilarCase }) {
  if (!c.evidence.length) return <p className="mt-2 text-xs text-muted-foreground">No evidence items are recorded for this case.</p>
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">Recorded evidence ({c.evidence.length})</summary>
      <ul className="mt-2 space-y-1.5 text-xs" data-testid={`case-evidence-${c.caseId}`}>
        {c.evidence.map((e) => (
          <li key={e.evidenceId} className="rounded-lg border p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("rounded-full px-2 py-0.5", e.stance === "SUPPORTS" ? "bg-band-elevated/12 text-band-elevated" : e.stance === "CONTRADICTS" ? "bg-band-normal/12 text-band-normal" : "bg-muted")}>
                {e.stance === "SUPPORTS" ? "Supported suspicion" : e.stance === "CONTRADICTS" ? "Contradicted suspicion" : humanize(e.stance)}
              </span>
              <span className="text-muted-foreground">{humanize(e.type)}</span>
              {e.verified != null && <span className="text-muted-foreground">{e.verified ? "verified" : "unverified"}</span>}
              {e.confidence != null && <span className="text-muted-foreground">confidence {e.confidence}</span>}
              {e.collectedAt && <span className="text-muted-foreground">{fmtDate(e.collectedAt)}</span>}
            </div>
            {e.description && <p className="mt-1">{e.description}</p>}
            {e.source && (
              <p className="mt-1 flex flex-wrap gap-1 text-muted-foreground">
                Source:{" "}
                {splitRefs(e.source).map((s) => (
                  <span key={s} className="rounded bg-muted px-1.5 py-0.5 font-mono">
                    {s}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
