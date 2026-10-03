// @vitest-environment jsdom
import fs from "fs"
import path from "path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

vi.mock("server-only", () => ({}))

import { TimeMachine, type TimeMachineEvent, type TimeMachinePoint } from "../../components/investigation/time-machine"
import { DimensionBreakdown } from "../../components/investigation/dimension-breakdown"
import { BandScale, ModelComparison, RiskOverview, WhyBand } from "../../components/risk/risk-panels"
import type { RiskSummary } from "../../lib/server/investigation"
import type { BandRange } from "../../lib/risk-style"

afterEach(cleanup)

// Deliberately NOT the production thresholds, to prove the UI reads bands instead of hardcoding them.
const BANDS: BandRange[] = [
  { band: "NORMAL", lower: 0, upper: 30, action: "Routine monitoring (test)" },
  { band: "WATCH", lower: 30, upper: 45, action: "Review drivers (test)" },
  { band: "ELEVATED", lower: 45, upper: 80, action: "Open investigation (test)" },
  { band: "CRITICAL", lower: 80, upper: 1000, action: "Escalate (test)" },
]

const dim = (key: string, label: string, score: number, contribution: number, weight: number, rule: "R1" | "R2" | "R3" | null = null, dedup: number | null = null, applied = false) => ({
  key, label, weight, score, contribution, scoreDedup: dedup, dedupRule: rule, dedupApplied: applied, formula: "f", policyReference: "p",
})

const RISK: RiskSummary = {
  scoreDate: "2026-10-02", overall: 66.68, band: "ELEVATED", bandAction: "x", overallDedup: 55.56, bandDedup: "ELEVATED", dedupAdjustment: 11.12,
  explanation: "Overall 66.68 ...", dedupExplanation: "R1 ... R2 not applied ... R3 ...", bindingComponent: "STRUCTURING",
  dimensions: [
    dim("TRANSACTION_ANOMALY", "Transaction anomaly", 100, 20, 0.2),
    dim("VELOCITY_ANOMALY", "Velocity", 40.8, 4.08, 0.1),
    dim("GEOGRAPHIC_ANOMALY", "Geography", 18, 1.44, 0.08),
    dim("DEVICE_CLUSTERING", "Device clustering", 76.5, 11.47, 0.15),
    dim("MERCHANT_RISK", "Merchant profile", 45, 3.15, 0.07),
    dim("HISTORICAL_DEVIATION", "Change vs history", 68.67, 6.87, 0.1, "R1", 7.85, true),
    dim("ACCOUNT_BEHAVIOR", "Account behaviour", 72.26, 8.67, 0.12, "R2", 72.26, false),
    dim("NETWORK_RELATIONSHIP_RISK", "Network relationships", 61.11, 11, 0.18, "R3", 33.11, true),
  ],
}

describe("risk panels", () => {
  it("overview shows both backend scores, the difference and the configured action", () => {
    render(<RiskOverview risk={RISK} bands={BANDS} />)
    const o = screen.getByTestId("risk-overview")
    expect(o.textContent).toContain("66.68")
    expect(o.textContent).toContain("55.56")
    expect(o.textContent).toContain("−11.12")
    expect(o.textContent).toContain("Open investigation (test)")
    expect(o.textContent).toMatch(/not a finding of fraud/)
    expect(o.textContent).not.toMatch(/fraudulent/i)
  })

  it("comparison: exactly two adjusted, R2 has a v2 column but is unchanged, five same in both", () => {
    render(<ModelComparison risk={RISK} />)
    const adjusted = document.querySelectorAll('[data-adjusted="true"]')
    expect([...adjusted].map((r) => r.getAttribute("data-testid"))).toEqual(["cmp-HISTORICAL_DEVIATION", "cmp-NETWORK_RELATIONSHIP_RISK"])
    expect(screen.getByTestId("cmp-HISTORICAL_DEVIATION").textContent).toMatch(/68\.67.*7\.85/)
    expect(screen.getByTestId("cmp-NETWORK_RELATIONSHIP_RISK").textContent).toMatch(/61\.11.*33\.11/)
    expect(screen.getByTestId("cmp-ACCOUNT_BEHAVIOR").textContent).toContain("Rule R2 not applied")
    expect(screen.getAllByText("Same in both models")).toHaveLength(5)
    for (const k of ["TRANSACTION_ANOMALY", "VELOCITY_ANOMALY", "GEOGRAPHIC_ANOMALY", "DEVICE_CLUSTERING", "MERCHANT_RISK"]) {
      const cells = screen.getByTestId(`cmp-${k}`).querySelectorAll("td")
      expect(cells[1].textContent).toBe(cells[2].textContent)
    }
  })

  it("why-band uses configured bounds and the top three contributors", () => {
    render(<WhyBand entityId="M044" risk={RISK} bands={BANDS} />)
    const t = screen.getByTestId("why-band").textContent!
    expect(t).toContain("Why is M044 Elevated?")
    expect(t).toMatch(/from 45 up to 80/)
    const order = ["Transaction anomaly", "Device clustering", "Network relationships"].map((s) => t.indexOf(s))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it("band scale lists every configured band and marks the current one", () => {
    render(<BandScale bands={BANDS} band="ELEVATED" bandDedup="ELEVATED" />)
    const s = screen.getByTestId("band-scale")
    for (const b of BANDS) expect(s.textContent).toContain(b.action!)
    expect(s.textContent).toContain("v1 & v2")
  })

  it("dimension breakdown renders all eight with weight and points", () => {
    render(<DimensionBreakdown risk={RISK} bands={BANDS} />)
    for (const d of RISK.dimensions) expect(screen.getByTestId(`dim-${d.key}`).textContent).toContain(`${Math.round(d.weight! * 100)}%`)
    expect(screen.getByTestId("dim-HISTORICAL_DEVIATION").textContent).toContain("7.85 (R1)")
    expect(screen.getByTestId("dim-ACCOUNT_BEHAVIOR").textContent).not.toContain("(R2)")
  })
})

const pt = (date: string, overall: number, band: string, windowLabel: string | null = null, extra: Partial<TimeMachinePoint> = {}): TimeMachinePoint => ({
  date, windowLabel, overall, band, overallDedup: overall - 5, bandDedup: band, bandChanged: false, topDriver: "TRANSACTION_ANOMALY", ...extra,
})
const POINTS = [
  pt("2026-09-02", 10, "NORMAL", "30_DAYS_AGO"),
  pt("2026-09-18", 12, "NORMAL", "14_DAYS_AGO"),
  pt("2026-09-25", 52, "ELEVATED", "7_DAYS_AGO", { bandChanged: true }),
  pt("2026-10-02", 66.68, "ELEVATED", "TODAY"),
]
const EVENTS: TimeMachineEvent[] = [
  { eventId: "EW-1", type: "WIRE_BURST", detectedAt: "2026-09-25T08:00:00Z", severity: "HIGH", headline: "Wire burst begins", details: "Outbound wires >20x baseline", isLeadingIndicator: false, relatedSignalIds: ["SIG-9"] },
]

describe("time machine", () => {
  const renderTM = (events = EVENTS) =>
    render(<TimeMachine points={POINTS} abnormalStart="2026-09-19" abnormalStartDedup="2026-09-20" events={events} bands={BANDS} />)

  it("shows backend pattern start dates for both models", () => {
    renderTM()
    const t = screen.getByTestId("pattern-start").textContent!
    expect(t).toContain("Sep 19, 2026")
    expect(t).toContain("Sep 20, 2026")
  })

  it("defaults to Today and switches snapshots without refetching", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    renderTM()
    expect(screen.getByTestId("selected-day").textContent).toContain("Oct 2, 2026")
    for (const [tab, date] of [["30D", "Sep 2, 2026"], ["14D", "Sep 18, 2026"], ["7D", "Sep 25, 2026"], ["Today", "Oct 2, 2026"]]) {
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${tab}`) }))
      expect(screen.getByRole("tab", { name: new RegExp(`^${tab}`) }).getAttribute("aria-selected")).toBe("true")
      expect(screen.getByTestId("selected-day").textContent).toContain(date)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it("selecting an event shows what, when, why and source from the backend", () => {
    renderTM()
    fireEvent.click(screen.getByRole("button", { name: /Wire burst begins/ }))
    const d = within(screen.getByTestId("event-detail"))
    expect(d.getByText("Outbound wires >20x baseline")).toBeTruthy()
    expect(screen.getByTestId("event-detail").textContent).toMatch(/When.*Sep 25, 2026/)
    expect(screen.getByTestId("event-detail").textContent).toMatch(/Wire burst · High severity/)
    expect(screen.getByTestId("event-detail").textContent).toContain("EARLY_WARNING_EVENTS · EW-1")
    expect(screen.getByTestId("event-detail").textContent).toContain("SIG-9")
    expect(screen.getByTestId("selected-day").textContent).toContain("Sep 25, 2026")
    fireEvent.click(screen.getByRole("button", { name: "Close event details" }))
    expect(screen.queryByTestId("event-detail")).toBeNull()
  })

  it("handles no events and no history", () => {
    renderTM([])
    expect(screen.getByText(/No early-warning events/)).toBeTruthy()
    cleanup()
    render(<TimeMachine points={[]} abnormalStart={null} abnormalStartDedup={null} events={[]} bands={BANDS} />)
    expect(screen.getByText(/No risk history/)).toBeTruthy()
  })
})

describe("no duplicate risk calculation in the frontend", () => {
  const ROOT = path.resolve(__dirname, "../..")
  const files = ["components/risk/risk-panels.tsx", "components/investigation/dimension-breakdown.tsx", "components/investigation/time-machine.tsx", "app/risk/page.tsx"]
  it("no hardcoded band thresholds or weighted-sum scoring", () => {
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8")
      expect(src, f).not.toMatch(/(>=|<=|<|>)\s*(25|50|75)\b/)
      expect(src, f).not.toMatch(/\.weight\s*\*\s*\w+\.score|\.score\s*\*\s*\w+\.weight/)
      expect(src, f).not.toMatch(/y1=\{(25|50|75)\}/)
    }
  })
})
