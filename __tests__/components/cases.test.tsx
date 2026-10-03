// @vitest-environment jsdom
import fs from "fs"
import path from "path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

vi.mock("server-only", () => ({}))

import { BriefList, CaseFileView, CouncilReport } from "../../components/cases/report"
import { parseReport, type CaseFile } from "../../lib/case-types"

afterEach(cleanup)

const md = (extra = "") =>
  [
    "# Test report",
    ...["COUNCIL RUN", "INVESTIGATOR FINDINGS", "RISK ANALYSIS", "COMPLIANCE ANALYSIS", "SKEPTIC CHALLENGES", "SCENARIO COMPARISON", "UNRESOLVED QUESTIONS", "FINAL EVIDENCE-GROUNDED FINDING"].flatMap((t, i) => [`## ${i + 1}. ${t}`, `Body ${i + 1} (test)${i === 7 ? extra : ""}`]),
    "## 9. SOURCES",
    "- **FACT:** RAW.A 1",
    "- **MODEL OUTPUT:** INTEL.B",
    "- **NARRATIVE EVIDENCE:** RAW.ANALYST_NOTES N-1",
    "- **POLICY:** SFCA-X",
    "- **SCENARIO OUTPUT:** CASES.SCENARIO_RUNS S-1",
  ].join("\n")

describe("council report", () => {
  it("renders all nine sections with a table of contents", () => {
    render(<CouncilReport report={parseReport(md())} />)
    for (let i = 1; i <= 9; i++) expect(screen.getByTestId(`section-${i}`)).toBeTruthy()
    expect(within(screen.getByTestId("report-toc")).getAllByRole("link")).toHaveLength(9)
    expect(screen.getByTestId("section-8").textContent).toContain("Body 8 (test)")
  })
  it("groups section 9 by Fact / Model / Narrative / Policy / Scenario", () => {
    render(<CouncilReport report={parseReport(md())} />)
    for (const k of ["FACT", "MODEL OUTPUT", "NARRATIVE EVIDENCE", "POLICY", "SCENARIO OUTPUT"]) expect(screen.getByTestId(`sources-${k}`)).toBeTruthy()
    expect(screen.getByTestId("sources-NARRATIVE EVIDENCE").textContent).toContain("N-1")
  })
  it("reports missing sections rather than inventing them", () => {
    const partial = parseReport("## 1. COUNCIL RUN\nx\n## 9. SOURCES\n- **FACT:** y")
    render(<CouncilReport report={partial} />)
    expect(screen.getByTestId("report-toc").textContent).toMatch(/Not present in this report: Investigator findings/)
  })
  it("never renders stored HTML", () => {
    render(<CouncilReport report={parseReport(md('<script>alert(1)</script><img src=x onerror="alert(1)">'))} />)
    expect(document.querySelector("script")).toBeNull()
    expect(document.querySelector("img")).toBeNull()
  })
})

describe("briefs and historical case files", () => {
  it("briefs render parsed sections in council order", () => {
    render(
      <BriefList
        briefs={[
          { role: "SKEPTIC", status: "OK", durationSeconds: 60, tools: ["get_evidence"], brief: { conclusions: ["skeptic says (test)"], supporting: [], contradictions: ["c"], missing: [], sources: [] } },
          { role: "INVESTIGATOR", status: "OK", durationSeconds: 30, tools: [], brief: null },
        ]}
      />,
    )
    const ids = [...screen.getByTestId("brief-list").querySelectorAll("[data-testid^=brief-]")].map((e) => e.getAttribute("data-testid"))
    expect(ids).toEqual(["brief-INVESTIGATOR", "brief-SKEPTIC"])
    expect(screen.getByTestId("brief-SKEPTIC").textContent).toContain("skeptic says (test)")
    expect(screen.getByTestId("brief-INVESTIGATOR").textContent).toMatch(/did not write a structured brief/)
  })
  it("historical case file shows backend fields and says 'Not recorded' for missing ones", () => {
    const f: CaseFile = {
      kind: "file", id: "CF-T-v1", caseId: "CASE-T", subjectId: "M900", title: "T", generatedAt: "2025-01-01", status: "FINAL", version: 1, recommendation: null, completenessPct: 60,
      generatedBy: "HISTORICAL_ANALYST", executiveSummary: "Summary (test)", narrative: null, subjectName: "Past Co", typology: "X", outcome: "SAR_FILED", openedAt: null, closedAt: null,
      leadAnalyst: null, keyIndicators: "k", decidingFactors: null,
      evidence: [{ evidenceId: "EV-1", type: "DEVICE_LINK", stance: "CONTRADICTS", description: "d (test)", source: "RAW.X:1", confidence: 0.5, verified: false, collectedAt: null, collectedBy: null }],
      contradictions: [],
    }
    render(<CaseFileView f={f} />)
    const t = screen.getByTestId("case-file").textContent!
    expect(t).toContain("Summary (test)")
    expect(t).toContain("60%")
    expect(t).toContain("Suspicious activity report filed")
    expect(t).toMatch(/Not recorded/)
    expect(screen.getByTestId("file-evidence").textContent).toMatch(/Contradicted suspicion.*d \(test\).*RAW\.X:1/)
  })
})

describe("source scans", () => {
  const ROOT = path.resolve(__dirname, "../..")
  const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8")
  const files = ["components/cases/report.tsx", "components/cases/print-button.tsx", "lib/case-types.ts", "app/cases/page.tsx", "app/cases/[id]/page.tsx", "lib/server/cases.ts", "app/api/cases/route.ts", "app/api/cases/[id]/route.ts"]
  it("no hardcoded M044 report content and no council/evaluator calls", () => {
    for (const f of files) {
      const src = read(f)
      expect(src, f).not.toMatch(/66\.68|55\.56|805229|Harborview|UI-M044-|CASE-20\d\d-\d{3}/)
      expect(src, f).not.toMatch(/SP_RUN_COUNCIL|SP_EVALUATE_RUN|startCouncil/)
    }
  })
  it("client components contain no SQL or server imports", () => {
    const src = read("components/cases/print-button.tsx")
    expect(src).not.toMatch(/SELECT|@\/lib\/server/)
  })
  it("investigation page links to the case file", () => {
    expect(read("app/investigations/[entityId]/page.tsx")).toMatch(/Open case file/)
  })
})
