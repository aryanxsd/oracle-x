// @vitest-environment jsdom
import fs from "fs"
import path from "path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

vi.mock("server-only", () => ({}))
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

import { ImpactExplorer } from "../../components/impact/impact-explorer"
import { BlastSummary } from "../../components/impact/blast-summary"
import { SCENARIO_DISCLAIMER, ScenarioCompare } from "../../components/impact/scenario-compare"
import type { BlastRadius, ScenarioSet } from "../../lib/impact-types"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Deliberately not M044's real values: the UI must show whatever the backend returns.
const BR: BlastRadius = {
  rootId: "M999", computedAt: "2026-10-03T02:15:08Z", windowStart: "2026-09-03", windowEnd: "2026-10-03", maxDepth: 2, modelVersion: "v-test", entityMethodology: "within 2 hops (test)",
  metrics: [
    { name: "customers_affected", value: 12, methodology: "COUNT customers (test)" },
    { name: "indirect_accounts", value: 34, methodology: "other accounts (test)" },
    { name: "risk_exposure", value: 5678.9, methodology: "near-threshold OR flagged (test)" },
    { name: "brand_new_metric", value: 1, methodology: null },
  ],
  entities: [
    { id: "D111", type: "DEVICE", name: "Device A", hop: 1, path: "M999 -[TRANSACTED_ON_DEVICE]-> D111", exposureUsd: 400, impactScore: 100 },
    { id: "C222", type: "CUSTOMER", name: null, hop: 2, path: "M999 -[X]-> D111 -[USES_DEVICE]-> C222", exposureUsd: null, impactScore: 35 },
    { id: "B333", type: "COUNTERPARTY", name: "Cp", hop: 1, path: "M999 -[WIRED_TO]-> B333", exposureUsd: 10, impactScore: 70 },
  ],
}

describe("blast radius", () => {
  it("renders the root → direct → indirect → exposure hierarchy with backend values and methodology", () => {
    render(<BlastSummary entityName="Test merchant" br={BR} />)
    expect(screen.getByTestId("metric-customers_affected").textContent).toContain("12")
    expect(within(screen.getByTestId("tier-direct")).getByTestId("metric-customers_affected")).toBeTruthy()
    expect(within(screen.getByTestId("tier-indirect")).getByTestId("metric-indirect_accounts")).toBeTruthy()
    const risk = screen.getByTestId("metric-risk_exposure")
    expect(within(screen.getByTestId("tier-exposure")).getByTestId("metric-risk_exposure")).toBeTruthy()
    expect(risk.textContent).toContain("$5,679")
    expect(risk.textContent).toContain("not a loss estimate")
    expect(risk.textContent).toContain("near-threshold OR flagged (test)")
    expect(risk.querySelector("[title^='MODEL OUTPUT']")).toBeTruthy()
    expect(screen.getByTestId("metric-customers_affected").querySelector("[title^='FACT']")).toBeTruthy()
    expect(screen.getByTestId("metric-brand_new_metric")).toBeTruthy()
    expect(screen.queryByTestId("tier-nonexistent")).toBeNull()
  })

  it("explorer groups by step and type, and links the selection to the Entity Graph", () => {
    render(<ImpactExplorer rootId="M999" entities={BR.entities} />)
    expect(screen.getByRole("tab", { name: /Direct \(1 step\) · 2/ }).getAttribute("aria-selected")).toBe("true")
    expect(within(screen.getByTestId("impact-list")).getAllByRole("button")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: /Device A/ }))
    const d = screen.getByTestId("impact-detail")
    expect(d.textContent).toContain("M999 -[TRANSACTED_ON_DEVICE]-> D111")
    expect(d.textContent).toContain("$400")
    expect(within(d).getByRole("link").getAttribute("href")).toBe("/graph?entity=M999&mode=paths&hops=2&through=D111")
    fireEvent.click(screen.getByRole("tab", { name: /Indirect \(2 steps\)/ }))
    fireEvent.click(screen.getByRole("button", { name: /C222/ }))
    expect(screen.getByTestId("impact-detail").textContent).toMatch(/No direct card or wire value/)
  })

  it("empty explorer", () => {
    render(<ImpactExplorer rootId="M999" entities={[]} />)
    expect(screen.getByText(/No connected entities/)).toBeTruthy()
  })
})

const SET: ScenarioSet = {
  entityId: "M999", runId: "RUN-T", runAt: "2026-10-03T08:46:00Z", runBy: "tool", assumptions: "Test assumption: run-rate persists.", windowStart: "2026-09-03", windowEnd: "2026-10-03", horizonDays: 30, provenance: null, baseline: null,
  scenarios: [
    { name: "BLOCK", runId: "RUN-T-BLOCK", narrative: "Block narrative (test)", metrics: { amount_at_risk_next_30d_usd: 0, amount_at_risk_prevented_usd: 111, legitimate_customers_disrupted: 22, policy_alignment: "Block policy text (test)" }, baselineRiskScore: 61, simulatedRiskScore: 61, delta: 0 },
    { name: "DO_NOTHING", runId: "RUN-T-DO_NOTHING", narrative: "Do nothing narrative (test)", metrics: { amount_at_risk_next_30d_usd: 111, amount_at_risk_prevented_usd: 0 }, baselineRiskScore: 61, simulatedRiskScore: 61, delta: 0 },
    { name: "MONITOR", runId: "RUN-T-MONITOR", narrative: "Monitor narrative (test)", metrics: { amount_at_risk_next_30d_usd: 111, evidence_gaps_addressed: 4, mystery_metric: 9 }, baselineRiskScore: 61, simulatedRiskScore: 61, delta: 0 },
  ],
}

describe("scenario simulator", () => {
  it("shows the disclaimer and the three scenarios side by side in a fixed order", () => {
    render(<ScenarioCompare entityId="M999" initial={SET} />)
    expect(screen.getByTestId("scenario-disclaimer").textContent).toContain(SCENARIO_DISCLAIMER)
    expect(SCENARIO_DISCLAIMER).toBe("Scenario model — not a prediction or certainty.")
    const heads = [...screen.getByTestId("scenario-table").querySelectorAll("thead th")].map((t) => t.textContent)
    expect(heads).toEqual(["Outcome", "Do nothing", "Monitor", "Block"])
    for (const n of ["DO_NOTHING", "MONITOR", "BLOCK"]) expect(screen.getByTestId(`scenario-${n}`).querySelector("[title^='SCENARIO OUTPUT']")).toBeTruthy()
    expect(screen.getByText("What could happen under each action?")).toBeTruthy()
  })

  it("shows only backend values; missing ones are a dash, never a number", () => {
    render(<ScenarioCompare entityId="M999" initial={SET} />)
    const cells = (k: string) => [...screen.getByTestId(`row-${k}`).querySelectorAll("td")].slice(1).map((c) => c.textContent)
    expect(cells("amount_at_risk_prevented_usd")).toEqual(["$0", "—", "$111"])
    expect(cells("legitimate_customers_disrupted")).toEqual(["—", "—", "22"])
    expect(cells("mystery_metric")).toEqual(["—", "9", "—"])
    expect(screen.getByTestId("text-BLOCK-policy_alignment").textContent).toBe("Block policy text (test)")
    expect(screen.getByTestId("not-produced").textContent).toMatch(/accounts affected, transactions affected, alternative capacity/)
    expect(screen.getByText(/does not re-score/)).toBeTruthy()
  })

  it("keeps facts, assumptions and outputs in separate labelled sections", () => {
    render(<ScenarioCompare entityId="M999" initial={SET} />)
    expect(screen.getByTestId("model-assumptions").textContent).toContain("Test assumption: run-rate persists.")
    expect(screen.getByTestId("model-assumptions").querySelector("[title^='MODEL OUTPUT']")).toBeTruthy()
    expect(screen.getByTestId("observed-facts").querySelector("[title^='FACT']")).toBeTruthy()
    expect(screen.getByTestId("observed-facts").textContent).toMatch(/returned only when the scenarios are run/)
  })

  it("does not recommend an action or call anything fraud", () => {
    render(<ScenarioCompare entityId="M999" initial={SET} />)
    const t = document.body.textContent!
    expect(t).toMatch(/does not recommend an action/)
    expect(t).not.toMatch(/\b(recommended|best option|you should|fraudulent)\b/i)
  })

  it("re-run posts to the API and shows the observed baseline it returns", async () => {
    const fresh = { ...SET, runId: "RUN-NEW", baseline: { card_volume_30d_usd: 4321, risk_band: "ELEVATED" }, provenance: "SCENARIO OUTPUT (fresh)" }
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ entityId: "M999", scenarios: fresh }), { status: 200 }))
    render(<ScenarioCompare entityId="M999" initial={SET} />)
    expect(f).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Re-run scenarios/ }))
    await waitFor(() => expect(screen.getByTestId("scenario-run").textContent).toContain("RUN-NEW"))
    expect(f).toHaveBeenCalledWith("/api/scenarios", expect.objectContaining({ method: "POST", body: JSON.stringify({ entityId: "M999" }) }))
    expect(screen.getByTestId("observed-facts").textContent).toContain("$4,321")
  })

  it("re-run failure shows the sanitized error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Scenario run failed" }), { status: 500 }))
    render(<ScenarioCompare entityId="M999" initial={SET} />)
    fireEvent.click(screen.getByRole("button", { name: /Re-run scenarios/ }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Scenario run failed"))
  })

  it("empty state", () => {
    render(<ScenarioCompare entityId="M999" initial={null} />)
    expect(screen.getByText(/No scenario results are available/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /Run scenarios/ })).toBeTruthy()
  })

  it("renders backend text as text", () => {
    render(<ScenarioCompare entityId="M999" initial={{ ...SET, assumptions: "<img src=x onerror=alert(1)>" }} />)
    expect(document.querySelector("img")).toBeNull()
  })
})

describe("no hardcoded M044 values or SQL in the impact UI", () => {
  const ROOT = path.resolve(__dirname, "../..")
  const files = ["components/impact/impact-explorer.tsx", "components/impact/blast-summary.tsx", "components/impact/scenario-compare.tsx", "lib/impact-types.ts", "app/blast-radius/page.tsx", "app/scenarios/page.tsx"]
  it("none of M044's real figures or SQL appear in source", () => {
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8")
      expect(src, f).not.toMatch(/805229|805,229|719279|712\b|785\b|786\b|1291|1010953|513555|419950|299329/)
      expect(src, f).not.toMatch(/\bSELECT\b[\s\S]{0,200}\bFROM\b|CALL ORACLE_X/i)
    }
  })
})
