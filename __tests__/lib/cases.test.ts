import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../../lib/snowflake", () => ({ querySnowflake: vi.fn() }))

import { querySnowflake } from "../../lib/snowflake"
import { _clearCache } from "../../lib/server/cache"
import { getCaseBriefs, getCaseFile, getCouncilCase, listCases } from "../../lib/server/cases"
import { parseReport, parseSources } from "../../lib/case-types"
import { GET as listGET } from "../../app/api/cases/route"
import { GET as caseGET } from "../../app/api/cases/[id]/route"

const q = vi.mocked(querySnowflake)
beforeEach(() => {
  q.mockReset()
  _clearCache()
})

// Synthetic report text — not M044's real report.
const REPORT = [
  "# Council report: X001 (test)",
  "intro line",
  "## 1. COUNCIL RUN",
  "Run facts (test).",
  "## 2. INVESTIGATOR FINDINGS",
  "- finding A",
  "## 3. RISK ANALYSIS (MODEL OUTPUT)",
  "risk text",
  "## 4. COMPLIANCE ANALYSIS",
  "c",
  "## 5. SKEPTIC CHALLENGES",
  "s",
  "## 6. SCENARIO COMPARISON (SCENARIO OUTPUT)",
  "sc",
  "## 7. UNRESOLVED QUESTIONS",
  "u",
  "## 8. FINAL EVIDENCE-GROUNDED FINDING",
  "f",
  "## 9. SOURCES",
  "- **FACT:** RAW.T1 X; RAW.T2 Y",
  "- **MODEL OUTPUT:** INTEL.V1",
  "- **NARRATIVE EVIDENCE:** RAW.NOTES N-1",
  "- **POLICY:** SFCA-1.1 (a; b); SFCA-2.2",
  "- **SCENARIO OUTPUT:** CASES.SCENARIO_RUNS R-1",
  "- **Weird label:** keep me",
].join("\n")

describe("report parsing", () => {
  it("splits the stored markdown into its nine numbered sections, verbatim", () => {
    const r = parseReport(REPORT)
    expect(r.title).toBe("Council report: X001 (test)")
    expect(r.preamble).toBe("intro line")
    expect(r.sections.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(r.sections[2]).toEqual({ number: 3, title: "RISK ANALYSIS (MODEL OUTPUT)", body: "risk text" })
    expect(r.sections[1].body).toBe("- finding A")
  })
  it("handles missing / unstructured reports without inventing sections", () => {
    expect(parseReport(null)).toEqual({ title: null, preamble: "", sections: [] })
    expect(parseReport("just text").sections).toEqual([])
  })
  it("groups sources only by the provenance labels the backend wrote", () => {
    const g = parseSources(parseReport(REPORT).sections[8].body)
    expect(g.map((x) => x.kind)).toEqual(["FACT", "MODEL OUTPUT", "NARRATIVE EVIDENCE", "POLICY", "SCENARIO OUTPUT"])
    expect(g[0].items).toEqual(["RAW.T1 X", "RAW.T2 Y"])
    expect(g[3].items).toEqual(["SFCA-1.1 (a; b)", "SFCA-2.2"])
    // An unknown label is appended to the previous group, never re-classified as a provenance kind.
    expect(g[4].items).toContain("**Weird label:** keep me")
  })
})

function fake(o: { run?: Record<string, unknown> | null; file?: Record<string, unknown> | null; identity?: boolean; fail?: RegExp } = {}) {
  q.mockImplementation(async (sql: string): Promise<Record<string, any>[]> => {
    if (o.fail?.test(sql)) throw new Error("SQL compilation error ORACLE_X.CASES secret")
    if (/SP_RUN_COUNCIL|SP_EVALUATE_RUN|INSERT|UPDATE|DELETE|MERGE|CREATE/i.test(sql)) throw new Error("write attempted: " + sql)
    if (sql.includes("COUNCIL_TRANSCRIPTS"))
      return [{ AGENT_ROLE: "skeptic", STATUS: "OK", DURATION_MS: 61000, TOOLS_USED: "get_evidence, run_scenarios", ANSWER_TEXT: "=== COUNCIL BRIEF ===\nCONCLUSIONS: c1\nSOURCES: s1\n=== END BRIEF ===\nlong raw answer SECRET_RAW" }]
    if (sql.includes("COUNCIL_RUNS") && sql.includes("council_run_id = ?"))
      return o.run === null ? [] : [{ COUNCIL_RUN_ID: "RUN-1", ENTITY_ID: "X001", EXECUTION_MODE: "PHASED_ASYNC", STATUS: "COMPLETED", TOTAL_SECONDS: 400, SPECIALISTS_OK: 5, SPECIALISTS_FAILED: 0, TITLE: "T", FINAL_RESPONSE: REPORT, DISPLAY_NAME: "Test Co", ...o.run }]
    if (sql.includes("COUNCIL_RUNS")) return [{ COUNCIL_RUN_ID: "RUN-1", ENTITY_ID: "X001", STATUS: "COMPLETED", TITLE: "T" }]
    if (sql.includes("CASE_FILES") && sql.includes("case_file_id = ?"))
      return o.file === null ? [] : [{ CASE_FILE_ID: "CF-CASE-T-v1", CASE_ID: "CASE-T", TITLE: "Typ - M900", NARRATIVE: "n", EVIDENCE_COMPLETENESS_PCT: 60, SUBJECT_ENTITY_ID: "M900", OUTCOME: "SAR_FILED", ...o.file }]
    if (sql.includes("CASE_FILES")) return [{ CASE_FILE_ID: "CF-CASE-T-v1", CASE_ID: "CASE-T", TITLE: "Typ - M900" }]
    if (sql.includes("EVIDENCE_ITEMS")) return [{ EVIDENCE_ID: "EV-1", STANCE: "SUPPORTS", DESCRIPTION: "d" }]
    if (sql.includes("CONTRADICTIONS")) return [{ CONTRADICTION_ID: "CT-1", CLAIM: "c", COUNTER_CLAIM: "cc", RESOLUTION_STATUS: "RESOLVED" }]
    if (sql.includes("CORE.ENTITY_NODES")) return o.identity === false ? [] : [{ NODE_ID: "X001", ENTITY_TYPE: "MERCHANT", DISPLAY_NAME: "x", ATTRIBUTES: {} }]
    throw new Error("unexpected " + sql)
  })
}

describe("case layer (read-only)", () => {
  it("list never loads report bodies or transcripts", async () => {
    fake()
    const l = await listCases("X001")
    expect(l.council[0]).toMatchObject({ id: "RUN-1", status: "COMPLETED" })
    expect(l.files[0]).toMatchObject({ id: "CF-CASE-T-v1" })
    for (const [sql] of q.mock.calls) {
      // Only the title is extracted server-side (REGEXP_SUBSTR); the report body column itself is never selected.
      expect(sql).not.toMatch(/(SELECT|,)\s*r\.final_response\b|COUNCIL_TRANSCRIPTS|answer_text/i)
    }
    expect(q.mock.calls[0][1]?.binds).toEqual(["X001"])
  })
  it("council case binds the run id and only returns the report for completed runs", async () => {
    fake()
    const c = (await getCouncilCase("RUN-1"))!
    expect(q.mock.calls[0][1]?.binds).toEqual(["RUN-1"])
    expect(q.mock.calls[0][0]).toMatch(/IFF\(UPPER\(r\.status\) = 'COMPLETED', r\.final_response, NULL\)/)
    expect(c.finalResponse).toBe(REPORT)
    expect(c.entityName).toBe("Test Co")
  })
  it("briefs come from one run only and never carry the raw answer", async () => {
    fake()
    const b = await getCaseBriefs("RUN-1")
    expect(q.mock.calls[0][1]?.binds).toEqual(["RUN-1"])
    expect(b[0]).toMatchObject({ role: "SKEPTIC", durationSeconds: 61, tools: ["get_evidence", "run_scenarios"] })
    expect(b[0].brief?.conclusions).toEqual(["c1"])
    expect(JSON.stringify(b)).not.toContain("SECRET_RAW")
  })
  it("historical case file joins investigation, evidence and contradictions", async () => {
    fake()
    const f = (await getCaseFile("CF-CASE-T-v1"))!
    expect(f).toMatchObject({ subjectId: "M900", outcome: "SAR_FILED", completenessPct: 60 })
    expect(f.evidence).toHaveLength(1)
    expect(f.contradictions[0]).toMatchObject({ claim: "c", status: "RESOLVED" })
  })
  it("never calls a council or evaluator procedure or writes", async () => {
    fake()
    await listCases("X001")
    await getCouncilCase("RUN-1")
    await getCaseBriefs("RUN-1")
    await getCaseFile("CF-CASE-T-v1")
    for (const [sql] of q.mock.calls) expect(sql).not.toMatch(/\bCALL\b|SP_RUN_COUNCIL|SP_EVALUATE_RUN|INSERT|UPDATE|DELETE|MERGE/i)
  })
})

describe("routes", () => {
  const getCase = (id: string, qs = "") => caseGET(new Request(`http://x/api/cases/${id}${qs}`), { params: Promise.resolve({ id }) })
  it("invalid ids → 400 before Snowflake", async () => {
    expect((await listGET(new Request("http://x/api/cases"))).status).toBe(400)
    expect((await listGET(new Request("http://x/api/cases?entity=%27x"))).status).toBe(400)
    expect((await getCase("bad id;drop")).status).toBe(400)
    expect((await getCase("RUN-1", "?part=sql")).status).toBe(400)
    expect((await getCase("CF-CASE-T-v1", "?part=briefs")).status).toBe(400)
    expect(q).not.toHaveBeenCalled()
  })
  it("unknown entity / run / case file → 404", async () => {
    fake({ identity: false, run: null, file: null })
    expect((await listGET(new Request("http://x/api/cases?entity=M999"))).status).toBe(404)
    expect((await getCase("NO-SUCH-RUN")).status).toBe(404)
    expect((await getCase("CF-NO-SUCH-v1")).status).toBe(404)
  })
  it("returns the council report, briefs and historical file", async () => {
    fake()
    expect((await (await getCase("RUN-1")).json()).finalResponse).toBe(REPORT)
    expect((await (await getCase("RUN-1", "?part=briefs")).json()).briefs).toHaveLength(1)
    expect((await (await getCase("CF-CASE-T-v1")).json()).caseId).toBe("CASE-T")
  })
  it("Snowflake errors are sanitized", async () => {
    fake({ fail: /COUNCIL_RUNS|CASE_FILES/ })
    for (const r of [await getCase("RUN-1"), await getCase("CF-CASE-T-v1"), await listGET(new Request("http://x/api/cases?entity=X001"))]) {
      expect(r.status).toBe(500)
      expect(await r.text()).not.toMatch(/ORACLE_X|compilation|secret|SELECT/i)
    }
  })
})
