// @vitest-environment jsdom
import fs from "fs"
import path from "path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

vi.mock("server-only", () => ({}))

import { WhyPanel } from "../../components/investigation/why-panel"
import { DimensionClaims, EvidenceByKind, EvidenceCompleteness, SignalEvidence } from "../../components/investigation/evidence-panels"
import { DimensionBreakdown } from "../../components/investigation/dimension-breakdown"
import { refEntityIds, refProvenance, type EvidenceBalance, type EvidenceClaim } from "../../lib/evidence-types"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const BAL: EvidenceBalance = { supporting: 14, contradicting: 18, neutral: 2, missing: 8, supportingWeight: 5.8, contradictingWeight: 7.4, netPosition: -0.122, posture: "CONTESTED", uncertainty: "HIGH" }

const claim = (over: Partial<EvidenceClaim> = {}): EvidenceClaim => ({
  claimId: "SIG-M044-04", origin: "SEEDED_SIGNAL", signalType: "DEVICE_CLUSTERING", claim: "Shared device cluster", observed: 9, baseline: 1, unit: "customers",
  calculation: "Max customers per device 14d = 9 (backend text)", policyReference: "SFCA-AML-04-4.1; SFCA-AML-04-4.2", documentReference: "SFCA-AML-04-4.1 \"Device sharing\": policy text from backend",
  supporting: "RAW.DEVICE_EVENTS:D2750; RAW.ANALYST_NOTES:N-M044-07", contradicting: "RAW.KYC_RECORDS:KM044-2026A; SFCA-AML-08-8.2", missing: "Identity of end-users",
  sourceTables: "RAW.DEVICE_EVENTS", sourceRecordIds: "RAW.DEVICE_EVENTS:D2750", sourceRecordCount: 12, detectedAt: "2026-09-24T08:00:00Z", status: "ACTIVE", severity: "HIGH", score: 80, ...over,
})

describe("evidence completeness", () => {
  it("shows backend counts, posture and the escalation caveat", () => {
    render(<EvidenceCompleteness balance={BAL} claims={[claim()]} />)
    expect(screen.getByTestId("bal-supporting").textContent).toBe("14")
    expect(screen.getByTestId("bal-contradicting").textContent).toBe("18")
    expect(screen.getByTestId("bal-missing").textContent).toBe("8")
    const t = screen.getByTestId("evidence-completeness").textContent!
    expect(t).toMatch(/Contested/)
    expect(t).toMatch(/Uncertainty is high/)
    expect(t).toContain("More evidence is needed before escalation.")
    expect(t).toMatch(/not a finding of fraud/)
    expect(t).not.toMatch(/%/)
  })
  it("no caveat when the backend reports low uncertainty and a directional posture", () => {
    render(<EvidenceCompleteness balance={{ ...BAL, uncertainty: "LOW", posture: "LEANS_TOWARD_SUSPICION", missing: 0 }} claims={[]} />)
    expect(screen.queryByText("More evidence is needed before escalation.")).toBeNull()
  })
  it("empty balance", () => {
    render(<EvidenceCompleteness balance={null} claims={[]} />)
    expect(screen.getByText(/No evidence balance/)).toBeTruthy()
  })
})

describe("risk signals", () => {
  it("are collapsed by default and show status, severity and for/against/missing", () => {
    render(<SignalEvidence claims={[claim()]} entityId="M044" />)
    const s = screen.getByTestId("signal-SIG-M044-04") as HTMLDetailsElement
    expect(s.open).toBe(false)
    const head = s.querySelector("summary")!.textContent!
    expect(head).toMatch(/Active/)
    expect(head).toMatch(/High/)
    expect(head).toMatch(/2 for/)
    expect(head).toMatch(/2 against/)
    expect(head).toMatch(/1 missing/)
  })
  it("opens the requested claim (deep link from WHY elsewhere)", () => {
    render(<SignalEvidence claims={[claim()]} entityId="M044" openClaim="SIG-M044-04" />)
    expect((screen.getByTestId("signal-SIG-M044-04") as HTMLDetailsElement).open).toBe(true)
  })
  it("contradicting evidence is tagged with backend-stated provenance and links to the graph", () => {
    render(<SignalEvidence claims={[claim()]} entityId="M044" />)
    const s = screen.getByTestId("signal-SIG-M044-04")
    expect(s.textContent).toContain("Contradicts it")
    expect(s.textContent).toContain("RAW.KYC_RECORDS:KM044-2026A")
    const link = within(s).getAllByRole("link").find((a) => a.textContent === "D2750")!
    expect(link.getAttribute("href")).toBe("/graph?entity=M044&mode=paths&hops=2&through=D2750")
  })
  it("empty signals", () => {
    render(<SignalEvidence claims={[claim({ origin: "ENGINE_DIMENSION" })]} />)
    expect(screen.getByText(/No risk signals/)).toBeTruthy()
  })
})

describe("for / against / missing lists", () => {
  const claims = [claim(), claim({ claimId: "SIG-M044-01", claim: "Near-threshold", supporting: "RAW.TRANSACTIONS:T1", contradicting: null, missing: "Source of funds" })]
  it("supporting", () => {
    render(<EvidenceByKind claims={claims} kind="supporting" entityId="M044" />)
    expect(screen.getByTestId("list-supporting-count").textContent).toBe("3 references on 2 claims")
  })
  it("contradicting names the claim challenged", () => {
    render(<EvidenceByKind claims={claims} kind="contradicting" entityId="M044" />)
    const l = screen.getByTestId("list-contradicting")
    expect(screen.getByTestId("list-contradicting-count").textContent).toBe("2 references on 1 claims")
    expect(l.textContent).toMatch(/Challenges: Shared device cluster/)
  })
  it("missing names the affected claim and shows only the backend description", () => {
    render(<EvidenceByKind claims={claims} kind="missing" entityId="M044" />)
    const l = screen.getByTestId("list-missing").textContent!
    expect(l).toMatch(/Identity of end-users.*Affects: Shared device cluster/)
    expect(l).toMatch(/Source of funds.*Affects: Near-threshold/)
  })
})

describe("WHY inspector", () => {
  it("renders Claim → Data → Calculation → Policy → Source in order with provenance per layer", () => {
    render(<WhyPanel claim={claim()} entityId="M044" />)
    const steps = [...document.querySelectorAll("[data-step]")]
    expect(steps.map((s) => s.getAttribute("data-step"))).toEqual(["Claim", "Data", "Calculation", "Policy", "Source"])
    expect(steps.map((s) => s.querySelector("[title]")!.getAttribute("title")!.split(":")[0])).toEqual(["MODEL OUTPUT", "FACT", "MODEL OUTPUT", "POLICY", "FACT"])
    expect(steps[2].textContent).toContain("Max customers per device 14d = 9 (backend text)")
    expect(steps[3].textContent).toContain("policy text from backend")
    expect(steps[4].textContent).toContain("RAW.DEVICE_EVENTS:D2750")
  })

  it("opening WHY lazily loads source records from /api/evidence", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ claimId: "SIG-M044-04", records: [{ sourceTable: "RAW.ANALYST_NOTES", sourceRecordId: "N-M044-07", supporting: null, counter: "legit", missing: null }], rowsMatching: 1, rowsReturned: 1, source: null, provenance: null }), { status: 200 }),
    )
    render(<WhyPanel claim={claim()} entityId="M044" />)
    expect(f).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Show the individual source records/ }))
    await waitFor(() => expect(screen.getByTestId("source-records")).toBeTruthy())
    expect(f).toHaveBeenCalledWith("/api/evidence?entity=M044&claim=SIG-M044-04")
    expect(screen.getByTestId("source-records").textContent).toMatch(/Narrative.*N-M044-07/)
  })

  it("shows a retry when loading source records fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }))
    render(<WhyPanel claim={claim({ claimId: "SIG-ERR-1" })} entityId="M044" />)
    fireEvent.click(screen.getByRole("button", { name: /Show the individual source records/ }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Couldn’t load/))
  })

  it("renders backend text as text, never as HTML", () => {
    render(<WhyPanel claim={claim({ claim: '<img src=x onerror="alert(1)"><script>alert(1)</script>', calculation: "<b>x</b>" })} />)
    expect(document.querySelector("img")).toBeNull()
    expect(document.querySelector("script")).toBeNull()
    expect(document.querySelector("b")).toBeNull()
    expect(document.body.textContent).toContain("<script>alert(1)</script>")
  })
})

describe("provenance helpers follow the backend's stated mapping", () => {
  it("policy / narrative / fact", () => {
    expect(refProvenance("SFCA-AML-08-8.2")).toBe("POLICY")
    expect(refProvenance("RAW.ANALYST_NOTES:N-M044-06")).toBe("NARRATIVE EVIDENCE")
    expect(refProvenance("RAW.WIRE_TRANSFERS:WM044-011")).toBe("FACT")
  })
  it("extracts related entities but not the subject or record ids", () => {
    expect(refEntityIds("D2999 previously operated by M187; WM044-011; TM044-S*", "M044")).toEqual(["D2999", "M187"])
  })
})

describe("investigation WHY integration", () => {
  const RISK = { scoreDate: null, overall: 1, band: "NORMAL", bandAction: null, overallDedup: null, bandDedup: null, dedupAdjustment: null, explanation: "", dedupExplanation: null, bindingComponent: null,
    dimensions: [{ key: "DEVICE_CLUSTERING", label: "Device clustering", weight: 0.15, score: 76.5, contribution: 11.47, scoreDedup: null, dedupRule: null, dedupApplied: false, formula: null, policyReference: null }] }
  it("risk dimension WHY on the investigation page is the same inspector with lazy source records", () => {
    render(<DimensionBreakdown risk={RISK} claims={[claim({ origin: "ENGINE_DIMENSION", claimId: "M044@d:DEVICE_CLUSTERING" })]} bands={[]} entityId="M044" />)
    expect(screen.getByTestId("why-M044@d:DEVICE_CLUSTERING")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Show the individual source records/ })).toBeTruthy()
  })
  it("dimension claims list on the Evidence page uses the same inspector", () => {
    render(<DimensionClaims claims={[claim({ origin: "ENGINE_DIMENSION", claimId: "M044@d:DEVICE_CLUSTERING" })]} entityId="M044" />)
    expect(screen.getByTestId("why-M044@d:DEVICE_CLUSTERING")).toBeTruthy()
  })
  it("both pages use the one server evidence layer and the one WHY component", () => {
    const ROOT = path.resolve(__dirname, "../..")
    const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8")
    for (const f of ["app/evidence/page.tsx", "app/investigations/[entityId]/page.tsx"]) expect(read(f), f).toMatch(/getEvidenceOverview/)
    const whyDefs = ["components", "app"].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => /export function WhyPanel/.test(fs.readFileSync(f, "utf8")))
    expect(whyDefs.map((f) => path.relative(ROOT, f))).toEqual([path.join("components", "investigation", "why-panel.tsx")])
  })
  it("client evidence components contain no SQL", () => {
    const ROOT = path.resolve(__dirname, "../..")
    for (const f of ["components/investigation/why-panel.tsx", "components/investigation/evidence-panels.tsx", "lib/evidence-types.ts"]) {
      expect(fs.readFileSync(path.join(ROOT, f), "utf8"), f).not.toMatch(/\bSELECT\b[\s\S]{0,200}\bFROM\b|\bCALL\s+ORACLE_X/i)
    }
  })
})

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : []
  })
}
