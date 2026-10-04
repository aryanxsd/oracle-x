import { use } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowRight, ArrowUpRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { RiskBandBadge } from "@/components/oracle/risk-band-badge"
import { Markdown } from "@/components/oracle/markdown"
import { WhyPanel } from "@/components/investigation/why-panel"
import { isAdjusted } from "@/components/investigation/dimension-breakdown"
import { StatusPill } from "@/components/trace/trace-view"
import { councilSections, headlineScenarioMetrics, isMixedEvidence, topContributors } from "@/lib/decision-brief"
import { BLAST_METRIC_META, SCENARIO_LABEL, SCENARIO_ORDER, fmtCount, fmtUsd, type BlastRadius, type ScenarioSet } from "@/lib/impact-types"
import { COUNCIL_STAGES, asBand } from "@/lib/risk-style"
import { fmtDate, fmtScore } from "@/lib/format"
import type { EvidenceOverview } from "@/lib/server/evidence"
import type { Identity, RiskSummary, Timeline, WarningEvent } from "@/lib/server/investigation"
import type { Trace } from "@/lib/trace-types"
import { cn } from "@/lib/utils"

/**
 * M044 Decision Brief sections. Each section receives the promise of an existing server reader and
 * reads it with use(), so the page streams section by section. Every value shown is a stored backend
 * value; stored council text is quoted verbatim and attributed, never rewritten.
 */

type P<T> = Promise<T>
/** Readers may fail; the page wraps each promise so a failure arrives as { error: true }. */
export type Loaded<T> = { ok: true; value: T } | { ok: false }

export function settled<T>(p: Promise<T>): Promise<Loaded<T>> {
  return p.then(
    (value) => ({ ok: true as const, value }),
    (e) => {
      console.error(new Date().toISOString(), "[oracle-x] decision brief section", e)
      return { ok: false as const }
    },
  )
}

export function SectionCard({ id, title, kicker, children, actions }: { id: string; title: string; kicker?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24" data-testid={`brief-${id}`}>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle id={`${id}-h`} className="text-base">
              {title}
            </CardTitle>
            {kicker && <p className="mt-1 text-sm text-muted-foreground">{kicker}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-3 text-sm">{actions}</div>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}

export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
      {children} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  )
}

export function Unavailable({ what }: { what: string }) {
  return (
    <p role="alert" className="text-sm text-muted-foreground">
      {what} is not available right now. Refresh the page to try again.
    </p>
  )
}

/* ---------------------------------------------------------------- header */

export function BriefHeader({ identity, risk }: { identity: Identity; risk: P<Loaded<RiskSummary | null>> }) {
  const r = use(risk)
  const s = r.ok ? r.value : null
  const band = asBand(s?.bandDedup ?? s?.band)
  const id = encodeURIComponent(identity.entityId)
  return (
    <header className="rounded-xl border bg-card" data-testid="brief-header">
      <div className="flex flex-wrap items-end justify-between gap-6 p-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">ORACLE X · Investigation decision brief</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{identity.entityId}</h1>
          <p className="text-sm text-muted-foreground">
            {identity.name} · {identity.type.toLowerCase().replace(/_/g, " ")}
          </p>
        </div>
        {s ? (
          <div className="flex items-end gap-8">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Adjusted risk <ProvenanceChip kind="MODEL OUTPUT" />
              </div>
              <div className={cn("text-4xl font-semibold tabular-nums", band === "CRITICAL" && "text-band-critical", band === "ELEVATED" && "text-band-elevated")} data-testid="brief-adjusted">
                {fmtScore(s.overallDedup ?? s.overall)}
              </div>
              {band && <RiskBandBadge band={band} className="mt-1" />}
            </div>
            <div className="text-sm">
              <div className="text-xs text-muted-foreground">Standard model</div>
              <div className="text-xl font-semibold tabular-nums text-muted-foreground" data-testid="brief-standard">
                {fmtScore(s.overall)}
              </div>
              <div className="text-xs text-muted-foreground">as of {fmtDate(s.scoreDate)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{r.ok ? "This entity has no risk score in the ORACLE X model." : "The risk score is not available right now."}</p>
        )}
      </div>
      <nav aria-label="Brief actions" className="flex flex-wrap gap-2 border-t px-6 py-3">
        <HeaderAction href={`/investigations/${id}`} primary>Investigate</HeaderAction>
        <HeaderAction href={`/evidence?entity=${id}`}>Evidence</HeaderAction>
        <HeaderAction href={`/graph?entity=${id}`}>Network</HeaderAction>
        <HeaderAction href={`/scenarios?entity=${id}`}>Simulate</HeaderAction>
      </nav>
    </header>
  )
}

function HeaderAction({ href, primary, children }: { href: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors",
        primary ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "bg-background hover:bg-accent",
      )}
    >
      {children}
    </Link>
  )
}

/* ------------------------------------------------------- executive finding */

export function ExecutiveFinding({ risk, evidence, blast, trace }: { risk: P<Loaded<RiskSummary | null>>; evidence: P<Loaded<EvidenceOverview>>; blast: P<Loaded<BlastRadius | null>>; trace: P<Loaded<Trace | null>> }) {
  const [r, e, b, t] = [use(risk), use(evidence), use(blast), use(trace)]
  const s = r.ok ? r.value : null
  const bal = e.ok ? e.value.balance : null
  const br = b.ok ? b.value : null
  const tr = t.ok ? t.value : null
  const { finding } = councilSections(tr?.finalResponse)
  const atRisk = br?.metrics.find((m) => m.name === "risk_exposure")
  const tx = br?.metrics.find((m) => m.name === "transactions_affected")
  return (
    <SectionCard id="finding" title="Executive finding" kicker="What is happening, separated by where each statement comes from.">
      <dl className="grid gap-3 md:grid-cols-4" data-testid="finding-glance">
        <Glance label="Observed" kind="FACT">
          {br ? (
            <>
              {fmtCount(br.entities.length)} connected entities{tx && <> · {fmtCount(tx.value)} transactions</>} in the analysis window.
            </>
          ) : (
            "Not available."
          )}
        </Glance>
        <Glance label="Model-derived" kind="MODEL OUTPUT">
          {s ? (
            <>
              {fmtScore(s.overallDedup ?? s.overall)} adjusted risk ({fmtScore(s.overall)} standard){atRisk && <> · {fmtUsd(atRisk.value, { cents: true })} modeled amount at risk</>}.
            </>
          ) : (
            "Not available."
          )}
        </Glance>
        <Glance label="Contradictory" tone="contra">
          {bal ? <>{bal.contradicting} evidence items point against the risk reading.</> : "Not available."}
        </Glance>
        <Glance label="Missing" tone="missing">
          {bal ? <>{bal.missing} evidence items have not been obtained yet.</> : "Not available."}
        </Glance>
      </dl>

      <div className="mt-5 border-t pt-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wide">Stored council finding</span>
          {tr && (
            <span>
              ORACLE council run {tr.runId} · {fmtDate(tr.finishedAt ?? tr.startedAt)}
            </span>
          )}
        </div>
        {finding ? (
          <div className="max-w-3xl text-sm leading-relaxed" data-testid="finding-text">
            <Markdown>{finding.body}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t.ok ? "No completed council finding is stored for this entity." : "The stored council finding is not available right now."}
          </p>
        )}
      </div>
    </SectionCard>
  )
}

function Glance({ label, kind, tone, children }: { label: string; kind?: "FACT" | "MODEL OUTPUT"; tone?: "contra" | "missing"; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border p-3", tone === "contra" && "border-amber-500/40 bg-amber-500/5", tone === "missing" && "border-dashed")}>
      <dt className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label} {kind && <ProvenanceChip kind={kind} />}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  )
}

/* ------------------------------------------------------ why this matters */

export function WhyItMatters({ risk, evidence, entityId }: { risk: P<Loaded<RiskSummary | null>>; evidence: P<Loaded<EvidenceOverview>>; entityId: string }) {
  const [r, e] = [use(risk), use(evidence)]
  const id = encodeURIComponent(entityId)
  const actions = <MoreLink href={`/risk?entity=${id}`}>Risk Intelligence</MoreLink>
  if (!r.ok) return <SectionCard id="why" title="Why this case matters" actions={actions}><Unavailable what="The risk breakdown" /></SectionCard>
  if (!r.value) return <SectionCard id="why" title="Why this case matters" actions={actions}><p className="text-sm text-muted-foreground">This entity has no risk score in the ORACLE X model.</p></SectionCard>
  const claims = e.ok ? e.value.claims : []
  const top = topContributors(r.value.dimensions)
  return (
    <SectionCard id="why" title="Why this case matters" kicker="The strongest contributors to the risk score, and every dimension the adjusted model changed, with the stored explanation behind each." actions={actions}>
      <ul className="divide-y">
        {top.map((d) => {
          const claim = claims.find((c) => c.origin === "ENGINE_DIMENSION" && c.signalType === d.key)
          return (
            <li key={d.key} className="py-3 first:pt-0 last:pb-0" data-testid={`contrib-${d.key}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{d.label}</span>
                <span className="text-sm tabular-nums">
                  score <strong>{fmtScore(d.score, 2)}</strong>
                  {isAdjusted(d) && (
                    <span className="text-indigo-700 dark:text-indigo-300" data-testid={`adjusted-${d.key}`}>
                      {" "}→ {fmtScore(d.scoreDedup, 2)} adjusted
                    </span>
                  )}
                  <span className="text-muted-foreground"> · +{fmtScore(d.contribution, 2)} pts</span>
                </span>
              </div>
              {claim ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">{claim.claim}</p>
                  <div className="mt-1">
                    <WhyPanel claim={claim} entityId={entityId} label="Inspect the evidence (WHY)" />
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No stored explanation for this dimension.</p>
              )}
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

/* -------------------------------------------------------- evidence balance */

export function EvidenceBalanceSection({ evidence, entityId }: { evidence: P<Loaded<EvidenceOverview>>; entityId: string }) {
  const e = use(evidence)
  const id = encodeURIComponent(entityId)
  const actions = <MoreLink href={`/evidence?entity=${id}`}>Evidence + WHY</MoreLink>
  const bal = e.ok ? e.value.balance : null
  if (!e.ok) return <SectionCard id="evidence" title="Evidence balance" actions={actions}><Unavailable what="The evidence balance" /></SectionCard>
  if (!bal) return <SectionCard id="evidence" title="Evidence balance" actions={actions}><p className="text-sm text-muted-foreground">Evidence is not currently available for this entity.</p></SectionCard>
  const items = [
    { key: "supporting", label: "Supporting", value: bal.supporting, cls: "" },
    { key: "contradicting", label: "Contradicting", value: bal.contradicting, cls: "border-amber-500/50 bg-amber-500/10" },
    { key: "neutral", label: "Neutral", value: bal.neutral, cls: "" },
    { key: "missing", label: "Missing", value: bal.missing, cls: "border-dashed" },
  ]
  return (
    <SectionCard id="evidence" title="Evidence balance" kicker={<>Backend posture: <strong className="text-foreground">{bal.posture.toLowerCase()}</strong> · uncertainty {bal.uncertainty.toLowerCase()}</>} actions={actions}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((i) => (
          <div key={i.key} className={cn("rounded-lg border p-4", i.cls)} data-testid={`bal-${i.key}`}>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{i.label}</div>
            <div className={cn("mt-1 text-3xl font-semibold tabular-nums", i.key === "contradicting" && "text-amber-700 dark:text-amber-300")}>{i.value}</div>
          </div>
        ))}
      </div>
      {isMixedEvidence(bal) && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm" data-testid="mixed-note">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          Evidence is mixed — this investigation should not be treated as a simple fraud label.
        </p>
      )}
    </SectionCard>
  )
}

/* ---------------------------------------------------------- risk evolution */

export function RiskEvolution({ timeline, events, entityId }: { timeline: P<Loaded<Timeline | null>>; events: P<Loaded<WarningEvent[]>>; entityId: string }) {
  const [t, ev] = [use(timeline), use(events)]
  const actions = <MoreLink href={`/risk?entity=${encodeURIComponent(entityId)}`}>Time Machine</MoreLink>
  if (!t.ok) return <SectionCard id="evolution" title="Risk evolution" actions={actions}><Unavailable what="The risk history" /></SectionCard>
  if (!t.value || !t.value.points.length) return <SectionCard id="evolution" title="Risk evolution" actions={actions}><p className="text-sm text-muted-foreground">No risk history is available for this entity.</p></SectionCard>
  const { points, abnormalStart, abnormalStartDedup, abnormalBeforeTimelineStart } = t.value
  const evs = ev.ok ? ev.value.slice(0, 4) : []
  return (
    <SectionCard id="evolution" title="Risk evolution" kicker="Standard (v1) and adjusted (v2) scores at each stored snapshot." actions={actions}>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="evolution-points">
        {points.map((p) => {
          const b = asBand(p.bandDedup ?? p.band)
          return (
            <li key={p.date} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                {p.windowLabel ?? fmtDate(p.date)} · {fmtDate(p.date)}
              </div>
              <div className="mt-1 flex items-baseline gap-2 tabular-nums">
                <span className="text-lg font-semibold">{fmtScore(p.overall)}</span>
                {p.overallDedup != null && <span className="text-sm text-indigo-700 dark:text-indigo-300">v2 {fmtScore(p.overallDedup)}</span>}
              </div>
              <div className="mt-1 flex items-center gap-2">
                {b && <RiskBandBadge band={b} />}
                {p.bandChanged && <span className="text-xs font-medium text-amber-700 dark:text-amber-300">band changed</span>}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">
        Pattern start (backend):{" "}
        {abnormalStart ? <strong className="text-foreground">{fmtDate(abnormalStart)}</strong> : "not detected"}
        {abnormalStartDedup && abnormalStartDedup !== abnormalStart && <> · adjusted model {fmtDate(abnormalStartDedup)}</>}
        {abnormalBeforeTimelineStart && <> · began before the first stored snapshot</>}
      </p>
      {evs.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm" data-testid="evolution-events">
          {evs.map((e) => (
            <li key={e.eventId} className="flex gap-2">
              <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{fmtDate(e.detectedAt)}</span>
              <span>{e.headline}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

/* ------------------------------------------------------------ blast radius */

const NETWORK_KEYS = ["customers_affected", "transactions_affected", "devices_affected", "merchants_connected", "direct_accounts", "indirect_accounts"]

export function NetworkSummary({ blast, entityId }: { blast: P<Loaded<BlastRadius | null>>; entityId: string }) {
  const b = use(blast)
  const id = encodeURIComponent(entityId)
  const actions = (
    <>
      <MoreLink href={`/graph?entity=${id}`}>Entity Graph</MoreLink>
      <MoreLink href={`/blast-radius?entity=${id}`}>Blast Radius</MoreLink>
    </>
  )
  if (!b.ok) return <SectionCard id="network" title="Network and blast radius" actions={actions}><Unavailable what="The blast radius" /></SectionCard>
  if (!b.value) return <SectionCard id="network" title="Network and blast radius" actions={actions}><p className="text-sm text-muted-foreground">No blast radius is stored for this entity.</p></SectionCard>
  const br = b.value
  const metric = (k: string) => br.metrics.find((m) => m.name === k)
  const atRisk = metric("risk_exposure")
  const direct = br.entities.filter((e) => e.hop === 1).length
  const indirect = br.entities.filter((e) => e.hop >= 2).length
  return (
    <SectionCard id="network" title="Network and blast radius" kicker={`Window ${fmtDate(br.windowStart)} – ${fmtDate(br.windowEnd)}, up to ${br.maxDepth ?? "—"} steps.`} actions={actions}>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-lg border p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Connected entities</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums" data-testid="net-connected">{fmtCount(br.entities.length)}</div>
          <div className="text-xs text-muted-foreground">
            {direct} direct · {indirect} indirect
          </div>
          {atRisk && (
            <div className="mt-3 border-t pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Modeled amount at risk <ProvenanceChip kind="MODEL OUTPUT" />
              </div>
              <div className="text-xl font-semibold tabular-nums" data-testid="net-at-risk">{fmtUsd(atRisk.value, { cents: true })}</div>
              <div className="text-xs text-muted-foreground">Exposure at risk — not a loss estimate</div>
            </div>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {NETWORK_KEYS.map((k) => {
            const m = metric(k)
            if (!m) return null
            return (
              <div key={k} className="rounded-lg border p-3" data-testid={`net-${k}`}>
                <dt className="text-xs text-muted-foreground">{BLAST_METRIC_META[k]?.label ?? k}</dt>
                <dd className="text-lg font-semibold tabular-nums">{fmtCount(m.value)}</dd>
              </div>
            )
          })}
        </dl>
      </div>
    </SectionCard>
  )
}

/* ------------------------------------------------------- action simulation */

export function ActionSimulation({ scenarios, entityId }: { scenarios: P<Loaded<ScenarioSet | null>>; entityId: string }) {
  const s = use(scenarios)
  const actions = <MoreLink href={`/scenarios?entity=${encodeURIComponent(entityId)}`}>Scenario Simulator</MoreLink>
  const disclaimer = <span className="font-medium text-foreground">Scenario model — not a prediction or certainty.</span>
  if (!s.ok) return <SectionCard id="simulation" title="Action simulation" kicker={disclaimer} actions={actions}><Unavailable what="The stored scenarios" /></SectionCard>
  const set = s.value
  if (!set || !set.scenarios.length) return <SectionCard id="simulation" title="Action simulation" kicker={disclaimer} actions={actions}><p className="text-sm text-muted-foreground">No scenario run is stored for this entity yet.</p></SectionCard>
  const ordered = SCENARIO_ORDER.map((n) => set.scenarios.find((x) => x.name === n)).filter((x): x is NonNullable<typeof x> => !!x)
  return (
    <SectionCard id="simulation" title="Action simulation" kicker={<>{disclaimer} Stored run {fmtDate(set.runAt)}{set.horizonDays != null && <>, {set.horizonDays}-day horizon</>}.</>} actions={actions}>
      <div className="grid gap-3 md:grid-cols-3">
        {ordered.map((sc) => (
          <div key={sc.name} className="rounded-lg border p-4" data-testid={`sim-${sc.name}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold uppercase tracking-wide">{SCENARIO_LABEL[sc.name]?.label ?? sc.name}</span>
              <ProvenanceChip kind="SCENARIO OUTPUT" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{SCENARIO_LABEL[sc.name]?.action}</p>
            {sc.simulatedRiskScore != null && (
              <div className="mt-3 text-sm tabular-nums">
                Simulated risk <strong>{fmtScore(sc.simulatedRiskScore)}</strong>
                {sc.delta != null && <span className="text-muted-foreground"> ({sc.delta > 0 ? "+" : ""}{fmtScore(sc.delta)})</span>}
              </div>
            )}
            <dl className="mt-2 space-y-1 text-sm">
              {headlineScenarioMetrics(sc.metrics).map((m) => (
                <div key={m.key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{m.label}</dt>
                  <dd className="tabular-nums">{m.usd ? fmtUsd(m.value) : fmtCount(m.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

/* --------------------------------------------------------- council status */

export function CouncilStatus({ trace, entityId }: { trace: P<Loaded<Trace | null>>; entityId: string }) {
  const t = use(trace)
  const tr = t.ok ? t.value : null
  const actions = <MoreLink href={`/agent-trace?entity=${encodeURIComponent(entityId)}${tr ? `&run=${encodeURIComponent(tr.runId)}` : ""}`}>View Agent Trace</MoreLink>
  if (!t.ok) return <SectionCard id="council" title="ORACLE investigation status" actions={actions}><Unavailable what="The council record" /></SectionCard>
  if (!tr) return <SectionCard id="council" title="ORACLE investigation status" actions={actions}><p className="text-sm text-muted-foreground">No council run is stored for this entity.</p></SectionCard>
  const stage = (k: string) => tr.stages.find((s) => s.role === k)
  return (
    <SectionCard id="council" title="ORACLE investigation status" kicker={`Latest stored council run ${tr.runId}. No new council is started from this page.`} actions={actions}>
      <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {COUNCIL_STAGES.map((c) => {
          const st = c.key === "ORACLE" ? (tr.status === "COMPLETED" ? "COMPLETED" : tr.status === "FAILED" ? "FAILED" : "WORKING") : stage(c.key)?.status ?? "NOT_RUN"
          return (
            <li key={c.key} className="rounded-lg border p-3" data-testid={`council-${c.key}`}>
              <div className="text-sm font-medium">{c.key === "ORACLE" ? "ORACLE synthesis" : c.label}</div>
              <div className="text-xs text-muted-foreground">{c.role}</div>
              <div className="mt-2">
                <StatusPill status={st} />
              </div>
            </li>
          )
        })}
      </ol>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Technical details</summary>
        <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div>Mode: {tr.mode ?? "—"}</div>
          <div>Total time: {tr.totalSeconds != null ? `${Math.round(tr.totalSeconds)} s` : "—"}</div>
          {tr.stages.map((s) => (
            <div key={s.role}>
              {s.role.toLowerCase().replace(/_/g, " ")}: {s.durationSeconds != null ? `${s.durationSeconds} s` : "—"} · {s.tools.length} tools
            </div>
          ))}
        </dl>
      </details>
    </SectionCard>
  )
}

/* --------------------------------------------------------- next step */

export function NextStep({ risk, evidence, trace, entityId }: { risk: P<Loaded<RiskSummary | null>>; evidence: P<Loaded<EvidenceOverview>>; trace: P<Loaded<Trace | null>>; entityId: string }) {
  const [r, e, t] = [use(risk), use(evidence), use(trace)]
  const bal = e.ok ? e.value.balance : null
  const s = r.ok ? r.value : null
  const { unresolved } = councilSections(t.ok ? t.value?.finalResponse : null)
  const id = encodeURIComponent(entityId)
  const steps = [
    { href: `/evidence?entity=${id}`, label: "Inspect missing evidence", note: bal ? `${bal.missing} items not yet obtained` : null },
    { href: `/evidence?entity=${id}`, label: "Review contradictions", note: bal ? `${bal.contradicting} contradicting items` : null },
    { href: `/graph?entity=${id}`, label: "Inspect network relationships", note: null },
    { href: `/risk?entity=${id}`, label: "Compare historical risk", note: null },
    { href: `/scenarios?entity=${id}`, label: "Run scenario analysis", note: null },
    { href: `/cases?entity=${id}`, label: "Open the case file", note: null },
  ]
  return (
    <SectionCard id="next" title="Decision and next investigation step" kicker="ORACLE does not issue a verdict. Stored guidance is quoted with its source; the steps below lead to the underlying evidence.">
      {s?.bandAction && (
        <div className="mb-4 rounded-lg border p-3 text-sm" data-testid="band-action">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            Band guidance for {(s.bandDedup ?? s.band).toLowerCase()} <ProvenanceChip kind="POLICY" />
          </div>
          {s.bandAction}
          <div className="mt-1 text-xs text-muted-foreground">Source: risk band configuration (INTEL.V_RISK_BAND_CONFIG).</div>
        </div>
      )}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="next-steps">
        {steps.map((st) => (
          <li key={st.label}>
            <Link href={st.href} className="flex h-full items-center justify-between gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-accent">
              <span>
                <span className="font-medium">{st.label}</span>
                {st.note && <span className="block text-xs text-muted-foreground">{st.note}</span>}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {unresolved && (
        <details className="mt-4 text-sm" data-testid="unresolved">
          <summary className="cursor-pointer font-medium">Unresolved questions recorded by the council</summary>
          <div className="mt-2 max-w-3xl text-muted-foreground">
            <Markdown>{unresolved.body}</Markdown>
          </div>
        </details>
      )}
    </SectionCard>
  )
}
