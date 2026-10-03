/**
 * Case Files shapes and pure text parsers (no data access). The council's final report is stored in
 * CASES.COUNCIL_RUNS.FINAL_RESPONSE as markdown with nine "## N. TITLE" sections; section 9 lists its
 * sources under the backend's own provenance labels (**FACT:**, **MODEL OUTPUT:** …). These parsers
 * only split that text — they never reword, score or add to it.
 */
import type { Brief } from "@/lib/brief"
import type { Provenance } from "@/lib/risk-style"

export interface CouncilCaseSummary {
  kind: "council"
  id: string
  entityId: string
  mode: string | null
  status: string
  startedAt: string | null
  totalSeconds: number | null
  specialistsOk: number | null
  specialistsFailed: number | null
  title: string | null
}

export interface CaseFileSummary {
  kind: "file"
  id: string
  caseId: string | null
  subjectId: string | null
  title: string | null
  generatedAt: string | null
  status: string | null
  version: number | null
  recommendation: string | null
  completenessPct: number | null
}

export interface CaseList {
  entityId: string | null
  council: CouncilCaseSummary[]
  files: CaseFileSummary[]
}

export interface CouncilCase extends CouncilCaseSummary {
  entityName: string | null
  question: string | null
  finishedAt: string | null
  finalResponse: string | null
}

export interface BriefSummary {
  role: string
  status: string | null
  durationSeconds: number | null
  tools: string[]
  brief: Brief | null
}

export interface CaseFileEvidence {
  evidenceId: string
  type: string | null
  stance: string | null
  description: string | null
  source: string | null
  confidence: number | null
  verified: boolean | null
  collectedAt: string | null
  collectedBy: string | null
}

export interface CaseFileContradiction {
  id: string
  claim: string | null
  counterClaim: string | null
  resolution: string | null
  status: string | null
  raisedBy: string | null
  resolvedAt: string | null
}

export interface CaseFile extends CaseFileSummary {
  generatedBy: string | null
  executiveSummary: string | null
  narrative: string | null
  subjectName: string | null
  typology: string | null
  outcome: string | null
  openedAt: string | null
  closedAt: string | null
  leadAnalyst: string | null
  keyIndicators: string | null
  decidingFactors: string | null
  evidence: CaseFileEvidence[]
  contradictions: CaseFileContradiction[]
}

export interface ReportSection {
  number: number
  title: string
  body: string
}

export interface ParsedReport {
  title: string | null
  preamble: string
  sections: ReportSection[]
}

/** The nine sections the ORACLE orchestrator is specified to write, in order. */
export const EXPECTED_SECTIONS = [
  "Council run",
  "Investigator findings",
  "Risk analysis",
  "Compliance analysis",
  "Skeptic challenges",
  "Scenario comparison",
  "Unresolved questions",
  "Final evidence-grounded finding",
  "Sources",
] as const

/** Splits the stored markdown on its "## N. Title" headings. Text before the first section is kept as preamble. */
export function parseReport(md: string | null | undefined): ParsedReport {
  if (!md) return { title: null, preamble: "", sections: [] }
  const lines = md.split(/\r?\n/)
  let title: string | null = null
  const pre: string[] = []
  const sections: ReportSection[] = []
  for (const line of lines) {
    const h = line.match(/^##\s+(\d{1,2})\.\s+(.+?)\s*$/)
    if (h) {
      sections.push({ number: Number(h[1]), title: h[2], body: "" })
      continue
    }
    if (!sections.length) {
      const t = line.match(/^#\s+(.+?)\s*$/)
      if (t && title == null) title = t[1]
      else pre.push(line)
      continue
    }
    const cur = sections[sections.length - 1]
    cur.body += (cur.body ? "\n" : "") + line
  }
  for (const s of sections) s.body = s.body.trim()
  return { title, preamble: pre.join("\n").trim(), sections }
}

const SOURCE_LABELS: { re: RegExp; kind: Provenance }[] = [
  { re: /^FACTS?$/i, kind: "FACT" },
  { re: /^MODEL(\s+OUTPUTS?)?$/i, kind: "MODEL OUTPUT" },
  { re: /^NARRATIVE(\s+EVIDENCE)?$/i, kind: "NARRATIVE EVIDENCE" },
  { re: /^POLIC(Y|IES)$/i, kind: "POLICY" },
  { re: /^SCENARIO(\s+OUTPUTS?)?$/i, kind: "SCENARIO OUTPUT" },
]

export interface SourceGroup {
  kind: Provenance | null
  label: string
  items: string[]
}

/**
 * Groups section 9 ("Sources") by the provenance label the backend wrote at the start of each line,
 * e.g. "- **FACT:** RAW.TRANSACTIONS …; RAW.DEVICES …". Lines without a known label are kept under
 * their own label (or "Other"), never re-classified.
 */
export function parseSources(body: string | null | undefined): SourceGroup[] {
  if (!body) return []
  const groups: SourceGroup[] = []
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/^\s*[-*•]\s*/, "").trim()
    if (!line) continue
    const m = line.match(/^\*{0,2}([A-Za-z][A-Za-z ]{1,40}?)\s*:\*{0,2}\s*(.*)$/)
    const kind = m ? (SOURCE_LABELS.find((l) => l.re.test(m[1].trim()))?.kind ?? null) : null
    if (m && kind) {
      groups.push({ kind, label: kind, items: splitItems(m[2]) })
      continue
    }
    if (groups.length) groups[groups.length - 1].items.push(...splitItems(line))
    else groups.push({ kind: null, label: "Other", items: splitItems(line) })
  }
  return groups.filter((g) => g.items.length)
}

/** Splits "a; b (x; y); c" on top-level "; " only, so parenthesised notes stay with their item. */
function splitItems(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "(") depth++
    else if (ch === ")") depth = Math.max(0, depth - 1)
    if (ch === ";" && depth === 0 && /\s/.test(s[i + 1] ?? "")) {
      out.push(cur)
      cur = ""
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

export const CASE_FILE_ID_RE = /^CF-[A-Za-z0-9-]{3,40}$/
export const COUNCIL_RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
