import { describe, expect, it } from "vitest"
import { parseBrief } from "../../lib/brief"

// Format fixture: the "=== COUNCIL BRIEF ===" layout defined in the frozen agent specs.
const BRIEF = `=== COUNCIL BRIEF ===

**CONCLUSIONS:**
• v1 overall_score 66.68 (ELEVATED) [MODEL OUTPUT]
• No fraud verdict

**SUPPORTING EVIDENCE:**
- 69 near-threshold txns [FACT]

CONTRADICTIONS: bullets follow
- N-M044-06 legitimate sales [NARRATIVE EVIDENCE]

**MISSING EVIDENCE**:
- Vendor record for D2999

**SOURCES**: INTEL.V_ENTITY_RISK_INTELLIGENCE (M044), RAW.TRANSACTIONS
=== END BRIEF ===
Detail that must be ignored`

describe("parseBrief", () => {
  it("splits the five sections and strips markdown bullets", () => {
    const b = parseBrief(BRIEF)!
    expect(b.conclusions).toEqual(["v1 overall_score 66.68 (ELEVATED) [MODEL OUTPUT]", "No fraud verdict"])
    expect(b.supporting).toEqual(["69 near-threshold txns [FACT]"])
    expect(b.contradictions).toEqual(["bullets follow", "N-M044-06 legitimate sales [NARRATIVE EVIDENCE]"])
    expect(b.missing).toEqual(["Vendor record for D2999"])
    expect(b.sources[0]).toContain("INTEL.V_ENTITY_RISK_INTELLIGENCE")
    expect(JSON.stringify(b)).not.toContain("must be ignored")
  })

  it("returns null when there is no brief", () => {
    expect(parseBrief(null)).toBeNull()
    expect(parseBrief("plain answer")).toBeNull()
  })
})
