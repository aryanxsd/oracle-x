// @vitest-environment jsdom
import fs from "fs"
import path from "path"
import { Suspense } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, within } from "@testing-library/react"

vi.mock("server-only", () => ({}))

import {
  ActionSimulation,
  BriefHeader,
  CouncilStatus,
  EvidenceBalanceSection,
  ExecutiveFinding,
  NetworkSummary,
  NextStep,
  RiskEvolution,
  WhyItMatters,
  settled,
  type Loaded,
} from "../../components/brief/decision-brief"
import { councilSections, headlineScenarioMetrics, isMixedEvidence, topContributors } from "../../lib/decision-brief"
import type { RiskSummary, Identity } from "../../lib/server/investigation"
import type { EvidenceOverview } from "../../lib/server/evidence"
import type { BlastRadius, ScenarioSet } from "../../lib/impact-types"
import { fmtUsd } from "../../lib/impact-types"
import type { Trace } from "../../lib/trace-types"

afterEach(cleanup)

const ok = <T,>(value: T): Promise<Loaded<T>> => Promise.resolve({ ok: true as const, value })
const failed = <T,>(): Promise<Loaded<T>> => Promise.resolve({ ok: false as const })

const ID: Identity = { entityId: "X001", type: "MERCHANT", name: "Test Co", staticRiskTier: null, attributes: {}, isInvestigationSubject: true }
const dim = (key: string, label: string, score: number, contribution: number, dedup: number | null = null) => ({
  key, label, weight: 0.1, score, contribution, scoreDedup: dedup, dedupRule: dedup != null ? ("R1" as const) : null, dedupApplied: dedup != null, formula: null, policyReference: null,
})
const RISK: RiskSummary = {
  scoreDate: "2026-01-02", overall: 60.5, band: "ELEVATED", bandAction: "Band guidance (test)", overallDedup: 50.25, bandDedup: "ELEVATED", dedupAdjustment: 10.25,
  explanation: "e", dedupExplanation: "d", bindingComponent: null,
  dimensions: [dim("A_DIM", "Dim A", 40, 4), dim("HISTORICAL_DEVIATION", "History", 70, 9, 8), dim("Z_DIM", "Dim Z", 0, 0), dim("B_DIM", "Dim B", 50, 6)],
}
const BAL = { supporting: 3, contradicting: 5, neutral: 1, missing: 2, supportingWeight: 1, contradictingWeight: 2, netPosition: -1, posture: "CONTESTED", uncertainty: "HIGH" }
const EVIDENCE: EvidenceOverview = {
  balance: BAL,
  claims: [{ claimId: "C-H", origin: "ENGINE_DIMENSION", signalType: "HISTORICAL_DEVIATION", claim: "History claim (test)", observed: null, baseline: null, unit: null, calculation: null, policyReference: null, documentReference: null, supporting: null, contradicting: null, missing: null, sourceTables: null, sourceRecordIds: null, sourceRecordCount: null, detectedAt: null }],
}
const BLAST: BlastRadius = {
  rootId: "X001", computedAt: null, windowStart: "2026-01-01", windowEnd: "2026-01-31", maxDepth: 2, modelVersion: null, entityMethodology: null,
  metrics: [{ name: "risk_exposure", value: 1234.5, methodology: null }, { name: "customers_affected", value: 7, methodology: null }, { name: "transactions_affected", value: 11, methodology: null }],
  entities: [{ id: "C1", type: "CUSTOMER", name: null, hop: 1, path: null, exposureUsd: null, impactScore: null }, { id: "C2", type: "ACCOUNT", name: null, hop: 2, path: null, exposureUsd: null, impactScore: null }],
}
const SCEN: ScenarioSet = {
  entityId: "X001", runId: "S1", runAt: "2026-01-03", runBy: null, assumptions: null, windowStart: null, windowEnd: null, horizonDays: 30, provenance: null, baseline: null,
  scenarios: ["BLOCK", "DO_NOTHING", "MONITOR"].map((name) => ({ name, runId: "S1", narrative: null, metrics: { amount_at_risk_next_30d_usd: 100, evidence_posture: "x" }, baselineRiskScore: 50, simulatedRiskScore: 40, delta: -10 })),
}
const TRACE = {
  runId: "RUN-T", entityId: "X001", entityName: "Test Co", question: "q", mode: "PHASED_ASYNC", status: "COMPLETED", phase: null, startedAt: null, phase1DoneAt: null, complianceDoneAt: null, skepticDoneAt: null, finishedAt: "2026-01-04T00:00:00Z",
  totalSeconds: 400, specialistsOk: 5, specialistsFailed: 0,
  finalResponse: "## 7. UNRESOLVED QUESTIONS\n- Open question (test)\n## 8. FINAL EVIDENCE-GROUNDED FINDING\nStored finding (test).\n## 9. SOURCES\nx",
  stages: ["INVESTIGATOR", "RISK_ANALYST", "COMPLIANCE", "SKEPTIC", "SCENARIO"].map((role) => ({ role, status: "COMPLETED" as const, backendStatus: "OK", startedAt: null, durationSeconds: 60, offsetSeconds: 0, tools: [], inputTokens: null, outputTokens: null, brief: null, calls: [] })),
  orchestratorCalls: [], toolCallsAvailable: false,
} satisfies Trace

async function show(node: React.ReactNode) {
  await act(async () => {
    render(<Suspense fallback={<p>loading</p>}>{node}</Suspense>)
  })
}

describe("decision brief helpers", () => {
  it("picks the strongest contributors by backend contribution, dropping zero", () => {
    expect(topContributors(RISK.dimensions).map((d) => d.key)).toEqual(["HISTORICAL_DEVIATION", "B_DIM", "A_DIM"])
    // An adjusted dimension outside the top n is still included; unadjusted ones are not.
    expect(topContributors(RISK.dimensions, 1).map((d) => d.key)).toEqual(["HISTORICAL_DEVIATION"])
    expect(topContributors([dim("A", "A", 90, 9), dim("H", "H", 70, 1, 8), dim("C", "C", 50, 5)], 1).map((d) => d.key)).toEqual(["A", "H"])
  })
  it("calls evidence mixed only from backend posture or counts", () => {
    expect(isMixedEvidence(BAL)).toBe(true)
    expect(isMixedEvidence({ ...BAL, posture: "SUPPORTED", contradicting: 1, supporting: 9 })).toBe(false)
    expect(isMixedEvidence(null)).toBe(false)
  })
  it("finds sections 7 and 8 of the stored report", () => {
    const s = councilSections(TRACE.finalResponse)
    expect(s.finding?.body).toBe("Stored finding (test).")
    expect(s.unresolved?.body).toContain("Open question (test)")
    expect(councilSections(null)).toEqual({ finding: null, unresolved: null })
  })
  it("headline scenario metrics skip text metrics", () => {
    expect(headlineScenarioMetrics({ amount_at_risk_next_30d_usd: 1, evidence_posture: "x" }).map((m) => m.key)).toEqual(["amount_at_risk_next_30d_usd"])
  })
  it("settled() turns a rejection into { ok: false } without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await settled(Promise.reject(new Error("boom")))).toEqual({ ok: false })
  })
  it("fmtUsd keeps stored cents only when asked, and only when the value has them", () => {
    expect(fmtUsd(805229.39, { cents: true })).toBe("$805,229.39")
    expect(fmtUsd("805229.39", { cents: true })).toBe("$805,229.39")
    expect(fmtUsd(805229, { cents: true })).toBe("$805,229")
    expect(fmtUsd(1234.5, { cents: true })).toBe("$1,234.50")
    // Default (every other screen) is unchanged: whole dollars.
    expect(fmtUsd(805229.39)).toBe("$805,229")
    expect(fmtUsd(5678.9)).toBe("$5,679")
    expect(fmtUsd(undefined, { cents: true })).toBe("—")
  })
})

describe("decision brief sections", () => {
  it("header shows adjusted, standard and the four actions", async () => {
    await show(<BriefHeader identity={ID} risk={ok(RISK)} />)
    expect(screen.getByTestId("brief-adjusted").textContent).toBe("50.25")
    expect(screen.getByTestId("brief-standard").textContent).toBe("60.50")
    const links = within(screen.getByRole("navigation", { name: "Brief actions" })).getAllByRole("link").map((a) => a.textContent)
    expect(links).toEqual(["Investigate", "Evidence", "Network", "Simulate"])
  })
  it("executive finding separates observed / model / contradictory / missing and quotes the stored finding", async () => {
    await show(<ExecutiveFinding risk={ok(RISK)} evidence={ok(EVIDENCE)} blast={ok(BLAST)} trace={ok(TRACE)} />)
    const glance = screen.getByTestId("finding-glance").textContent!
    expect(glance).toContain("2 connected entities")
    expect(glance).toContain("$1,234.50 modeled amount at risk")
    expect(glance).toContain("5 evidence items point against")
    expect(glance).toContain("2 evidence items have not been obtained")
    expect(screen.getByTestId("finding-text").textContent).toContain("Stored finding (test).")
    expect(screen.getByText(/RUN-T/)).toBeTruthy()
  })
  it("executive finding says so when no council finding is stored", async () => {
    await show(<ExecutiveFinding risk={ok(RISK)} evidence={ok(EVIDENCE)} blast={ok(null)} trace={ok(null)} />)
    expect(screen.getByText("No completed council finding is stored for this entity.")).toBeTruthy()
  })
  it("why-it-matters shows adjustment and stored explanation, or says none exists", async () => {
    await show(<WhyItMatters risk={ok(RISK)} evidence={ok(EVIDENCE)} entityId="X001" />)
    expect(screen.getByTestId("adjusted-HISTORICAL_DEVIATION").textContent).toContain("8.00 adjusted")
    expect(screen.getByTestId("contrib-HISTORICAL_DEVIATION").textContent).toContain("History claim (test)")
    expect(screen.getByTestId("contrib-B_DIM").textContent).toContain("No stored explanation for this dimension.")
  })
  it("evidence balance shows the four counts and the mixed-evidence note", async () => {
    await show(<EvidenceBalanceSection evidence={ok(EVIDENCE)} entityId="X001" />)
    expect(["supporting", "contradicting", "neutral", "missing"].map((k) => screen.getByTestId(`bal-${k}`).textContent)).toEqual(["Supporting3", "Contradicting5", "Neutral1", "Missing2"])
    expect(screen.getByTestId("mixed-note").textContent).toContain("Evidence is mixed")
  })
  it("no mixed note when the backend does not say the evidence is contested", async () => {
    await show(<EvidenceBalanceSection evidence={ok({ ...EVIDENCE, balance: { ...BAL, posture: "SUPPORTED", contradicting: 0 } })} entityId="X001" />)
    expect(screen.queryByTestId("mixed-note")).toBeNull()
  })
  it("network summary shows connected entities, direct/indirect and amount at risk", async () => {
    await show(<NetworkSummary blast={ok(BLAST)} entityId="X001" />)
    expect(screen.getByTestId("net-connected").textContent).toBe("2")
    expect(screen.getByText("1 direct · 1 indirect")).toBeTruthy()
    expect(screen.getByTestId("net-at-risk").textContent).toBe("$1,234.50")
    expect(screen.getByTestId("net-customers_affected").textContent).toContain("7")
  })
  it("action simulation orders Do nothing / Monitor / Block and carries the disclaimer", async () => {
    await show(<ActionSimulation scenarios={ok(SCEN)} entityId="X001" />)
    const order = [...screen.getByTestId("brief-simulation").querySelectorAll("[data-testid^=sim-]")].map((e) => e.getAttribute("data-testid"))
    expect(order).toEqual(["sim-DO_NOTHING", "sim-MONITOR", "sim-BLOCK"])
    expect(screen.getByText("Scenario model — not a prediction or certainty.")).toBeTruthy()
  })
  it("council status lists all six stages from the stored run and never offers to start one", async () => {
    await show(<CouncilStatus trace={ok(TRACE)} entityId="X001" />)
    for (const k of ["INVESTIGATOR", "RISK_ANALYST", "COMPLIANCE", "SKEPTIC", "SCENARIO", "ORACLE"]) expect(screen.getByTestId(`council-${k}`)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByRole("link", { name: /View Agent Trace/ }).getAttribute("href")).toBe("/agent-trace?entity=X001&run=RUN-T")
  })
  it("next step quotes band guidance with its source and lists evidence-based navigation", async () => {
    await show(<NextStep risk={ok(RISK)} evidence={ok(EVIDENCE)} trace={ok(TRACE)} entityId="X001" />)
    expect(screen.getByTestId("band-action").textContent).toContain("Band guidance (test)")
    expect(screen.getByTestId("band-action").textContent).toContain("V_RISK_BAND_CONFIG")
    expect(screen.getByTestId("next-steps").textContent).toContain("Inspect missing evidence")
    expect(screen.getByTestId("next-steps").textContent).toContain("2 items not yet obtained")
    expect(screen.getByTestId("unresolved").textContent).toContain("Open question (test)")
  })
  it("failed or missing optional data shows plain messages, not errors", async () => {
    await show(
      <>
        <RiskEvolution timeline={failed()} events={ok([])} entityId="X001" />
        <NetworkSummary blast={ok(null)} entityId="X001" />
        <ActionSimulation scenarios={ok(null)} entityId="X001" />
        <CouncilStatus trace={ok(null)} entityId="X001" />
        <EvidenceBalanceSection evidence={ok({ claims: [], balance: null })} entityId="X001" />
      </>,
    )
    expect(screen.getByText(/The risk history is not available right now/)).toBeTruthy()
    expect(screen.getByText("No blast radius is stored for this entity.")).toBeTruthy()
    expect(screen.getByText("No scenario run is stored for this entity yet.")).toBeTruthy()
    expect(screen.getByText("No council run is stored for this entity.")).toBeTruthy()
    expect(screen.getByText("Evidence is not currently available for this entity.")).toBeTruthy()
  })
  it("renders backend text safely (no HTML injection)", async () => {
    const evil = { ...TRACE, finalResponse: '## 8. FINAL EVIDENCE-GROUNDED FINDING\n<img src=x onerror="alert(1)"><script>alert(1)</script>' }
    await show(<ExecutiveFinding risk={ok(RISK)} evidence={ok(EVIDENCE)} blast={ok(BLAST)} trace={ok(evil)} />)
    expect(document.querySelector("img, script")).toBeNull()
  })
})

describe("decision brief page safety", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../app/investigations/[entityId]/decision-brief/page.tsx"), "utf8")
  const comp = fs.readFileSync(path.join(__dirname, "../../components/brief/decision-brief.tsx"), "utf8")
  it("never starts a council, evaluation or scenario run", () => {
    for (const s of [src, comp]) expect(s).not.toMatch(/SP_RUN_COUNCIL|SP_EVALUATE_RUN|runScenarios|startCouncil|TOOL_RUN_SCENARIOS/)
  })
  it("contains no SQL and no hardcoded M044 values", () => {
    for (const s of [src, comp]) {
      expect(s).not.toMatch(/\bSELECT\b|querySnowflake/)
      expect(s).not.toMatch(/66\.68|55\.56|805,?229|\b249\b/)
    }
  })
})
