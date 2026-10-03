import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { EvidenceCompleteness, SignalEvidence } from "../../components/investigation/evidence-panels"
import { TimeMachine } from "../../components/investigation/time-machine"
import { RiskHeader } from "../../components/investigation/risk-header"
import { WhyPanel } from "../../components/investigation/why-panel"
import { Markdown } from "../../components/oracle/markdown"

vi.mock("server-only", () => ({}))

const identity = { entityId: "M044", type: "MERCHANT", name: "Test merchant", staticRiskTier: "MEDIUM", attributes: {}, isInvestigationSubject: true }

describe("investigation components — empty and edge states", () => {
  it("risk header without a score says so instead of inventing one", () => {
    const html = renderToStaticMarkup(<RiskHeader identity={identity} risk={null} />)
    expect(html).toContain("no risk score")
    expect(html).not.toMatch(/\d+\.\d\d/)
  })

  it("evidence completeness handles a missing balance", () => {
    expect(renderToStaticMarkup(<EvidenceCompleteness balance={null} claims={[]} />)).toContain("No evidence balance")
  })

  it("signal evidence handles no signals", () => {
    expect(renderToStaticMarkup(<SignalEvidence claims={[]} />)).toContain("No risk signals")
  })

  it("time machine handles no history", () => {
    expect(renderToStaticMarkup(<TimeMachine points={[]} abnormalStart={null} abnormalStartDedup={null} events={[]} bands={[]} />)).toContain("No risk history")
  })

  it("WHY renders nothing when there is no backing claim", () => {
    expect(renderToStaticMarkup(<WhyPanel claim={undefined} />)).toBe("")
  })

  it("WHY renders the full chain in order", () => {
    const html = renderToStaticMarkup(
      <WhyPanel
        claim={{ claimId: "C1", origin: "ENGINE_DIMENSION", signalType: "X", claim: "Claim text", observed: 69, baseline: 1.66, unit: null, calculation: "calc", policyReference: "SFCA-AML-01-1.2", documentReference: null, supporting: null, contradicting: null, missing: null, sourceTables: null, sourceRecordIds: "RAW.TRANSACTIONS:T1", sourceRecordCount: 1, detectedAt: null }}
      />,
    )
    const order = ["Claim", "Data", "Calculation", "Policy", "Source"].map((s) => html.indexOf(`>${s} `) >= 0 ? html.indexOf(`>${s} `) : html.indexOf(`>${s}<`))
    expect(order.every((v) => v >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it("markdown never renders raw HTML from agent output", () => {
    const html = renderToStaticMarkup(<Markdown>{"**bold** <script>alert(1)</script> <img src=x onerror=alert(1)>"}</Markdown>)
    expect(html).toContain("<strong>bold</strong>")
    expect(html).not.toContain("<script")
    expect(html).not.toContain("<img")
  })
})
