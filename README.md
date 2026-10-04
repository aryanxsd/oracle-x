# ORACLE X

## Enterprise Risk Intelligence & Simulation Engine

ORACLE X is a risk investigation and decision-support system built on Snowflake and Snowflake Cortex Agents.
It does more than produce a risk score. It helps an investigator see why an entity looks risky, what evidence
supports or contradicts that view, what evidence is missing, how the entity is connected to others, how its risk
changed over time, and what different responses would mean. A council of specialist AI agents investigates the
case, a Skeptic agent challenges the findings, and the result is stored as a documented case.

**Live (read-only):** https://oracle-x-two.vercel.app

```
Investigate → Connect → Explain → Challenge → Simulate → Decide → Document
```

In plain language: **find** the entity, **see** what it is connected to, **understand** why it scored the way it
did, **question** that reasoning, **compare** possible responses, **decide** on the next step, and **record**
the whole investigation.

> All data in ORACLE X is **synthetic**. Entities such as M044 ("Harborview") are not real customers, and the
> regulator "SFCA" and its AML policy sections are fictional.

---

## Contents

1. [Overview](#1-overview)
2. [The problem](#2-the-problem)
3. [The solution](#3-the-solution)
4. [Why M044](#4-why-m044)
5. [Core features](#5-core-features)
6. [Investigation workflow](#6-investigation-workflow)
7. [Multi-agent architecture](#7-multi-agent-architecture)
8. [Agent Investigation Council](#8-agent-investigation-council)
9. [Evidence and explainability](#9-evidence-and-explainability)
10. [Entity graph](#10-entity-graph)
11. [Risk intelligence](#11-risk-intelligence)
12. [Historical Time Machine](#12-historical-time-machine)
13. [Risk Blast Radius](#13-risk-blast-radius)
14. [Scenario Simulator](#14-scenario-simulator)
15. [Risk DNA](#15-risk-dna)
16. [Similar Investigations](#16-similar-investigations)
17. [Case Files](#17-case-files)
18. [Agent Trace](#18-agent-trace)
19. [Agent Evaluation](#19-agent-evaluation)
20. [Early Warning Radar](#20-early-warning-radar)
21. [Technical architecture](#21-technical-architecture)
22. [Snowflake architecture](#22-snowflake-architecture)
23. [Data model](#23-data-model)
24. [Security](#24-security)
25. [Public deployment](#25-public-deployment)
26. [Cortex Agent files](#26-cortex-agent-files)
27. [Repository structure](#27-repository-structure)
28. [How we built it](#28-how-we-built-it)
29. [Technology stack](#29-technology-stack)
30. [Local development](#30-local-development)
31. [Testing](#31-testing)
32. [Production verification](#32-production-verification)
33. [3–5 minute demo](#33-35-minute-demo)
34. [Why ORACLE X is different](#34-why-oracle-x-is-different)
35. [Limitations](#35-limitations)
36. [Future work](#36-future-work)
37. [Summary](#37-summary)

---

## 1. Overview

ORACLE X helps an investigator work through a risk case (synthetic banking fraud / AML data) and answer:

- **What happened?** Transactions, wires, devices and relationships behind the signals.
- **Why is the entity risky?** Eight scored risk dimensions, with formulas, weights and policy references.
- **What supports the risk?** Supporting evidence, with source records.
- **What contradicts it?** Legitimate explanations, such as registered suppliers or KYC reviews.
- **What is missing?** Evidence gaps, and which conclusions they block.
- **How do connected entities matter?** A bounded relationship graph and a blast-radius view.
- **How did risk change over time?** Daily history, band changes and the date the pattern started.
- **What would different actions mean?** A DO NOTHING / MONITOR / BLOCK comparison.
- **How did the specialist agents read the case?** Five specialist briefs plus an ORACLE synthesis.
- **How is it documented?** A stored, readable case report.

The system **never issues a fraud verdict**. Every agent definition forbids calling an entity fraudulent or
cleared. Scores and evidence are treated as indicators, not conclusions.

## 2. The problem

Risk investigations are often hard because:

- data is spread across disconnected systems and isolated dashboards;
- risk scores appear without context or explanation;
- following relationships (shared devices, counterparties, networks) is slow;
- contradictory evidence is easy to miss, and missing evidence is often invisible;
- reconstructing how risk changed over time is difficult;
- comparing possible responses is rarely done in a structured way;
- the investigation ends up scattered across tools and notes;
- conclusions produced by AI are hard to audit.

**Traditional:**

> "Entity M044 has a risk score of 66.68."

**ORACLE X:**

> "M044 has a 66.68 standard score and 55.56 adjusted score. Here are the contributing dimensions, evidence
> supporting the claims, contradictory evidence, missing evidence, network relationships, historical changes,
> specialist investigation results, scenario outcomes, and the resulting decision brief."

A bare number cannot be checked, challenged or defended. An explained, evidence-linked investigation can be.

## 3. The solution

ORACLE X brings the investigation into one workflow:

1. **Investigation:** one entity page with score, drivers, evidence and timeline.
2. **Entity relationships:** direct neighbours and bounded multi-step paths.
3. **Risk intelligence:** standard (v1) and double-counting-adjusted (v2) scores across eight dimensions.
4. **Evidence:** every claim broken down into Claim → Data → Calculation → Policy → Source.
5. **Contradictions:** contradicting evidence shown next to supporting evidence, plus a dedicated Skeptic agent.
6. **Historical analysis:** daily risk history, band changes and the date the pattern started.
7. **Scenario simulation:** a deterministic DO NOTHING / MONITOR / BLOCK comparison.
8. **Decision support:** a Decision Brief that pulls the stored results together.
9. **Case documentation:** council reports and historical case files.
10. **Agent observability:** stages, timings, tools, tokens and outcomes for each council run.
11. **Evaluation:** stored rule-based and AI-judge checks of agent answers.

**Snowflake (database `ORACLE_X`) is the single source of truth.** The web app reads the data and calls
existing procedures and agents. It does not re-implement the risk logic.

## 4. Why M044

M044 is the main demonstration entity: a merchant named "Harborview" in the synthetic dataset.

| Value | M044 (synthetic) |
|---|---|
| Standard risk score (v1) | 66.68 |
| Adjusted risk score (v2) | 55.56 |
| Risk band | Elevated |
| Historical dimension | 68.67 → 7.85 after adjustment R1 |
| Network dimension | 61.11 → 33.11 after adjustment R3 |
| Supporting evidence | 14 |
| Contradicting evidence | 18 |
| Neutral evidence | 2 |
| Missing evidence | 8 |
| Connected entities | 249 |
| Modeled amount at risk | $805,229.39 |

*These are synthetic demonstration values from the ORACLE X dataset and model outputs. They are not real
financial or customer data.*

M044 is useful precisely because it is **not** an obvious fraud case. It has more contradicting evidence (18) than
supporting evidence (14), and eight pieces of evidence are still missing. A system that only labels would get it
wrong. A system that investigates has to weigh both sides and say what is still unknown.

## 5. Core features

Each feature below exists in the application (`app/` routes) and reads stored Snowflake objects. Sections 9–20
go into more detail.

| # | Feature | What it does | Why it matters | How an investigator uses it |
|---|---|---|---|---|
| 1 | **Living Entity Graph** (`/graph`) | Interactive graph of direct relationships and bounded paths from a start entity | Risk often lives in connections | Expand neighbours, focus paths through one device or counterparty |
| 2 | **Autonomous Investigation** (`/investigations/[id]`) | One page per entity: risk header, dimension breakdown, WHY panel, evidence panels, Time Machine | All the context in one place | Start here for any entity |
| 3 | **Multi-Agent Investigation Council** | Five Cortex specialist agents plus an orchestrator; the result is stored in `CASES.COUNCIL_RUNS` | Several independent perspectives instead of one answer | Read the stored council report and specialist briefs |
| 4 | **Skeptic / Contradiction Engine** | A dedicated agent that challenges every claim | Stops the first conclusion from being accepted unchecked | Check which claims "survive challenge" |
| 5 | **Explainable Risk Intelligence** (`/risk`) | v1/v2 scores, eight dimensions, weights, formulas, policy references | The score can be audited | See which dimension drives the band, and why v2 differs |
| 6 | **Evidence Chain with WHY** (`/evidence`) | Claim → Data → Calculation → Policy → Source, plus record-level detail on request | Every claim traces back to records | Open a claim and inspect its source records |
| 7 | **Risk Blast Radius** (`/blast-radius`) | Impact metrics and impacted entities within 2 steps | Shows how far the exposure reaches | Gauge scale before choosing a response |
| 8 | **Historical Time Machine** | 30d / 14d / 7d / today snapshots, band changes, pattern start, events | Timing supports or weakens claims | See when behaviour changed |
| 9 | **Scenario Simulator** (`/scenarios`) | Stored DO NOTHING / MONITOR / BLOCK comparison | Makes trade-offs explicit | Compare money at risk against customer disruption |
| 10 | **Evidence Completeness** | Supporting / contradicting / neutral / missing counts, posture and uncertainty | Uncertainty is shown, not hidden | Know what still has to be collected |
| 11 | **Case Files** (`/cases`) | Readable council reports and historical case files, printable | Turns the investigation into a record | Review or print the report |
| 12 | **Early Warning Radar** (`/#radar`) | Scored entities by risk band, plus a leading-indicator alert feed | Decides where to look first | Pick entities from the Command Center |
| 13 | **Risk DNA** (`/risk-dna`) | Seven-dimension risk profile per snapshot | Describes the *kind* of risk pattern | Compare the profile over time |
| 14 | **Similar Investigations** (`/similar-cases`) | Cosine similarity of Risk DNA profiles against historical cases | Historical context | Read similar past cases and their outcomes |
| 15 | **Agent Trace** (`/agent-trace`) | Stages, timing, tools, tokens and outcomes of a council run | Makes the AI process auditable | Check how an answer was produced |
| 16 | **Agent Evaluation** (`/evaluation`) | Stored evaluation runs: rule-based checks and AI-judge scores | Measures answer quality | Inspect per-criterion results |

The **Decision Brief** (`/investigations/[id]/decision-brief`) combines these stored results into one summary
page.

## 6. Investigation workflow

```
 ┌─────────────┐   ┌─────────┐   ┌─────────┐   ┌───────────┐   ┌──────────┐   ┌────────┐   ┌──────────┐
 │ INVESTIGATE │ → │ CONNECT │ → │ EXPLAIN │ → │ CHALLENGE │ → │ SIMULATE │ → │ DECIDE │ → │ DOCUMENT │
 └─────────────┘   └─────────┘   └─────────┘   └───────────┘   └──────────┘   └────────┘   └──────────┘
   M044 page         Graph,        Risk +         Skeptic,        DO NOTHING     Decision      Case File
                     Blast Radius  Evidence WHY   contradictions  MONITOR/BLOCK  Brief
```

1. **Investigate:** start with M044 from the Command Center or the entity search.
2. **Connect:** explore relationships and connected entities in the Entity Graph and Blast Radius.
3. **Explain:** inspect the risk dimensions and the WHY chain behind each claim.
4. **Challenge:** review contradicting and missing evidence and the Skeptic's challenges.
5. **Simulate:** compare **DO NOTHING**, **MONITOR** and **BLOCK**.
6. **Decide:** use the evidence, risk intelligence and scenario results (Decision Brief).
7. **Document:** keep the investigation as a stored council report / case file.

## 7. Multi-agent architecture

```
ORACLE Orchestrator  (ORACLE_X.AGENTS.ORACLE_ORCHESTRATOR)
├── Investigator Agent   (ORACLE_INVESTIGATOR)
├── Risk Analyst Agent   (ORACLE_RISK_ANALYST)
├── Compliance Agent     (ORACLE_COMPLIANCE)
├── Skeptic Agent        (ORACLE_SKEPTIC)
└── Scenario Agent       (ORACLE_SCENARIO)
```

Roles and tools, taken from the agent YAML files:

| Agent | Role | Tools |
|---|---|---|
| **Orchestrator** | Chairs the council. Consults specialists through `consult_specialist` and writes a nine-section synthesis. Queries no data itself except `resolve_entity`. | `TOOL_CONSULT_SPECIALIST`, `TOOL_RESOLVE_ENTITY` |
| **Investigator** | Full investigation: entity resolution, risk state, drivers, supporting / contradicting / missing evidence, graph, policy, sources | `TOOL_RESOLVE_ENTITY`, `TOOL_GET_EVIDENCE`, `TOOL_GET_BOUNDED_GRAPH`; semantic views for risk, time machine, transactions, entities, graph, blast radius, Risk DNA; Cortex Search over policy and compliance evidence |
| **Risk Analyst** | Analyses v1 and v2 scores and all eight dimensions independently, plus the timeline, network, exposure and model sensitivities | Semantic views (risk, time machine, transactions, graph, blast radius), `TOOL_GET_EVIDENCE`, `TOOL_GET_BOUNDED_GRAPH` |
| **Compliance** | Checks which SFCA policy sections apply (MET / NOT MET / CANNOT DETERMINE), separates FILED from DRAFT SARs, and lists missing regulatory evidence | Cortex Search (policy, compliance evidence), `TOOL_GET_EVIDENCE`, risk semantic view |
| **Skeptic** | Challenges claims: alternative explanations, unsupported claims, evidence quality, logical inconsistencies | `TOOL_GET_EVIDENCE`, `TOOL_GET_BOUNDED_GRAPH`, Cortex Search, semantic views (risk, time machine, Risk DNA similarity) |
| **Scenario** | Compares DO_NOTHING / MONITOR / BLOCK, using only the deterministic scenario procedure | `TOOL_RUN_SCENARIOS`, blast-radius and risk semantic views |

The agents use `claude-opus-5-5` (Orchestrator, Investigator, Skeptic) or `claude-sonnet-4-5` (Risk Analyst,
Compliance, Scenario) as their orchestration model, with time and token budgets set per agent.

## 8. Agent Investigation Council

The council is started by the backend procedure `ORACLE_X.AGENTS.SP_RUN_COUNCIL`, which runs asynchronously in
phases (`execution_mode = 'PHASED_ASYNC'`). The app polls `CASES.COUNCIL_RUNS` and `CASES.COUNCIL_TRANSCRIPTS`
for progress and shows six stages:

1. **Investigator:** gathers facts, model outputs, narrative evidence and policy.
2. **Risk Analyst:** verifies the score on its own (it gets no context, so it stays independent).
3. **Compliance:** tests policy applicability and verifies compliance claims against records.
4. **Skeptic:** challenges everything found so far.
5. **Scenario:** produces the DO NOTHING / MONITOR / BLOCK comparison.
6. **ORACLE synthesis:** the Orchestrator writes one nine-section report from the specialist outputs, without
   calling tools again. It keeps provenance labels and shows disagreements rather than averaging them away.

Each specialist begins with a structured **COUNCIL BRIEF** (Conclusions, Supporting evidence, Contradictions,
Missing evidence, Sources).

**Why the Skeptic matters.** The Skeptic assumes every claim may be wrong until it is verified against Snowflake
records. It searches for contradicting evidence, proposes the strongest legitimate explanation for each signal,
flags claims based only on name similarity or a single indicator, checks whether graph links actually coexisted
in time, and rates evidence quality. Its output ends with "Claims that survive challenge" and "Claims that do not
survive challenge". The Orchestrator's protocol requires the Skeptic to be consulted before any finding is stated.

## 9. Evidence and explainability

Every material statement carries a **provenance label**:

| Label | Meaning |
|---|---|
| **FACT** | Raw records (transactions, wires, KYC, devices, edges) with table and record id |
| **MODEL OUTPUT** | Scores, bands, dimension scores, similarity, blast-radius metrics, evidence weights |
| **POLICY** | A fictional SFCA policy section (id and title) |
| **NARRATIVE EVIDENCE** | Analyst notes, KYC notes, SAR narratives (FILED vs DRAFT_NOT_FILED), case files |
| **SCENARIO OUTPUT** | Results of the scenario comparison: projections under stated assumptions |

Each risk claim is explained as a chain:

```
Claim → Data → Calculation → Policy → Source
```

(stored in `INTEL.EVIDENCE_SUMMARY_SNAPSHOT`; record-level detail comes from `AGENTS.TOOL_GET_EVIDENCE` when
requested).

Evidence is grouped as **supporting**, **contradicting**, **neutral** and **missing**, and summarised in
`INTEL.V_EVIDENCE_BALANCE` with a posture and an uncertainty measure. ORACLE X deliberately shows uncertainty:
missing evidence is listed together with the conclusion it blocks.

## 10. Entity graph

The graph covers these entity types (from the bounded-graph tool definition): **customers, accounts, merchants,
devices, locations, IP addresses, counterparties and watchlist entries**.

- **Direct relationships** come from `INTEL.V_ENTITY_NEIGHBORS`, with evidence, counts, amounts, timing overlap
  and confidence.
- **Multi-step paths** come from `AGENTS.TOOL_GET_BOUNDED_GRAPH`. A start entity is mandatory; paths can be
  filtered by end entity type or by a "through" entity (for example a shared device).
- **Bounds:** at most **3 hops** and **200 paths** (`lib/graph-limits.ts`). The app's input guards and the backend
  procedure both clamp these limits. Unbounded traversal is not supported by design.
- A `links_coexisted_in_time` flag shows whether the links on a path existed at the same time.
- A relationship is shown as context, **not** as evidence of wrongdoing.

## 11. Risk intelligence

- **Standard score (v1):** a weighted sum of eight dimensions: transaction anomaly, velocity, geographic, device
  clustering, merchant risk, historical deviation, account behaviour and network relationship.
- **Adjusted score (v2):** the same model with **double-counting adjustments** (rules R1–R3) that reduce the
  historical, account-behaviour and network dimensions when they re-count the same underlying facts.
- **Risk band** and its recommended action, from `INTEL.V_RISK_BAND_CONFIG`.
- **Weights, formulas and policy references** for each dimension, from `INTEL.V_RISK_MODEL_CONFIG`.
- **Risk signals**, with status, severity and score, from `INTEL.RISK_SIGNALS`.

For M044 (synthetic), v1 is 66.68 and v2 is 55.56. The difference comes from the adjustments: the historical
dimension drops from 68.67 to 7.85 (R1) and the network dimension from 61.11 to 33.11 (R3). The two scores differ
because v2 removes evidence that would otherwise be counted more than once. Both are shown so the investigator can
see the effect of the adjustment.

## 12. Historical Time Machine

From `INTEL.V_ENTITY_RISK_TIMELINE` and `INTEL.EARLY_WARNING_EVENTS`:

- daily v1 and v2 risk history;
- snapshots at 30 days, 14 days, 7 days and today;
- risk-band changes;
- **pattern start** (the date abnormal behaviour began);
- event markers for important events.

Timing matters: a claim is stronger if the signals started together, and weaker if, for example, the pattern
began before a related event.

## 13. Risk Blast Radius

One entity can affect a wider network. The Blast Radius page reads `INTEL.BLAST_RADIUS_CACHE`. It shows summary
impact metrics (30-day window) with their methodology, and impacted entities within 2 steps, each with path,
exposure and impact score.

| Metric | M044 (synthetic) |
|---|---|
| Direct accounts | 786 |
| Indirect accounts | 340 |
| Customers | 785 |
| Transactions | 1,291 |
| Devices | 220 |
| Connected merchants | 7 |
| Wire volume | $513,555 |
| Card volume | $1,010,953.87 |
| Modeled amount at risk | $805,229.39 |

*Synthetic demonstration values.* "Amount at risk" is exposure, **not** an estimated loss.

## 14. Scenario Simulator

The scenario procedure `AGENTS.TOOL_RUN_SCENARIOS` is deterministic. It compares three responses using existing
approved metrics and stores the results in `CASES.SCENARIO_RUNS`. The app displays the latest stored run.

- **DO NOTHING:** no intervention.
- **MONITOR:** continue monitoring.
- **BLOCK:** block the relevant risk exposure.

Metrics compared include amount at risk, amount prevented, customer disruption, risk-flagged customers,
legitimate-looking volume disrupted, evidence gaps addressed and policy alignment. The assumptions are shown
verbatim. Running a scenario does not change the entity's risk score.

> **Scenario model — not a prediction or certainty.**

## 15. Risk DNA

Risk DNA (`INTEL.V_RISK_DNA`) is an analytical summary of an entity's risk profile across **seven dimensions**
for each snapshot, together with the features it is built from. It shows the dominant patterns, how the profile
changes over time, and how the standard and adjusted risk dimensions compare. It describes a risk pattern; it is
not a personal or human identity profile.

## 16. Similar Investigations

`INTEL.V_SIMILAR_CASE_SCORES` ranks historical cases by **cosine similarity of their Risk DNA profiles**.
`INTEL.V_SIMILAR_INVESTIGATION_INPUT` adds characteristic flags, and the page shows historical case details,
outcomes and evidence (`CASES.INVESTIGATIONS`, `CASES.EVIDENCE_ITEMS`). It also shows whether a historical subject
is connected to the entity today.

> Similarity is not proof that two investigations are the same, and a similar past outcome does not imply the
> same outcome here.

## 17. Case Files

There are two kinds of case documentation:

- **Council reports:** each council run in `CASES.COUNCIL_RUNS` stores the Orchestrator's nine-section final
  report. The specialist briefs for that run come from `CASES.COUNCIL_TRANSCRIPTS`. M044's latest investigation is
  shown this way.
- **Historical case files:** records in `CASES.CASE_FILES`, `CASES.INVESTIGATIONS`, `CASES.EVIDENCE_ITEMS` and
  `CASES.CONTRADICTIONS` (evidence and contradictions raised in past cases).

Reports can be printed from the browser.

## 18. Agent Trace

ORACLE X shows *how* an answer was produced, not only the answer. For each council run, the Agent Trace shows:

- question, mode, status and phase timestamps (`CASES.COUNCIL_RUNS`);
- each specialist's status, timing, tools used, token usage and brief (`CASES.COUNCIL_TRANSCRIPTS`);
- tool calls with outcome class (**success / guardrail block / failure**) and the graph limits applied
  (`EVAL.V_AGENT_TOOL_CALLS`; tool names and outcomes only).

For enterprise use of AI, a conclusion has to be auditable: which tools were called, what failed, and what was
blocked by a guardrail.

## 19. Agent Evaluation

Stored evaluation runs live in `EVAL.EVAL_RUNS` (status, checks passed, AI-judge scores), `EVAL.EVAL_RESULTS`
(per-criterion results, rule-based and AI judge) and `EVAL.EVAL_CASES` (test situations and their questions).

The latest demonstrated evaluation run **passed 41 of 41 checks**, with AI-judge scores of **5/5** on each
demonstrated evaluation dimension. This is one passing run of a defined check suite. It is **not** a claim of
general model accuracy.

## 20. Early Warning Radar

On the Command Center, the radar counts scored entities by risk band (both v1 and the v2 adjusted bands) from
`INTEL.V_ENTITY_RISK_INTELLIGENCE`. Next to it is a leading-indicator alert feed from `INTEL.EARLY_WARNING_EVENTS`
and a list of recent investigations. It is the starting point for proactive work: it shows which entities need
attention before an investigation starts.

## 21. Technical architecture

```
User (browser)
  │  fetch /api/*  — no Snowflake credentials ever reach the browser
  ▼
Next.js 16 / React 19 / TypeScript / Tailwind CSS v4   (client components, server components)
  │
  ▼
Server / API layer  (Next.js route handlers, server-only modules)
  ├─ lib/server/guards.ts        input validation, graph-limit clamping (≤3 hops, ≤200 paths)
  ├─ lib/server/queries.ts       allow-listed SQL with bind parameters against fixed objects
  ├─ lib/server/read-only.ts     public read-only switch (403 on write actions)
  ├─ lib/server/cortex-agent.ts  Cortex Agents REST API (ORACLE_ORCHESTRATOR, streamed)
  └─ lib/snowflake.ts            Snowflake Node.js SDK connection
  │
  ▼
Snowflake  ORACLE_X
  ├── CORE      entity nodes
  ├── INTEL     risk intelligence, evidence, timeline, blast radius, Risk DNA, similarity
  ├── CASES     council runs, transcripts, scenario runs, case files
  ├── EVAL      evaluation runs and agent tool-call view
  ├── AGENTS    Cortex Agents + tool procedures
  ├── SEMANTIC  semantic views used by Cortex Analyst tools
  └── SEARCH    Cortex Search services
```

- **Browser:** renders the screens and calls only `/api/*` routes on the same app.
- **Server/API layer:** the only part that talks to Snowflake. It validates inputs, uses fixed, allow-listed
  queries with bind parameters, and enforces read-only mode. The server modules are marked `server-only`, and a
  test checks that they cannot be imported into client code.
- **Snowflake:** holds all data, the risk models, the procedures and the agents. It is the source of truth.
  `lib/data-sources.ts` documents which Snowflake object backs each screen, and each page shows this under its
  technical details.

## 22. Snowflake architecture

Schemas of the `ORACLE_X` database that this repository references:

| Schema | Responsibility (as referenced in this repo) |
|---|---|
| `RAW` | Source records, e.g. `RAW.SAR_FILINGS` (referenced by the agent instructions) |
| `CORE` | `ENTITY_NODES`: entity identity (name, type) |
| `INTEL` | Risk intelligence: `V_ENTITY_RISK_INTELLIGENCE`, `V_RISK_MODEL_CONFIG`, `V_RISK_BAND_CONFIG`, `V_ENTITY_RISK_TIMELINE`, `V_EVIDENCE_BALANCE`, `V_ENTITY_NEIGHBORS`, `V_RISK_DNA`, `V_SIMILAR_CASE_SCORES`, `V_SIMILAR_INVESTIGATION_INPUT`, `EVIDENCE_SUMMARY_SNAPSHOT`, `RISK_SIGNALS`, `EARLY_WARNING_EVENTS`, `INVESTIGATION_SUBJECTS`, `BLAST_RADIUS_CACHE` |
| `CASES` | `COUNCIL_RUNS`, `COUNCIL_TRANSCRIPTS`, `SCENARIO_RUNS`, `CASE_FILES`, `INVESTIGATIONS`, `EVIDENCE_ITEMS`, `CONTRADICTIONS` |
| `AGENTS` | The six Cortex Agents; procedures `SP_RUN_COUNCIL`, `TOOL_CONSULT_SPECIALIST`, `TOOL_RESOLVE_ENTITY`, `TOOL_GET_EVIDENCE`, `TOOL_GET_BOUNDED_GRAPH`, `TOOL_RUN_SCENARIOS` |
| `SEMANTIC` | Semantic views for the agents' Cortex Analyst tools: `SV_RISK_INTELLIGENCE`, `SV_TIME_MACHINE`, `SV_TRANSACTION_INTELLIGENCE`, `SV_ENTITY_INTELLIGENCE`, `SV_GRAPH_NETWORK`, `SV_BLAST_RADIUS`, `SV_RISK_DNA_SIMILARITY` |
| `SEARCH` | Cortex Search services: `CSS_POLICY_DOCUMENTS` (fictional SFCA policy) and `CSS_COMPLIANCE_EVIDENCE` (analyst notes, KYC reviews, SAR narratives, case evidence) |
| `EVAL` | `EVAL_RUNS`, `EVAL_RESULTS`, `EVAL_CASES`, `V_AGENT_TOOL_CALLS` |

Agent tools run on the warehouse `ORACLE_X_WH`. The Snowflake DDL and data-generation code are **not** included in
this repository. `APP` and `PUBLIC` schemas are not referenced by anything in this repository, so they are not
described here.

## 23. Data model

All data is **synthetic**. This repository references the objects listed in Section 22, not the underlying raw
table definitions. The concepts it represents are:

- **Entities** (`CORE.ENTITY_NODES`): customers, accounts, merchants, devices, locations, IP addresses,
  counterparties and watchlist entries.
- **Transactions and wires:** card transactions and wire transfers over a 90-day window (2026-07-05 to
  2026-10-02), reached through the transaction semantic view.
- **Relationships:** entity-to-entity edges with type, validity dates, confidence and evidence references.
- **Risk signals and risk scores:** `INTEL.RISK_SIGNALS` and `INTEL.V_ENTITY_RISK_INTELLIGENCE` (as of 2026-10-02).
- **Evidence:** `INTEL.EVIDENCE_SUMMARY_SNAPSHOT`, `CASES.EVIDENCE_ITEMS`, and narrative evidence in Cortex Search.
- **Investigations and cases:** `CASES.INVESTIGATIONS`, `CASES.CASE_FILES`, `CASES.CONTRADICTIONS`, council runs.
- **Scenarios:** `CASES.SCENARIO_RUNS`.
- **Policy documents:** fictional SFCA AML sections, searchable through `SEARCH.CSS_POLICY_DOCUMENTS`.

## 24. Security

- **Dedicated read-only service identity** for the public deployment: a Snowflake `SERVICE` user with a
  dedicated read-only role.
- **SELECT only** on the specific tables and views the screens need.
- **USAGE only** on three approved read-only procedures (`TOOL_GET_EVIDENCE`, `TOOL_GET_BOUNDED_GRAPH`,
  `TOOL_RESOLVE_ENTITY`) and on the warehouse. The public role is not granted the council, scenario or agent
  procedures.
- **No browser-side credentials.** Snowflake is reached only from server-only modules.
- **Server-side environment secrets.** Connection settings are server environment variables, never
  `NEXT_PUBLIC_` values. `.env.example` contains names only.
- **Git-ignored secrets:** `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.p8`, `*.key` and `.vercel` are
  ignored.
- **Read-only mode:** with `ORACLE_X_READ_ONLY=true`, council start, scenario re-run and the agent proxy return
  **403** before any Snowflake call, and the UI hides those buttons.
- **Input guards:** parameter validation, and graph limits clamped to 3 hops / 200 paths.
- **No credentials are committed to this repository.**

## 25. Public deployment

**https://oracle-x-two.vercel.app**, hosted on Vercel.

The public deployment is **intentionally read-only**. Judges can explore every stored investigation result:
entity pages, evidence, graph, risk, scenarios, Risk DNA, similar cases, case files, agent trace, evaluation and
the decision brief. Starting a new council, re-running a scenario and asking the agent are **disabled** and
return 403. The public site does not let anyone run a new investigation; it shows results that were already
produced and stored in Snowflake.

## 26. Cortex Agent files

ORACLE X is **not just a Next.js frontend**. The AI investigation layer is made of Snowflake Cortex Agents, and
their definitions are in this repository:

| File | Snowflake object |
|---|---|
| `ORACLE_ORCHESTRATOR.agent.yaml` | `ORACLE_X.AGENTS.ORACLE_ORCHESTRATOR` |
| `ORACLE_INVESTIGATOR.agent.yaml` | `ORACLE_X.AGENTS.ORACLE_INVESTIGATOR` |
| `ORACLE_RISK_ANALYST.agent.yaml` | `ORACLE_X.AGENTS.ORACLE_RISK_ANALYST` |
| `ORACLE_COMPLIANCE.agent.yaml` | `ORACLE_X.AGENTS.ORACLE_COMPLIANCE` |
| `ORACLE_SCENARIO.agent.yaml` | `ORACLE_X.AGENTS.ORACLE_SCENARIO` |
| `ORACLE_SKEPTIC.agent.yaml` | `ORACLE_X.AGENTS.ORACLE_SKEPTIC` |
| `cortex_project/cortex-project.yaml` | Project manifest that maps each YAML (via `..\` relative paths) to its target agent object |

Each agent file defines the agent's orchestration model and budget, its system / orchestration / response
instructions (including guardrails and provenance rules), its tools (procedures, Cortex Analyst semantic views,
Cortex Search services), and the warehouse each tool runs on. They contain no credentials.

With these files, you can see exactly how the agents are told to reason, which tools they may use, and which
limits apply. Deploying them requires the referenced Snowflake objects (procedures, semantic views, search
services). Those are not part of this repository, and nothing here deploys automatically.

## 27. Repository structure

```
oracle-x/                            (repository root)
├── app/                             Next.js App Router pages and API routes
│   ├── page.tsx                     Command Center (+ Early Warning Radar)
│   ├── investigations/              entity investigation + [entityId]/decision-brief
│   ├── graph/  risk/  evidence/  blast-radius/  scenarios/
│   ├── risk-dna/  similar-cases/  similar/  cases/  agent-trace/  trace/  evaluation/
│   └── api/                         route handlers (health, radar, entities/search, investigations/recent,
│                                    risk, evidence, graph, blast-radius, scenarios, risk-dna,
│                                    similar-cases, cases, council, agent-trace, evaluation, agent/ask)
├── components/                      UI by feature (brief, cases, dna, eval, graph, impact,
│                                    investigation, oracle, risk, shell, trace, ui)
├── lib/                             shared types/formatting; lib/server/ = server-only data access
├── __tests__/                       api/, components/, lib/, security/
├── public/
├── cortex_project/
│   └── cortex-project.yaml
├── ORACLE_ORCHESTRATOR.agent.yaml
├── ORACLE_INVESTIGATOR.agent.yaml
├── ORACLE_RISK_ANALYST.agent.yaml
├── ORACLE_COMPLIANCE.agent.yaml
├── ORACLE_SCENARIO.agent.yaml
├── ORACLE_SKEPTIC.agent.yaml
├── AGENTS.md
├── app.yml                          Snowflake App build manifest (not used by the Vercel deployment)
├── package.json  package-lock.json
├── next.config.mjs  postcss.config.mjs  tsconfig.json  vitest.config.mts  components.json
├── .env.example
├── .gitignore
└── README.md
```

## 28. How we built it

The project was built in layers, each one depending on the layer below:

1. **Snowflake data foundation:** a synthetic banking dataset (entities, transactions, wires, KYC, SARs,
   relationships).
2. **Risk intelligence:** an explainable eight-dimension risk model, later a v2 with double-counting adjustments.
3. **Investigation tools:** read-only procedures for entity resolution, evidence and bounded graph traversal,
   plus semantic views and Cortex Search services.
4. **Cortex Agents:** an Investigator agent with strict provenance and no-verdict rules.
5. **Multi-agent council:** Risk Analyst, Compliance, Skeptic and Scenario specialists, plus an Orchestrator and
   a phased, asynchronous council procedure.
6. **Evidence and WHY layer:** Claim → Data → Calculation → Policy → Source, and the evidence balance.
7. **Graph investigation:** neighbours and bounded paths.
8. **Historical analysis:** daily timeline, band changes, pattern start, early-warning events.
9. **Scenario simulation:** the deterministic DO NOTHING / MONITOR / BLOCK procedure.
10. **Case files:** stored council reports and historical cases.
11. **Agent observability:** transcripts and tool-call outcomes.
12. **Agent evaluation:** rule-based and AI-judge evaluation runs.
13. **Next.js application:** a screen for each capability, reading the stored results.
14. **Secure read-only public deployment:** a dedicated read-only service identity and the read-only switch.

Snowflake stays the source of truth so that every number in the UI can be traced to one governed object. The
same logic serves the agents and the app, and nothing is re-calculated in the browser.

## 29. Technology stack

Verified from `package.json`, the agent YAMLs and the code:

- **Next.js 16** (App Router), **React 19**, **TypeScript**, **Tailwind CSS v4**
- **TanStack Query**, **React Flow (`@xyflow/react`)** for the graph, **Recharts** for charts,
  **react-markdown / remark-gfm** for agent reports, **Radix UI** primitives, **lucide-react** icons
- **Snowflake Node.js SDK (`snowflake-sdk`)** and **Snowflake SQL**
- **Snowflake Cortex Agents** (REST API from the app, and agent definitions in YAML)
- **Cortex Analyst** through semantic views (`cortex_analyst_text_to_sql` tools)
- **Cortex Search** (`cortex_search` tools)
- **Snowflake stored procedures** as agent tools
- **Vitest**, **Testing Library**, **jsdom** for tests
- **Vercel** for the public deployment; **Node.js** runtime

## 30. Local development

You need access to a Snowflake account that has the `ORACLE_X` database and objects described above. The app does
not run without them, and they are not included in this repository.

```bash
npm install
cp .env.example .env.local   # then fill in values — never commit .env.local
npm run dev                  # http://localhost:3000
```

Environment variables (from `.env.example`, all server-side):

- `SNOWFLAKE_CONNECTION_NAME`: use a named connection from `~/.snowflake/connections.toml` (option A), **or**
- `SNOWFLAKE_ACCOUNT` / `SNOWFLAKE_ACCOUNT_URL` / `SNOWFLAKE_HOST` / `SNOWFLAKE_USER` / `SNOWFLAKE_PASSWORD`
  (option B)
- `SNOWFLAKE_ROLE`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`
- `ORACLE_X_READ_ONLY`: set to `true` to disable council / scenario / agent actions

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # production build
npm start           # serve the build
```

## 31. Testing

Latest local verification:

- **282 tests passing** (25 test files)
- **TypeScript:** clean (`tsc --noEmit`)
- **Production build:** succeeds
- **npm audit:** 0 vulnerabilities

The test suite (`__tests__/`) covers:

- **API** (`api/`): route behaviour, and the read-only mode returning 403 on write routes.
- **Components** (`components/`): cases, decision brief, Risk DNA, evidence, impact / blast radius,
  investigation, risk, trace.
- **Library** (`lib/`): input guards, graph limits, council stage mapping, evidence, graph, impact,
  investigation, risk, DNA, cases, brief, trace, Snowflake client and REST authentication.
- **Security** (`security/`): server-only modules cannot be imported into client code.

No coverage percentage is claimed.

## 32. Production verification

Final verification of the public deployment:

| Check | Result |
|---|---|
| M044 Investigation | HTTP 200 |
| M044 Decision Brief | HTTP 200 |
| Evidence (incl. WHY detail API) | HTTP 200 |
| Entity Graph (page and API) | HTTP 200 |
| Risk Intelligence | HTTP 200 |
| Scenarios | HTTP 200 |
| Agent Trace | HTTP 200 |
| `POST /api/council` | **403** |
| `POST /api/scenarios` | **403** |
| `POST /api/agent/ask` | **403** |

The 403 responses are intentional. The public deployment is read-only, and these routes return
"This action is disabled in the public read-only deployment."

## 33. 3–5 minute demo

1. **Command Center:** Early Warning Radar band counts and the alert feed.
2. **Open M044** (search "M044" or "Harborview").
3. Show the **55.56 adjusted** vs **66.68 standard** score.
4. Explain why it is **Elevated**: the top dimensions and their contributions.
5. Open **Evidence**.
6. Show **14 supporting / 18 contradicting / 8 missing**, then open one WHY chain.
7. Open the **Entity Graph** and follow a path through a shared device or counterparty.
8. Show the **historical changes** (Time Machine: 30d / 14d / 7d / today, pattern start).
9. Show the **Blast Radius**.
10. Show **DO NOTHING / MONITOR / BLOCK** ("Scenario model — not a prediction or certainty").
11. Show **Risk DNA**.
12. Show **Similar Investigations** (similarity is not proof).
13. Show the **Case File**: the nine-section council report and specialist briefs.
14. Show the **Agent Trace**: stages, timings, tools, outcomes.
15. Finish on the **Decision Brief**.

> "We are not asking AI to simply say whether M044 is fraudulent. We are asking it to investigate the evidence,
> connect the entities, challenge its own assumptions, simulate consequences, and produce a documented decision
> brief."

## 34. Why ORACLE X is different

- **Investigation instead of classification:** no fraud verdict; it reports the evidence state and next steps.
- **Evidence instead of unsupported conclusions:** every claim traces to source records with a provenance label.
- **Contradiction handling:** contradicting and missing evidence are first-class, and a Skeptic agent is built in.
- **Graph context:** bounded relationship paths with timing checks.
- **Historical context:** the risk timeline and the date the pattern started.
- **Scenario comparison:** explicit trade-offs between responses.
- **Multi-agent investigation:** independent specialists, with disagreements kept visible.
- **Agent observability:** a trace of stages, tools and outcomes.
- **Evaluation:** stored, inspectable quality checks.
- **Documented decisions:** stored council reports and case files.

## 35. Limitations

- All data is **synthetic**, and the regulator and policies are fictional.
- The scenario simulator is a deterministic model: **not a prediction or certainty**.
- The public deployment is **read-only**. New council runs, scenario runs and agent questions are disabled there.
- Graph exploration is bounded to **3 hops and 200 paths**.
- Some graph and similarity queries can be slower on a cold warehouse or cache.
- The Snowflake DDL, data generation and procedures are not included in this repository, so the backend cannot be
  rebuilt from this repo alone.
- The evaluation result describes one passing run of a defined check suite, not general accuracy.
- This is a **hackathon prototype**, not a production financial-crime platform.

## 36. Future work

*None of the following is implemented. These are possible next steps.*

- Publish the Snowflake DDL and synthetic-data generation so the full backend can be reproduced.
- Authenticated (non-public) access that allows new council runs.
- Investigator actions such as case assignment, notes and approvals, stored back in Snowflake.
- More evaluation cases and evaluation runs tracked over time.
- Support for more entity types and more scenario options.

## 37. Summary

ORACLE X combines Snowflake's data foundation with Cortex-powered investigation agents to help investigators move
from:

```
Risk Score → Evidence → Relationships → Contradictions → Scenarios → Decision → Case File
```

A score says something might be wrong. ORACLE X shows the evidence, the doubts, the connections, the options and
the record, so a person can make a decision they can defend.
