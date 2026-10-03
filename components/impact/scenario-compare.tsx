"use client"

import { useState } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { BASELINE_META, SCENARIO_LABEL, SCENARIO_METRIC_META, SCENARIO_ORDER, fmtCount, fmtUsd, type ScenarioSet } from "@/lib/impact-types"
import { fmtDate, humanize } from "@/lib/format"
import { cn } from "@/lib/utils"

export const SCENARIO_DISCLAIMER = "Scenario model — not a prediction or certainty."

/** Values the request asked for that TOOL_RUN_SCENARIOS does not produce; listed, never filled in. */
const NOT_PRODUCED = ["Accounts affected", "Transactions affected", "Alternative capacity"]

function value(key: string, v: unknown, meta?: { usd?: boolean; text?: boolean }) {
  if (v == null || v === "") return null
  if (meta?.text || typeof v === "string") return String(v)
  return meta?.usd ? fmtUsd(v) : fmtCount(v)
}

/**
 * DO NOTHING / MONITOR / BLOCK side by side, from CASES.SCENARIO_RUNS (latest stored run) or a fresh
 * AGENTS.TOOL_RUN_SCENARIOS run. Observed facts, model assumptions and scenario outputs are kept
 * in separate, labelled sections. No option is recommended.
 */
export function ScenarioCompare({ entityId, initial }: { entityId: string; initial: ScenarioSet | null }) {
  const [set, setSet] = useState<ScenarioSet | null>(initial)
  const [state, setState] = useState<"idle" | "running" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const rerun = async () => {
    setState("running")
    setError(null)
    try {
      const r = await fetch("/api/scenarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityId }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof j.error === "string" ? j.error : "The scenario run failed")
      setSet(j.scenarios)
      setState("idle")
    } catch (e) {
      setError(e instanceof Error ? e.message : "The scenario run failed")
      setState("error")
    }
  }

  const scenarios = set ? SCENARIO_ORDER.map((n) => set.scenarios.find((s) => s.name === n)).filter((s) => s != null) : []
  const extra = set ? set.scenarios.filter((s) => !SCENARIO_ORDER.includes(s.name as never)) : []
  const all = [...scenarios, ...extra]
  const keys = [...new Set(all.flatMap((s) => Object.keys(s.metrics)))]
  const ordered = [...Object.keys(SCENARIO_METRIC_META).filter((k) => keys.includes(k)), ...keys.filter((k) => !SCENARIO_METRIC_META[k])]
  const numericKeys = ordered.filter((k) => !SCENARIO_METRIC_META[k]?.text && k !== "policy_alignment" && k !== "evidence_posture")
  const textKeys = ordered.filter((k) => !numericKeys.includes(k))
  const scores = all.map((s) => s.simulatedRiskScore)
  const notRescored = all.length > 0 && all.every((s) => s.delta === 0 || s.delta == null)

  return (
    <div className="space-y-6">
      <div role="note" className="flex items-start gap-2 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-3 text-sm font-medium text-fuchsia-900 dark:text-fuchsia-200" data-testid="scenario-disclaimer">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {SCENARIO_DISCLAIMER}
        <span className="font-normal">The comparison shows trade-offs under stated assumptions. It does not recommend an action and is not a finding of fraud or money laundering.</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="scenario-run">
          {set?.runId ? (
            <>
              Run <span className="font-mono">{set.runId}</span> · {fmtDate(set.runAt)}
              {set.runBy && <> · {set.runBy}</>}
            </>
          ) : (
            "No scenario run is stored for this entity yet."
          )}
        </p>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">Runs the backend scenario model and stores the result in Snowflake.</span>
          <Button size="sm" variant="outline" onClick={rerun} disabled={state === "running"}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", state === "running" && "animate-spin")} aria-hidden />
            {state === "running" ? "Running…" : set ? "Re-run scenarios" : "Run scenarios"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {!set || all.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scenario results are available for this entity.</p>
      ) : (
        <>
          <section aria-labelledby="what-could-happen">
            <h3 id="what-could-happen" className="text-base font-semibold">
              What could happen under each action?
            </h3>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              {all.map((s) => (
                <Card key={s.name} data-testid={`scenario-${s.name}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      {SCENARIO_LABEL[s.name]?.label ?? humanize(s.name)} <ProvenanceChip kind="SCENARIO OUTPUT" />
                    </CardTitle>
                    {SCENARIO_LABEL[s.name] && <p className="text-xs text-muted-foreground">{SCENARIO_LABEL[s.name].action}</p>}
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {s.narrative && <p>{s.narrative}</p>}
                    <dl className="space-y-1.5">
                      {["amount_at_risk_next_30d_usd", "amount_at_risk_prevented_usd", "legitimate_customers_disrupted", "legitimate_volume_disrupted_usd"].map((k) => {
                        const v = value(k, s.metrics[k], SCENARIO_METRIC_META[k])
                        return (
                          <div key={k} className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">{SCENARIO_METRIC_META[k].label}</dt>
                            <dd className="font-semibold tabular-nums">{v ?? <span className="font-normal text-muted-foreground">not produced</span>}</dd>
                          </div>
                        )
                      })}
                    </dl>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Side-by-side comparison <ProvenanceChip kind="SCENARIO OUTPUT" />
              </CardTitle>
              <p className="text-sm text-muted-foreground">Every value the scenario model returned. A dash means the model does not produce that value for that action.</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm" data-testid="scenario-table">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Outcome</th>
                    {all.map((s) => (
                      <th key={s.name} className="py-2 pr-4 text-right font-medium">
                        {SCENARIO_LABEL[s.name]?.label ?? humanize(s.name)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {numericKeys.map((k) => (
                    <tr key={k} data-testid={`row-${k}`}>
                      <td className="py-2 pr-4">
                        <span className="mr-1.5">{SCENARIO_METRIC_META[k]?.label ?? humanize(k)}</span>
                        {SCENARIO_METRIC_META[k] && SCENARIO_METRIC_META[k].kind !== "SCENARIO OUTPUT" && <ProvenanceChip kind={SCENARIO_METRIC_META[k].kind} />}
                      </td>
                      {all.map((s) => (
                        <td key={s.name} className="py-2 pr-4 text-right tabular-nums">
                          {value(k, s.metrics[k], SCENARIO_METRIC_META[k]) ?? <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr data-testid="row-risk-score">
                    <td className="py-2 pr-4">
                      <span className="mr-1.5">Risk score</span> <ProvenanceChip kind="MODEL OUTPUT" />
                    </td>
                    {all.map((s, i) => (
                      <td key={s.name} className="py-2 pr-4 text-right tabular-nums">
                        {scores[i] ?? "—"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              {notRescored && <p className="mt-2 text-xs text-muted-foreground">The risk score is the same in every scenario: the scenario model does not re-score the entity.</p>}
              {textKeys.length > 0 && (
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {all.map((s) => (
                    <div key={s.name} className="space-y-2 text-sm">
                      <div className="font-medium">{SCENARIO_LABEL[s.name]?.label ?? humanize(s.name)}</div>
                      {textKeys.map((k) =>
                        s.metrics[k] != null ? (
                          <div key={k}>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {SCENARIO_METRIC_META[k]?.label ?? humanize(k)} <ProvenanceChip kind={SCENARIO_METRIC_META[k]?.kind ?? "SCENARIO OUTPUT"} />
                            </div>
                            <p className="mt-0.5" data-testid={`text-${s.name}-${k}`}>
                              {String(s.metrics[k])}
                            </p>
                          </div>
                        ) : null,
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground" data-testid="not-produced">
                Not produced by the scenario model: {NOT_PRODUCED.join(", ").toLowerCase()}. See the blast radius for the accounts and transactions connected to {entityId} today.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="observed-facts">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Observed facts <ProvenanceChip kind="FACT" />
                </CardTitle>
                <p className="text-sm text-muted-foreground">What actually happened in the window, before any scenario is applied.</p>
              </CardHeader>
              <CardContent>
                {set.baseline && Object.keys(set.baseline).length > 0 ? (
                  <dl className="space-y-1.5 text-sm">
                    {Object.entries(set.baseline)
                      .filter(([k]) => k !== "risk_score_source")
                      .map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-3">
                          <dt className="flex items-center gap-1.5 text-muted-foreground">
                            {BASELINE_META[k]?.label ?? humanize(k)}
                            {BASELINE_META[k] && BASELINE_META[k].kind !== "FACT" && <ProvenanceChip kind={BASELINE_META[k].kind} />}
                          </dt>
                          <dd className="font-medium tabular-nums">{value(k, v, BASELINE_META[k]) ?? "—"}</dd>
                        </div>
                      ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The observed baseline (30-day card volume, flagged volume, wires) is returned only when the scenarios are run; it is not stored with past runs. Re-run
                    the scenarios to see it, or open the blast radius for the observed exposure.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card data-testid="model-assumptions">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Model assumptions <ProvenanceChip kind="MODEL OUTPUT" />
                </CardTitle>
                <p className="text-sm text-muted-foreground">What the scenario model assumes. Every scenario output depends on these.</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {set.assumptions ? <p className="whitespace-pre-wrap">{set.assumptions}</p> : <p className="text-muted-foreground">No assumptions were recorded with this run.</p>}
                <p className="text-xs text-muted-foreground">
                  Window {fmtDate(set.windowStart)} – {fmtDate(set.windowEnd)}
                  {set.horizonDays != null && <> · horizon {set.horizonDays} days</>}
                </p>
                {set.provenance && <p className="text-xs text-muted-foreground">{set.provenance}</p>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
