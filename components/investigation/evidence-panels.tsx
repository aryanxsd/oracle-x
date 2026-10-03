import { AlertCircle, CheckCircle2, ChevronRight, CircleSlash, Scale } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { GraphLinks, WhyPanel } from "@/components/investigation/why-panel"
import { fmtDate, humanize, splitRefs } from "@/lib/format"
import { refProvenance, type EvidenceBalance, type EvidenceClaim } from "@/lib/evidence-types"
import { cn } from "@/lib/utils"

const POSTURE_TEXT: Record<string, string> = {
  CONTESTED: "Contested — the evidence for and against is roughly balanced",
  LEANS_TOWARD_SUSPICION: "Leans toward suspicion",
  LEANS_TOWARD_LEGITIMATE_EXPLANATION: "Leans toward a legitimate explanation",
  NO_DIRECTIONAL_EVIDENCE: "No directional evidence",
}

const signalsOf = (claims: EvidenceClaim[]) => claims.filter((c) => c.origin === "SEEDED_SIGNAL")

/** Evidence completeness and balance from INTEL.V_EVIDENCE_BALANCE (backend counts and posture). */
export function EvidenceCompleteness({ balance, claims }: { balance: EvidenceBalance | null; claims: EvidenceClaim[] }) {
  if (!balance) return <p className="text-sm text-muted-foreground">No evidence balance is available for this entity.</p>
  const signals = signalsOf(claims)
  const withGaps = signals.filter((c) => c.missing).length
  const total = balance.supporting + balance.contradicting + balance.neutral || 1
  const needsMore = balance.uncertainty !== "LOW" || balance.posture === "CONTESTED" || balance.posture === "NO_DIRECTIONAL_EVIDENCE"
  return (
    <Card data-testid="evidence-completeness">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" aria-hidden /> Evidence completeness <ProvenanceChip kind="MODEL OUTPUT" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          <strong>{POSTURE_TEXT[balance.posture] ?? humanize(balance.posture)}</strong>. Uncertainty is <strong>{balance.uncertainty.toLowerCase()}</strong>
          {balance.missing > 0 ? <> because {balance.missing} pieces of evidence are still missing.</> : "."}
        </p>
        {needsMore && (
          <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            More evidence is needed before escalation.
          </p>
        )}
        <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-label="Evidence balance">
          <div className="bg-band-elevated" style={{ width: `${(balance.supporting / total) * 100}%` }} title={`${balance.supporting} supporting`} />
          <div className="bg-band-normal" style={{ width: `${(balance.contradicting / total) * 100}%` }} title={`${balance.contradicting} contradicting`} />
          <div className="bg-muted-foreground/30" style={{ width: `${(balance.neutral / total) * 100}%` }} title={`${balance.neutral} neutral`} />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Supports suspicion" value={balance.supporting} tone="text-band-elevated" testId="bal-supporting" />
          <Stat label="Contradicts suspicion" value={balance.contradicting} tone="text-band-normal" testId="bal-contradicting" />
          <Stat label="Neutral" value={balance.neutral} testId="bal-neutral" />
          <Stat label="Still missing" value={balance.missing} tone="text-destructive" testId="bal-missing" />
        </dl>
        <p className="text-xs text-muted-foreground">
          {withGaps} of {signals.length} risk signals have an open evidence gap. Net evidence position {balance.netPosition.toFixed(3)} (positive leans toward
          suspicion, negative toward a legitimate explanation). The balance weighs evidence for review — it is not a finding of fraud or money laundering.
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, tone, testId }: { label: string; value: number; tone?: string; testId?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-2xl font-semibold tabular-nums", tone)} data-testid={testId}>
        {value}
      </dd>
    </div>
  )
}

const SEVERITY_TONE: Record<string, string> = { HIGH: "bg-band-critical/12 text-band-critical", MEDIUM: "bg-band-elevated/12 text-band-elevated", LOW: "bg-band-watch/15 text-band-watch-fg" }

/**
 * Risk signals, collapsed to one line each (signal, status, counts). Expanding a signal shows its
 * supporting, contradicting and missing evidence and the WHY chain.
 */
export function SignalEvidence({ claims, entityId, openClaim }: { claims: EvidenceClaim[]; entityId?: string; openClaim?: string | null }) {
  const signals = signalsOf(claims)
  if (!signals.length) return <p className="text-sm text-muted-foreground">No risk signals are recorded for this entity.</p>
  return (
    <div className="space-y-3" data-testid="signal-list">
      {signals.map((s) => {
        const sup = splitRefs(s.supporting)
        const con = splitRefs(s.contradicting)
        const miss = splitRefs(s.missing)
        return (
          <details key={s.claimId} id={`claim-${s.claimId}`} open={openClaim === s.claimId} className="group scroll-mt-32 rounded-xl border bg-card" data-testid={`signal-${s.claimId}`}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-4">
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{humanize(s.signalType)}</div>
                <div className="font-medium">{s.claim}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {s.status && <span className="rounded-full bg-muted px-2 py-0.5">{humanize(s.status)}</span>}
                {s.severity && <span className={cn("rounded-full px-2 py-0.5", SEVERITY_TONE[s.severity])}>{humanize(s.severity)}</span>}
                <Count n={sup.length} label="for" className="text-band-elevated" />
                <Count n={con.length} label="against" className="text-band-normal" />
                <Count n={miss.length} label="missing" className="text-destructive" />
              </div>
            </summary>
            <div className="border-t p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Column icon={<AlertCircle className="h-4 w-4 text-band-elevated" />} title="Supports the suspicion" items={sup} entityId={entityId} />
                <Column icon={<CheckCircle2 className="h-4 w-4 text-band-normal" />} title="Contradicts it" items={con} entityId={entityId} empty="No contradicting evidence recorded" contra />
                <Column icon={<CircleSlash className="h-4 w-4 text-destructive" />} title="Still missing" items={miss} empty="Nothing outstanding" missing />
              </div>
              <div className="mt-4">
                <WhyPanel claim={s} entityId={entityId} label="Why is this a signal?" defaultOpen={openClaim === s.claimId} />
              </div>
            </div>
          </details>
        )
      })}
    </div>
  )
}

function Count({ n, label, className }: { n: number; label: string; className?: string }) {
  return (
    <span className="rounded-full border px-2 py-0.5 tabular-nums">
      <span className={cn("font-semibold", className)}>{n}</span> {label}
    </span>
  )
}

function Column({
  icon,
  title,
  items,
  entityId,
  empty = "None recorded",
  contra,
  missing,
}: {
  icon: React.ReactNode
  title: string
  items: string[]
  entityId?: string
  empty?: string
  contra?: boolean
  missing?: boolean
}) {
  return (
    <div className={cn(contra && items.length > 0 && "rounded-lg border-l-4 border-band-normal bg-band-normal/5 p-2")}>
      <div className="flex items-center gap-1.5 text-sm font-medium">
        {icon} {title}
      </div>
      {items.length ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {items.map((i) => (
            <li key={i} className="break-words">
              {!missing && <ProvenanceChip kind={refProvenance(i)} className="mr-1.5" />}
              <span className="text-muted-foreground">{i}</span>
              {entityId && !missing && (
                <span className="ml-1 text-xs">
                  <GraphLinks text={i} entityId={entityId} />
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground/70">{empty}</p>
      )}
    </div>
  )
}

type Kind = "supporting" | "contradicting" | "missing"

const LIST_META: Record<Kind, { title: string; help: string; icon: React.ReactNode; tone: string }> = {
  supporting: {
    title: "Supporting evidence",
    help: "Records and notes the backend lists as supporting a risk claim.",
    icon: <AlertCircle className="h-4 w-4 text-band-elevated" aria-hidden />,
    tone: "border-band-elevated/40",
  },
  contradicting: {
    title: "Contradicting evidence",
    help: "Records, notes and policy the backend lists as challenging a risk claim — possible legitimate explanations.",
    icon: <CheckCircle2 className="h-4 w-4 text-band-normal" aria-hidden />,
    tone: "border-band-normal/50 bg-band-normal/5",
  },
  missing: {
    title: "Missing evidence",
    help: "What the backend records as still needed, and which claim it affects.",
    icon: <CircleSlash className="h-4 w-4 text-destructive" aria-hidden />,
    tone: "border-destructive/30",
  },
}

/**
 * Evidence across every claim, grouped by the backend's own classification
 * (SUPPORTING_EVIDENCE / CONTRADICTING_EVIDENCE / MISSING_EVIDENCE columns). Collapsed by default.
 */
export function EvidenceByKind({ claims, kind, entityId }: { claims: EvidenceClaim[]; kind: Kind; entityId: string }) {
  const meta = LIST_META[kind]
  const items = claims.flatMap((c) => splitRefs(kind === "supporting" ? c.supporting : kind === "contradicting" ? c.contradicting : c.missing).map((text) => ({ text, claim: c })))
  return (
    <details className={cn("group rounded-xl border", meta.tone)} data-testid={`list-${kind}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4">
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        {meta.icon}
        <span className="font-medium">{meta.title}</span>
        <span className="rounded-full border px-2 py-0.5 text-xs tabular-nums" data-testid={`list-${kind}-count`}>
          {items.length} references on {new Set(items.map((i) => i.claim.claimId)).size} claims
        </span>
      </summary>
      <div className="border-t p-4">
        <p className="mb-3 text-xs text-muted-foreground">{meta.help}</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <ul className="divide-y text-sm">
            {items.map(({ text, claim }, i) => (
              <li key={`${claim.claimId}-${i}`} className="py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {kind !== "missing" && <ProvenanceChip kind={refProvenance(text)} />}
                  <span className={cn(kind === "missing" ? "font-medium" : "break-all font-mono text-xs")}>{text}</span>
                  {kind !== "missing" && <GraphLinks text={text} entityId={entityId} />}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {kind === "contradicting" ? "Challenges" : kind === "missing" ? "Affects" : "Supports"}: <a href={`#claim-${claim.claimId}`} className="text-foreground hover:underline">{claim.claim}</a>
                  {" · "}
                  {humanize(claim.signalType)}
                  {claim.detectedAt && <> · {fmtDate(claim.detectedAt)}</>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

/** The eight risk-engine dimension claims, each with the same WHY chain. */
export function DimensionClaims({ claims, entityId, openClaim }: { claims: EvidenceClaim[]; entityId: string; openClaim?: string | null }) {
  const dims = claims.filter((c) => c.origin === "ENGINE_DIMENSION")
  if (!dims.length) return <p className="text-sm text-muted-foreground">No risk-engine claims are recorded for this entity.</p>
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Risk dimension claims <ProvenanceChip kind="MODEL OUTPUT" />
        </CardTitle>
        <p className="text-sm text-muted-foreground">What the risk engine concluded for each dimension. Open WHY to follow the evidence chain.</p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {dims.map((d) => (
            <li key={d.claimId} id={`claim-${d.claimId}`} className="scroll-mt-32 py-3 first:pt-0 last:pb-0" data-testid={`dimclaim-${d.signalType}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{d.claim}</span>
                <span className="text-xs text-muted-foreground">
                  {splitRefs(d.contradicting).length} against · {splitRefs(d.missing).length} missing
                </span>
              </div>
              <div className="mt-1">
                <WhyPanel claim={d} entityId={entityId} label={`Why: ${humanize(d.signalType).toLowerCase()}`} defaultOpen={openClaim === d.claimId} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
