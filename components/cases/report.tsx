import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { Markdown } from "@/components/oracle/markdown"
import { EXPECTED_SECTIONS, parseSources, type BriefSummary, type CaseFile, type ParsedReport } from "@/lib/case-types"
import { COUNCIL_STAGES, PROVENANCE_STYLE } from "@/lib/risk-style"
import { fmtDate, humanize, splitRefs } from "@/lib/format"
import { cn } from "@/lib/utils"

/** The council's stored nine-section report, rendered section by section; section 9 grouped by provenance. */
export function CouncilReport({ report }: { report: ParsedReport }) {
  if (!report.sections.length) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="mb-3 text-xs text-muted-foreground">This report does not use the standard nine-section layout; it is shown as stored.</p>
          <Markdown>{report.preamble}</Markdown>
        </CardContent>
      </Card>
    )
  }
  const missing = EXPECTED_SECTIONS.filter((_, i) => !report.sections.some((s) => s.number === i + 1))
  return (
    <div className="space-y-4">
      <nav aria-label="Report sections" className="rounded-xl border p-4 text-sm print:hidden" data-testid="report-toc">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">In this report</div>
        <ol className="grid gap-1 sm:grid-cols-3">
          {report.sections.map((s) => (
            <li key={s.number}>
              <a href={`#section-${s.number}`} className="text-primary hover:underline">
                {s.number}. {s.title}
              </a>
            </li>
          ))}
        </ol>
        {missing.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Not present in this report: {missing.join(", ")}.</p>}
      </nav>
      {report.preamble && (
        <Card>
          <CardContent className="p-5">
            <Markdown>{report.preamble}</Markdown>
          </CardContent>
        </Card>
      )}
      {report.sections.map((s) => (
        <section key={s.number} id={`section-${s.number}`} className="scroll-mt-24 break-inside-avoid-page" data-testid={`section-${s.number}`}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {s.number}. {s.title}
              </CardTitle>
            </CardHeader>
            <CardContent>{s.number === 9 || /^sources?$/i.test(s.title) ? <SourceGroups body={s.body} /> : <Markdown>{s.body || "_Empty section._"}</Markdown>}</CardContent>
          </Card>
        </section>
      ))}
    </div>
  )
}

/** Section 9, grouped by the provenance label ORACLE wrote on each line (never re-classified). */
export function SourceGroups({ body }: { body: string }) {
  const groups = parseSources(body)
  if (!groups.length) return <Markdown>{body || "_No sources listed._"}</Markdown>
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="source-groups">
      {groups.map((g, i) => (
        <div key={`${g.label}-${i}`} className="rounded-lg border p-3" data-testid={`sources-${g.kind ?? "OTHER"}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {g.kind ? <ProvenanceChip kind={g.kind} /> : <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{g.label}</span>}
            {g.kind ? PROVENANCE_STYLE[g.kind].help : "Listed without a provenance label"}
          </div>
          <ul className="mt-2 space-y-1 text-xs">
            {g.items.map((it, j) => (
              <li key={j} className="break-words">
                <Markdown>{it}</Markdown>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

const ROLE_LABEL = Object.fromEntries(COUNCIL_STAGES.map((s) => [s.key, s.label])) as Record<string, string>
const ROLE_ORDER: string[] = COUNCIL_STAGES.map((s) => s.key)

/** Specialist briefs from CASES.COUNCIL_TRANSCRIPTS (parsed "COUNCIL BRIEF" blocks). */
export function BriefList({ briefs }: { briefs: BriefSummary[] }) {
  if (!briefs.length) return <p className="text-sm text-muted-foreground">No specialist briefs are recorded for this run.</p>
  const sorted = [...briefs].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="brief-list">
      {sorted.map((b) => (
        <details key={b.role} className="group rounded-xl border p-4" data-testid={`brief-${b.role}`}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{ROLE_LABEL[b.role] ?? humanize(b.role)}</span>
            <span className="text-xs text-muted-foreground">
              {humanize(b.status)}
              {b.durationSeconds != null && <> · {b.durationSeconds}s</>}
              {b.tools.length > 0 && <> · {b.tools.length} tools</>}
            </span>
          </summary>
          {b.brief ? (
            <dl className="mt-3 space-y-2 text-sm">
              <BriefPart title="Conclusions" items={b.brief.conclusions} />
              <BriefPart title="Supporting evidence" items={b.brief.supporting} />
              <BriefPart title="Contradictions" items={b.brief.contradictions} />
              <BriefPart title="Missing evidence" items={b.brief.missing} />
              <BriefPart title="Sources" items={b.brief.sources} mono />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">This specialist did not write a structured brief.</p>
          )}
          {b.tools.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Tools used: {b.tools.map(humanize).join(", ")}</p>}
        </details>
      ))}
    </div>
  )
}

function BriefPart({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
  if (!items.length) return null
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</dt>
      <dd>
        <ul className={cn("mt-0.5 list-disc space-y-0.5 pl-4", mono && "text-xs")}>
          {items.map((i, k) => (
            <li key={k}>{i}</li>
          ))}
        </ul>
      </dd>
    </div>
  )
}

const OUTCOME_TEXT: Record<string, string> = {
  SAR_FILED: "Suspicious activity report filed",
  CLOSED_LEGITIMATE: "Closed — legitimate",
  CLOSED_INSUFFICIENT_EVIDENCE: "Closed — insufficient evidence",
  CLOSED_CONFIRMED_FRAUD: "Closed — confirmed fraud",
}

/** A historical case file from CASES.CASE_FILES with its investigation, evidence and contradictions. */
export function CaseFileView({ f }: { f: CaseFile }) {
  return (
    <div className="space-y-4" data-testid="case-file">
      <Card>
        <CardContent className="grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Case">{f.caseId ?? "—"}</Field>
          <Field label="Outcome (historical)">{f.outcome ? (OUTCOME_TEXT[f.outcome] ?? humanize(f.outcome)) : "—"}</Field>
          <Field label="Opened / closed">
            {fmtDate(f.openedAt)} – {fmtDate(f.closedAt)}
          </Field>
          <Field label="Evidence completeness (recorded)">{f.completenessPct != null ? `${f.completenessPct}%` : "—"}</Field>
          <Field label="Typology">{humanize(f.typology)}</Field>
          <Field label="Lead analyst">{f.leadAnalyst ?? "—"}</Field>
          <Field label="Written by">
            {f.generatedBy ?? "—"} · {fmtDate(f.generatedAt)}
          </Field>
          <Field label="File status">
            {humanize(f.status)}
            {f.version != null && <> · v{f.version}</>}
          </Field>
        </CardContent>
      </Card>
      <ReportBlock title="Executive summary" kind="NARRATIVE EVIDENCE" text={f.executiveSummary} />
      <ReportBlock title="Narrative" kind="NARRATIVE EVIDENCE" text={f.narrative} />
      <ReportBlock title="Recommendation recorded at the time" kind="NARRATIVE EVIDENCE" text={f.recommendation} />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            Investigation record <ProvenanceChip kind="FACT" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {f.keyIndicators && <Field label="Key indicators">{f.keyIndicators}</Field>}
          {f.decidingFactors && <Field label="Deciding factors">{f.decidingFactors}</Field>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evidence recorded ({f.evidence.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {f.evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">No evidence items are recorded for this case.</p>
          ) : (
            <ul className="space-y-2 text-sm" data-testid="file-evidence">
              {f.evidence.map((e) => (
                <li key={e.evidenceId} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn("rounded-full px-2 py-0.5", e.stance === "SUPPORTS" ? "bg-band-elevated/12 text-band-elevated" : e.stance === "CONTRADICTS" ? "bg-band-normal/12 text-band-normal" : "bg-muted")}>
                      {e.stance === "SUPPORTS" ? "Supported suspicion" : e.stance === "CONTRADICTS" ? "Contradicted suspicion" : humanize(e.stance)}
                    </span>
                    <span className="text-muted-foreground">{humanize(e.type)}</span>
                    {e.verified != null && <span className="text-muted-foreground">{e.verified ? "verified" : "unverified"}</span>}
                    {e.confidence != null && <span className="text-muted-foreground">confidence {e.confidence}</span>}
                    <span className="text-muted-foreground">
                      {fmtDate(e.collectedAt)}
                      {e.collectedBy && <> · {e.collectedBy}</>}
                    </span>
                  </div>
                  {e.description && <p className="mt-1">{e.description}</p>}
                  {e.source && (
                    <p className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
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
          )}
        </CardContent>
      </Card>
      {f.contradictions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contradictions raised ({f.contradictions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm" data-testid="file-contradictions">
              {f.contradictions.map((c) => (
                <li key={c.id} className="rounded-lg border-l-4 border-band-normal bg-band-normal/5 p-3">
                  {c.claim && <p><span className="text-muted-foreground">Claim:</span> {c.claim}</p>}
                  {c.counterClaim && <p><span className="text-muted-foreground">Counter-claim:</span> {c.counterClaim}</p>}
                  {c.resolution && <p><span className="text-muted-foreground">Resolution:</span> {c.resolution}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {humanize(c.status)}
                    {c.raisedBy && <> · raised by {c.raisedBy}</>}
                    {c.resolvedAt && <> · {fmtDate(c.resolvedAt)}</>}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ReportBlock({ title, kind, text }: { title: string; kind: Parameters<typeof ProvenanceChip>[0]["kind"]; text: string | null }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {title} <ProvenanceChip kind={kind} />
        </CardTitle>
      </CardHeader>
      <CardContent>{text ? <Markdown>{text}</Markdown> : <p className="text-sm text-muted-foreground">Not recorded.</p>}</CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}
