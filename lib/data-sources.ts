/**
 * ORACLE X data contract: which frozen Snowflake object backs each screen.
 *
 * This file is documentation that the UI can render (Technical details panels)
 * and that API routes reference. It contains no data. The backend is frozen —
 * the web app reads these objects and never re-implements their logic.
 */

export type SourceKind = "VIEW" | "TABLE" | "PROCEDURE" | "FUNCTION" | "SEMANTIC_VIEW" | "SEARCH" | "AGENT"

export interface DataSource {
  object: string
  kind: SourceKind
  use: string
  /** Access path from the API layer. */
  via: "SQL" | "AGENT_REST"
}

export type PageKey =
  | "command"
  | "investigations"
  | "graph"
  | "risk"
  | "evidence"
  | "blast"
  | "scenarios"
  | "dna"
  | "similar"
  | "cases"
  | "trace"
  | "evaluation"
  | "brief"

export const PAGE_SOURCES: Record<PageKey, DataSource[]> = {
  brief: [
    { object: "ORACLE_X.CORE.ENTITY_NODES", kind: "TABLE", via: "SQL", use: "Entity identity" },
    { object: "ORACLE_X.INTEL.V_ENTITY_RISK_INTELLIGENCE", kind: "VIEW", via: "SQL", use: "Standard and adjusted score, band, dimension contributions" },
    { object: "ORACLE_X.INTEL.V_RISK_BAND_CONFIG", kind: "VIEW", via: "SQL", use: "Stored guidance for the risk band" },
    { object: "ORACLE_X.INTEL.EVIDENCE_SUMMARY_SNAPSHOT", kind: "TABLE", via: "SQL", use: "Stored explanation and WHY chain for each contributor" },
    { object: "ORACLE_X.INTEL.V_EVIDENCE_BALANCE", kind: "VIEW", via: "SQL", use: "Supporting / contradicting / neutral / missing counts and posture" },
    { object: "ORACLE_X.INTEL.V_ENTITY_RISK_TIMELINE", kind: "VIEW", via: "SQL", use: "Risk evolution snapshots and pattern start" },
    { object: "ORACLE_X.INTEL.EARLY_WARNING_EVENTS", kind: "TABLE", via: "SQL", use: "Important events" },
    { object: "ORACLE_X.INTEL.BLAST_RADIUS_CACHE", kind: "TABLE", via: "SQL", use: "Connected entities and exposure" },
    { object: "ORACLE_X.CASES.SCENARIO_RUNS", kind: "TABLE", via: "SQL", use: "Latest stored Do nothing / Monitor / Block comparison" },
    { object: "ORACLE_X.CASES.COUNCIL_RUNS", kind: "TABLE", via: "SQL", use: "Latest completed council run and its stored finding" },
    { object: "ORACLE_X.CASES.COUNCIL_TRANSCRIPTS", kind: "TABLE", via: "SQL", use: "Specialist status for that run" },
  ],
  command: [
    { object: "ORACLE_X.INTEL.V_ENTITY_RISK_INTELLIGENCE", kind: "VIEW", via: "SQL", use: "Early Warning Radar band counts (v1 and v2 deduplicated)" },
    { object: "ORACLE_X.INTEL.EARLY_WARNING_EVENTS", kind: "TABLE", via: "SQL", use: "Leading-indicator alerts feed" },
    { object: "ORACLE_X.CASES.COUNCIL_RUNS", kind: "TABLE", via: "SQL", use: "Recent investigations" },
    { object: "ORACLE_X.AGENTS.TOOL_RESOLVE_ENTITY", kind: "PROCEDURE", via: "SQL", use: "Investigate-an-entity search" },
  ],
  investigations: [
    { object: "ORACLE_X.CORE.ENTITY_NODES", kind: "TABLE", via: "SQL", use: "Entity identity" },
    { object: "ORACLE_X.INTEL.INVESTIGATION_SUBJECTS", kind: "TABLE", via: "SQL", use: "Entities under investigation" },
    { object: "ORACLE_X.INTEL.V_ENTITY_RISK_INTELLIGENCE", kind: "VIEW", via: "SQL", use: "Score, band, eight dimensions, explanation, v2 adjustments" },
    { object: "ORACLE_X.INTEL.V_RISK_MODEL_CONFIG", kind: "VIEW", via: "SQL", use: "Dimension weights, formulas, policy references" },
    { object: "ORACLE_X.INTEL.V_RISK_BAND_CONFIG", kind: "VIEW", via: "SQL", use: "Recommended action for each band" },
    { object: "ORACLE_X.INTEL.EVIDENCE_SUMMARY_SNAPSHOT", kind: "TABLE", via: "SQL", use: "WHY: claim, data, calculation, policy, source; supporting / contradicting / missing evidence" },
    { object: "ORACLE_X.INTEL.V_EVIDENCE_BALANCE", kind: "VIEW", via: "SQL", use: "Evidence posture, completeness and uncertainty" },
    { object: "ORACLE_X.INTEL.V_ENTITY_RISK_TIMELINE", kind: "VIEW", via: "SQL", use: "Time Machine: 30d / 14d / 7d / today, band changes, pattern start" },
    { object: "ORACLE_X.INTEL.EARLY_WARNING_EVENTS", kind: "TABLE", via: "SQL", use: "Important events on the timeline" },
    { object: "ORACLE_X.INTEL.BLAST_RADIUS_CACHE", kind: "TABLE", via: "SQL", use: "Blast radius summary metrics" },
    { object: "ORACLE_X.AGENTS.SP_RUN_COUNCIL", kind: "PROCEDURE", via: "SQL", use: "Full council (phased, async) — status polled from CASES.COUNCIL_RUNS" },
    { object: "ORACLE_X.CASES.COUNCIL_TRANSCRIPTS", kind: "TABLE", via: "SQL", use: "Which specialists have answered (council progress)" },
    { object: "ORACLE_X.AGENTS.ORACLE_ORCHESTRATOR", kind: "AGENT", via: "AGENT_REST", use: "Follow-up questions to ORACLE" },
  ],
  graph: [
    { object: "ORACLE_X.INTEL.V_ENTITY_NEIGHBORS", kind: "VIEW", via: "SQL", use: "Direct relationships with evidence, counts, amounts, timing overlap and confidence" },
    { object: "ORACLE_X.AGENTS.TOOL_GET_BOUNDED_GRAPH", kind: "PROCEDURE", via: "SQL", use: "Bounded paths (start entity required, ≤3 hops, ≤200 paths; backend clamps)" },
    { object: "ORACLE_X.CORE.ENTITY_NODES", kind: "TABLE", via: "SQL", use: "Names and types of entities on paths" },
    { object: "ORACLE_X.INTEL.EVIDENCE_SUMMARY_SNAPSHOT", kind: "TABLE", via: "SQL", use: "Risk signals that cite a connected entity (why it matters)" },
  ],
  risk: [
    { object: "ORACLE_X.INTEL.V_ENTITY_RISK_INTELLIGENCE", kind: "VIEW", via: "SQL", use: "v1/v2 scores and bands, eight dimension scores and contributions, dedup rules R1–R3, explanations" },
    { object: "ORACLE_X.INTEL.V_RISK_MODEL_CONFIG", kind: "VIEW", via: "SQL", use: "Dimension weights, formulas and policy references" },
    { object: "ORACLE_X.INTEL.V_RISK_BAND_CONFIG", kind: "VIEW", via: "SQL", use: "Band thresholds and recommended actions" },
    { object: "ORACLE_X.INTEL.V_ENTITY_RISK_TIMELINE", kind: "VIEW", via: "SQL", use: "Daily v1/v2 history, 30/14/7/today snapshots, band changes, pattern start" },
    { object: "ORACLE_X.INTEL.EARLY_WARNING_EVENTS", kind: "TABLE", via: "SQL", use: "Important events with details and related signals" },
    { object: "ORACLE_X.CORE.ENTITY_NODES", kind: "TABLE", via: "SQL", use: "Entity name and type" },
  ],
  evidence: [
    { object: "ORACLE_X.INTEL.EVIDENCE_SUMMARY_SNAPSHOT", kind: "TABLE", via: "SQL", use: "Claim → Data → Calculation → Policy → Source, with supporting / contradicting / missing evidence per claim" },
    { object: "ORACLE_X.INTEL.V_EVIDENCE_BALANCE", kind: "VIEW", via: "SQL", use: "Evidence counts, weights, posture and uncertainty" },
    { object: "ORACLE_X.INTEL.RISK_SIGNALS", kind: "TABLE", via: "SQL", use: "Signal status, severity and score" },
    { object: "ORACLE_X.AGENTS.TOOL_GET_EVIDENCE", kind: "PROCEDURE", via: "SQL", use: "Individual source records per claim (DETAIL level, loaded on request)" },
    { object: "ORACLE_X.CORE.ENTITY_NODES", kind: "TABLE", via: "SQL", use: "Entity name and type" },
  ],
  blast: [
    { object: "ORACLE_X.INTEL.BLAST_RADIUS_CACHE", kind: "TABLE", via: "SQL", use: "Summary impact metrics with methodology, and impacted entities within 2 steps (path, exposure, impact score)" },
    { object: "ORACLE_X.CORE.ENTITY_NODES", kind: "TABLE", via: "SQL", use: "Names of impacted entities" },
  ],
  scenarios: [
    { object: "ORACLE_X.CASES.SCENARIO_RUNS", kind: "TABLE", via: "SQL", use: "Latest stored DO NOTHING / MONITOR / BLOCK results, narratives and assumptions (SCENARIO OUTPUT)" },
    { object: "ORACLE_X.AGENTS.TOOL_RUN_SCENARIOS", kind: "PROCEDURE", via: "SQL", use: "Re-run the deterministic scenario comparison (on request only; stores a new run)" },
    { object: "ORACLE_X.CORE.ENTITY_NODES", kind: "TABLE", via: "SQL", use: "Entity name and type" },
  ],
  dna: [
    { object: "ORACLE_X.INTEL.V_RISK_DNA", kind: "VIEW", via: "SQL", use: "Seven-dimension Risk DNA profile per snapshot, with the features it is built from" },
    { object: "ORACLE_X.INTEL.EVIDENCE_SUMMARY_SNAPSHOT", kind: "TABLE", via: "SQL", use: "Evidence claims linked from each dimension (WHY)" },
    { object: "ORACLE_X.INTEL.V_EVIDENCE_BALANCE", kind: "VIEW", via: "SQL", use: "Evidence gaps" },
    { object: "ORACLE_X.INTEL.V_ENTITY_RISK_INTELLIGENCE", kind: "VIEW", via: "SQL", use: "Risk-score dimensions, standard and adjusted" },
  ],
  similar: [
    { object: "ORACLE_X.INTEL.V_SIMILAR_CASE_SCORES", kind: "VIEW", via: "SQL", use: "Backend cosine similarity of Risk DNA profiles and rank against every historical case" },
    { object: "ORACLE_X.INTEL.V_SIMILAR_INVESTIGATION_INPUT", kind: "VIEW", via: "SQL", use: "Characteristic flags for the entity and each historical case" },
    { object: "ORACLE_X.INTEL.V_RISK_DNA", kind: "VIEW", via: "SQL", use: "Risk DNA of each historical case" },
    { object: "ORACLE_X.CASES.INVESTIGATIONS", kind: "TABLE", via: "SQL", use: "Historical case details and outcomes (context only)" },
    { object: "ORACLE_X.CASES.EVIDENCE_ITEMS", kind: "TABLE", via: "SQL", use: "Evidence recorded in historical cases" },
    { object: "ORACLE_X.INTEL.BLAST_RADIUS_CACHE", kind: "TABLE", via: "SQL", use: "Whether a historical subject is connected to the entity today" },
  ],
  cases: [
    { object: "ORACLE_X.CASES.COUNCIL_RUNS", kind: "TABLE", via: "SQL", use: "Council runs and the stored nine-section final report" },
    { object: "ORACLE_X.CASES.COUNCIL_TRANSCRIPTS", kind: "TABLE", via: "SQL", use: "Specialist briefs for one run" },
    { object: "ORACLE_X.CASES.CASE_FILES", kind: "TABLE", via: "SQL", use: "Historical case files" },
    { object: "ORACLE_X.CASES.INVESTIGATIONS", kind: "TABLE", via: "SQL", use: "Historical investigation records" },
    { object: "ORACLE_X.CASES.EVIDENCE_ITEMS", kind: "TABLE", via: "SQL", use: "Evidence recorded in historical cases" },
    { object: "ORACLE_X.CASES.CONTRADICTIONS", kind: "TABLE", via: "SQL", use: "Contradictions raised in historical cases" },
    { object: "ORACLE_X.CORE.ENTITY_NODES", kind: "TABLE", via: "SQL", use: "Entity names" },
  ],
  trace: [
    { object: "ORACLE_X.CASES.COUNCIL_RUNS", kind: "TABLE", via: "SQL", use: "Question, mode, status, phase timestamps and final report of each council run" },
    { object: "ORACLE_X.CASES.COUNCIL_TRANSCRIPTS", kind: "TABLE", via: "SQL", use: "Each specialist’s status, timing, tools, tokens and brief" },
    { object: "ORACLE_X.EVAL.V_AGENT_TOOL_CALLS", kind: "VIEW", via: "SQL", use: "Tool calls with outcome class (success / guardrail block / failure) and graph limits — names and outcomes only" },
  ],
  evaluation: [
    { object: "ORACLE_X.EVAL.EVAL_RUNS", kind: "TABLE", via: "SQL", use: "Per-run status, checks passed and AI judge scores" },
    { object: "ORACLE_X.EVAL.EVAL_RESULTS", kind: "TABLE", via: "SQL", use: "Per-criterion results (rule-based and AI judge)" },
    { object: "ORACLE_X.EVAL.EVAL_CASES", kind: "TABLE", via: "SQL", use: "Test situations and their questions" },
  ],
}
