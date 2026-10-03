// @vitest-environment jsdom
import fs from "fs"
import path from "path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

vi.mock("server-only", () => ({}))
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

import { DnaProfile } from "../../components/dna/dna-profile"
import { DnaInterpretation } from "../../components/dna/dna-interpretation"
import { SimilarCaseList } from "../../components/dna/similar-cases"
import { DNA_DIMENSIONS, type CaseCharacteristics, type DnaSnapshot, type SimilarCases } from "../../lib/dna-types"

afterEach(cleanup)

// Deliberately not M044's real values.
const snap = (asOf: string, v: number[], over: Partial<DnaSnapshot> = {}): DnaSnapshot => ({
  dnaId: `DNA-X-${asOf}`, asOf, source: "COMPUTED_FROM_RAW", relatedCaseId: null,
  dims: { transaction: v[0], velocity: v[1], geographic: v[2], network: v[3], merchant: v[4], historical: v[5], document: v[6] },
  seasonality: 0.25, features: { near_threshold: v[0], velocity: v[1], geo_dispersion: v[2], flagged_device: 0.11, high_risk_counterparty: 0.22, profile_change: v[4], cross_border_burst: v[5] }, ...over,
})
const S1 = snap("2026-01-10", [0.12, 0.34, 0.05, 0.77, 0.66, 0.91, 0.2])
const S0 = snap("2025-12-01", [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.2])
const CLAIMS = [
  { claimId: "SIG-X-01", claim: "Near-threshold claim (test)", signalType: "TRANSACTION_ANOMALY" },
  { claimId: "SIG-X-08", claim: "Network claim (test)", signalType: "NETWORK_RELATIONSHIP_RISK" },
  { claimId: "SIG-X-04", claim: "Device claim (test)", signalType: "DEVICE_CLUSTERING" },
]

describe("Risk DNA profile", () => {
  it("renders every backend dimension with its value", () => {
    render(<DnaProfile entityId="X001" snapshots={[S1, S0]} claims={CLAIMS} />)
    for (const d of DNA_DIMENSIONS) expect(screen.getByTestId(`dna-card-${d.key}`)).toBeTruthy()
    expect(screen.getByTestId("dna-row-historical").textContent).toContain("0.91")
    expect(screen.getByTestId("dna-card-network").textContent).toMatch(/Flagged device 0\.11.*High-risk counterparty 0\.22/)
  })
  it("links WHY to the existing evidence claims, and says so when none exists", () => {
    render(<DnaProfile entityId="X001" snapshots={[S1]} claims={CLAIMS} />)
    const net = within(screen.getByTestId("dna-card-network")).getAllByRole("link").map((a) => a.getAttribute("href"))
    expect(net).toEqual(["/evidence?entity=X001&claim=SIG-X-08#claim-SIG-X-08", "/evidence?entity=X001&claim=SIG-X-04#claim-SIG-X-04"])
    expect(screen.getByTestId("no-why-historical").textContent).toMatch(/no evidence claim/)
    expect(screen.getByTestId("no-why-velocity")).toBeTruthy()
    expect(within(screen.getByTestId("dna-card-document")).getByRole("link").getAttribute("href")).toBe("/evidence?entity=X001")
  })
  it("switches snapshots without refetching", () => {
    const f = vi.spyOn(globalThis, "fetch")
    render(<DnaProfile entityId="X001" snapshots={[S1, S0]} claims={CLAIMS} />)
    fireEvent.click(screen.getByRole("button", { name: "Dec 1, 2025" }))
    expect(screen.getByTestId("dna-row-historical").textContent).toMatch(/^Historical0\.06/)
    expect(f).not.toHaveBeenCalled()
    f.mockRestore()
  })
  it("empty DNA", () => {
    render(<DnaProfile entityId="X001" snapshots={[]} claims={[]} />)
    expect(screen.getByText(/No Risk DNA has been computed/)).toBeTruthy()
  })
})

describe("Risk DNA interpretation", () => {
  const risk = {
    scoreDate: null, overall: 1, band: "WATCH", bandAction: null, overallDedup: 1, bandDedup: "WATCH", dedupAdjustment: 0, explanation: "", dedupExplanation: null, bindingComponent: null,
    dimensions: [
      { key: "NETWORK_RELATIONSHIP_RISK", label: "Network relationships", weight: 0.18, score: 40, contribution: 7, scoreDedup: 20, dedupRule: "R3" as const, dedupApplied: true, formula: null, policyReference: null },
      { key: "ACCOUNT_BEHAVIOR", label: "Account behaviour", weight: 0.12, score: 30, contribution: 3, scoreDedup: 30, dedupRule: "R2" as const, dedupApplied: false, formula: null, policyReference: null },
    ],
  }
  it("ranks only backend values and lists adjusted risk-score dimensions", () => {
    render(<DnaInterpretation entityId="X001" snapshot={S1} risk={risk} balance={{ supporting: 1, contradicting: 2, neutral: 0, missing: 3, supportingWeight: 0, contradictingWeight: 0, netPosition: 0, posture: "CONTESTED", uncertainty: "HIGH" }} />)
    expect(screen.getByTestId("interp-dominant").textContent).toMatch(/Historical 0\.91 · Network 0\.77 · Merchant 0\.66/)
    expect(screen.getByTestId("interp-lower").textContent).toMatch(/Transaction 0\.12 · Geographic 0\.05/)
    expect(screen.getByTestId("interp-adjusted").textContent).toMatch(/Network relationships: 40\.00 standard → 20\.00 adjusted \(rule R3\)/)
    expect(screen.getByTestId("interp-adjusted").textContent).not.toMatch(/Account behaviour/)
    expect(screen.getByTestId("interp-gaps").textContent).toMatch(/3 pieces of evidence missing/)
    expect(screen.getByTestId("dna-interpretation").textContent).toMatch(/not a finding of fraud/)
  })
  it("states when the risk score is unavailable instead of guessing", () => {
    render(<DnaInterpretation entityId="X001" snapshot={S1} risk={null} balance={null} />)
    expect(screen.getByTestId("interp-adjusted").textContent).toMatch(/unavailable/)
    expect(screen.getByTestId("interp-gaps").textContent).toMatch(/No evidence balance/)
  })
})

const flags = (on: string[]) => Object.fromEntries(["HAS_NEAR_THRESHOLD_PATTERN", "HAS_CROSS_BORDER_WIRES", "HAS_GEOGRAPHIC_ANOMALY", "HAS_PROFILE_CHANGE", "HAS_SEASONALITY", "HAS_SHARED_DEVICE", "HAS_HIGH_RISK_COUNTERPARTY", "USES_CORAL_BAY"].map((c) => [c, on.includes(c)]))
const DATA: SimilarCases = {
  entityId: "X001", subjectAsOf: "2026-01-10", subjectDna: S1.dims, methodology: "Cosine similarity (backend test text)",
  cases: [
    { caseId: "CASE-T-1", rank: 1, similarity: 0.8123, interpretationNote: "Profile similarity only (test).", historicalEntityId: "M900", historicalEntityName: "Past Co", outcome: "SAR_FILED", typology: "STRUCTURING", keyIndicators: "Key (test)", decidingFactors: "Deciding (test)", openedAt: "2025-01-01", closedAt: "2025-02-01", summary: "Summary (test)", riskScoreAtOpen: 71,
      dna: S0.dims, dnaAsOf: "2025-01-01",
      evidence: [{ evidenceId: "EV-1", type: "DEVICE_LINK", stance: "SUPPORTS", description: "Shared device (test)", source: "RAW.DEVICES:D1", confidence: 0.9, verified: true, collectedAt: "2025-01-02" }], connectedHop: 1 },
    { caseId: "CASE-T-2", rank: 2, similarity: 0.5, interpretationNote: null, historicalEntityId: "C900", historicalEntityName: null, outcome: "CLOSED_LEGITIMATE", typology: "GEO", keyIndicators: null, decidingFactors: null, openedAt: null, closedAt: null, summary: null, riskScoreAtOpen: null, dna: null, dnaAsOf: null, evidence: [], connectedHop: null },
  ],
}
const CHARS: CaseCharacteristics = {
  subject: flags(["HAS_NEAR_THRESHOLD_PATTERN", "HAS_SHARED_DEVICE", "HAS_SEASONALITY"]),
  byCase: { "CASE-T-1": { flags: flags(["HAS_NEAR_THRESHOLD_PATTERN", "HAS_SHARED_DEVICE", "USES_CORAL_BAY"]), signalTypes: "DEVICE_LINK" } },
}
const renderList = async (chars: Promise<CaseCharacteristics | null> = Promise.resolve(CHARS), data = DATA) => {
  await act(async () => {
    render(<SimilarCaseList data={data} chars={chars} />)
  })
}

describe("Similar investigations", () => {
  it("shows backend similarity exactly, with the interpretation note and methodology", async () => {
    await renderList()
    await screen.findAllByText("In both")
    expect(screen.getByTestId("sim-CASE-T-1").textContent).toBe("0.8123")
    expect(screen.getByTestId("sim-CASE-T-2").textContent).toBe("0.5")
    expect(document.body.textContent).not.toMatch(/81%|81\.2%|50%/)
    expect(screen.getByTestId("similar-answer").textContent).toMatch(/2 historical investigations.*CASE-T-1.*0\.8123/)
    expect(screen.getByTestId("similar-answer").textContent).toContain("Profile similarity only (test).")
    expect(screen.getByTestId("similar-answer").textContent).toContain("Cosine similarity (backend test text)")
  })
  it("Why similar? walks signals → behaviour → relationships → historical case from backend flags", async () => {
    await renderList()
    await screen.findAllByText("In both")
    const sig = screen.getByTestId("step-signals-CASE-T-1").textContent!
    expect(sig).toMatch(/In both\s*Near-threshold transactions/)
    expect(sig).toMatch(/Only today\s*Seasonal business/)
    const rel = screen.getByTestId("step-relationships-CASE-T-1")
    expect(rel.textContent).toMatch(/In both\s*Shared device/)
    expect(rel.textContent).toMatch(/Only in the past case\s*Wires to Coral Bay Trading/)
    expect(within(rel).getByRole("link").getAttribute("href")).toBe("/graph?entity=X001&mode=paths&hops=2&through=M900")
    expect(screen.getByTestId("step-behaviour-CASE-T-1").textContent).toMatch(/Historical.*0\.91.*0\.06/)
    const c = screen.getByTestId("step-case-CASE-T-1").textContent!
    expect(c).toMatch(/Key \(test\).*Deciding \(test\).*Summary \(test\)/)
    expect(screen.getByTestId("case-evidence-CASE-T-1").textContent).toMatch(/Supported suspicion.*Shared device \(test\).*RAW\.DEVICES:D1/)
    expect((screen.getByTestId("why-similar-CASE-T-1") as HTMLDetailsElement).open).toBe(true)
  })
  it("cases render before the slow characteristics arrive", async () => {
    await renderList(new Promise(() => {}))
    expect(screen.getByTestId("sim-CASE-T-1").textContent).toBe("0.8123")
    expect(screen.getAllByText(/Loading matching characteristics/).length).toBeGreaterThan(0)
  })
  it("characteristics failure only blanks the flags", async () => {
    await renderList(Promise.resolve(null))
    expect((await screen.findAllByText(/Matching characteristics are unavailable/)).length).toBeGreaterThan(0)
    expect(screen.getByTestId("step-case-CASE-T-1").textContent).toContain("Key (test)")
  })
  it("says when similarity reasons are unavailable instead of inventing them", async () => {
    await renderList()
    await screen.findAllByText("In both")
    expect(screen.getByTestId("step-signals-CASE-T-2").textContent).toMatch(/no characteristic data/)
    expect(screen.getByTestId("step-behaviour-CASE-T-2").textContent).toMatch(/no Risk DNA/)
    expect(screen.getByTestId("step-case-CASE-T-2").textContent).toMatch(/No evidence items/)
    expect(screen.queryByTestId("connected-CASE-T-2")).toBeNull()
  })
  it("outcomes are context, never a verdict", async () => {
    await renderList()
    await screen.findAllByText("In both")
    expect(screen.getByTestId("case-CASE-T-1").textContent).toMatch(/Historical outcome:.*\(context only\)/)
    expect(document.body.textContent).not.toMatch(/\b(will be|is likely|predicted|fraudulent)\b/i)
  })
  it("empty historical cases", async () => {
    await renderList(undefined, { ...DATA, cases: [] })
    expect(screen.getByText(/found no historical investigations/)).toBeTruthy()
  })
})

describe("source scans", () => {
  const ROOT = path.resolve(__dirname, "../..")
  const files = ["components/dna/dna-profile.tsx", "components/dna/dna-interpretation.tsx", "components/dna/similar-cases.tsx", "components/dna/case-flags.tsx", "lib/dna-types.ts", "app/risk-dna/page.tsx", "app/similar-cases/page.tsx"]
  it("no hardcoded M044 values, similarity maths or SQL in the UI", () => {
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8")
      expect(src, f).not.toMatch(/0\.9566|0\.9238|0\.8894|0\.4401|0\.5663|CASE-20\d\d-\d{3}|\bM156\b|\bM187\b/)
      expect(src, f).not.toMatch(/cosine\s*\(|Math\.sqrt|dotProduct|\.reduce\([^)]*\*/i)
      expect(src, f).not.toMatch(/\bSELECT\b[\s\S]{0,200}\bFROM\b/i)
    }
  })
  it("investigation page links to Risk DNA and Similar Investigations", () => {
    const inv = fs.readFileSync(path.join(ROOT, "app/investigations/[entityId]/page.tsx"), "utf8")
    expect(inv).toContain("/risk-dna?entity=")
    expect(inv).toContain("View Risk DNA")
    expect(inv).toContain("/similar-cases?entity=")
    expect(inv).toContain("Find Similar Investigations")
  })
})
