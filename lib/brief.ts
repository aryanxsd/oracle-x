/**
 * Parses the "=== COUNCIL BRIEF ===" block each ORACLE X specialist writes at the top of its answer
 * (format defined in the frozen agent specs) into its five sections for display.
 * Pure text restructuring — no interpretation, scoring or summarisation.
 */

export interface Brief {
  conclusions: string[]
  supporting: string[]
  contradictions: string[]
  missing: string[]
  sources: string[]
}

const SECTIONS: { key: keyof Brief; re: RegExp }[] = [
  { key: "conclusions", re: /^CONCLUSIONS?\b/i },
  { key: "supporting", re: /^SUPPORTING(\s+EVIDENCE)?\b/i },
  { key: "contradictions", re: /^CONTRADICT(IONS|ING(\s+EVIDENCE)?)\b/i },
  { key: "missing", re: /^MISSING(\s+EVIDENCE)?\b/i },
  { key: "sources", re: /^SOURCES?\b/i },
]

const clean = (s: string) => s.replace(/^[\s>*#•\-–]+/, "").replace(/\*\*/g, "").trim()

export function parseBrief(answer: string | null | undefined): Brief | null {
  if (!answer) return null
  const m = answer.match(/=== COUNCIL BRIEF ===([\s\S]*?)(=== END BRIEF ===|$)/)
  if (!m) return null
  const out: Brief = { conclusions: [], supporting: [], contradictions: [], missing: [], sources: [] }
  let current: keyof Brief | null = null
  for (const raw of m[1].split(/\r?\n/)) {
    const line = clean(raw)
    if (!line) continue
    const hit = SECTIONS.find((s) => s.re.test(line))
    if (hit) {
      current = hit.key
      const rest = clean(line.replace(/^[^:]*:/, ""))
      if (line.includes(":") && rest) out[current].push(...splitInline(rest))
      continue
    }
    if (current) out[current].push(line)
  }
  return out
}

/** Sources are often written on one line separated by commas/semicolons. */
function splitInline(s: string): string[] {
  return s.length > 160 && /[;]/.test(s) ? s.split(/;\s*/).map((x) => x.trim()).filter(Boolean) : [s]
}
