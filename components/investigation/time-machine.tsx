"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RiskBandBadge } from "@/components/oracle/risk-band-badge"
import { ProvenanceChip } from "@/components/oracle/provenance-chip"
import { asBand, type BandRange } from "@/lib/risk-style"
import { fmtDate, fmtScore, fmtShortDate, humanize } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface TimeMachinePoint {
  date: string
  windowLabel: string | null
  overall: number
  band: string
  overallDedup: number | null
  bandDedup: string | null
  bandChanged: boolean
  topDriver: string | null
}

export interface TimeMachineEvent {
  eventId: string
  type?: string
  detectedAt: string | null
  severity: string
  headline: string
  details?: string | null
  isLeadingIndicator: boolean
  relatedSignalIds?: string[]
}

export const SNAPSHOTS = [
  { key: "30_DAYS_AGO", short: "30D", label: "30 days ago" },
  { key: "14_DAYS_AGO", short: "14D", label: "14 days ago" },
  { key: "7_DAYS_AGO", short: "7D", label: "7 days ago" },
  { key: "TODAY", short: "Today", label: "Today" },
] as const

const BAND_FILL: Record<string, string> = {
  CRITICAL: "var(--band-critical)",
  ELEVATED: "var(--band-elevated)",
  WATCH: "var(--band-watch)",
}

const SEVERITY_DOT: Record<string, string> = { HIGH: "bg-band-critical", MEDIUM: "bg-band-elevated", LOW: "bg-band-watch" }
const SEVERITY_FILL: Record<string, string> = { HIGH: "var(--band-critical)", MEDIUM: "var(--band-elevated)", LOW: "var(--band-watch)" }

/**
 * Time Machine over INTEL.V_ENTITY_RISK_TIMELINE + INTEL.EARLY_WARNING_EVENTS. Everything shown is a
 * backend value: daily v1/v2 scores and bands, the 30/14/7/today window labels, band changes, the
 * abnormal-pattern start dates and the recorded events. Band shading uses V_RISK_BAND_CONFIG bounds.
 * Switching snapshots, dates or events is client state only (no refetch).
 */
export function TimeMachine({
  points,
  abnormalStart,
  abnormalStartDedup,
  abnormalBeforeTimelineStart = false,
  events,
  bands,
}: {
  points: TimeMachinePoint[]
  abnormalStart: string | null
  abnormalStartDedup: string | null
  abnormalBeforeTimelineStart?: boolean
  events: TimeMachineEvent[]
  bands: BandRange[]
}) {
  const snapshots = SNAPSHOTS.map((s) => ({ ...s, point: points.find((p) => p.windowLabel === s.key) })).filter((s) => s.point)
  const [selectedDate, setSelectedDate] = useState<string | null>(snapshots.length ? snapshots[snapshots.length - 1].point!.date : (points.at(-1)?.date ?? null))
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)

  const byDate = useMemo(() => new Map(points.map((p) => [p.date, p])), [points])
  const sel = selectedDate ? byDate.get(selectedDate) : undefined
  const activeSnapshot = snapshots.find((s) => s.point!.date === selectedDate)?.key ?? null
  const bandChanges = points.filter((p) => p.bandChanged)
  const ev = events.find((e) => e.eventId === selectedEvent) ?? null
  const yMax = 100
  const shaded = bands.filter((b) => BAND_FILL[b.band]).map((b) => ({ ...b, upper: Math.min(b.upper, yMax) }))
  const ticks = [...new Set([0, ...bands.map((b) => b.lower).filter((v) => v <= yMax), yMax])].sort((a, b) => a - b)

  if (!points.length) return <p className="text-sm text-muted-foreground">No risk history is available for this entity.</p>

  const eventMarks = events
    .map((e) => {
      const d = e.detectedAt?.slice(0, 10)
      const p = d ? byDate.get(d) : undefined
      return p ? { e, date: p.date, y: p.overall } : null
    })
    .filter((x): x is { e: TimeMachineEvent; date: string; y: number } => x !== null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Time Machine <ProvenanceChip kind="MODEL OUTPUT" />
        </CardTitle>
        <PatternStart start={abnormalStart} startDedup={abnormalStartDedup} beforeTimeline={abnormalBeforeTimelineStart} />
      </CardHeader>
      <CardContent className="space-y-5">
        <div role="tablist" aria-label="Snapshot" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {snapshots.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={activeSnapshot === s.key}
              onClick={() => {
                setSelectedDate(s.point!.date)
                setSelectedEvent(null)
              }}
              className={cn("rounded-xl border p-3 text-left transition-colors", activeSnapshot === s.key ? "border-primary bg-primary/5" : "hover:bg-accent")}
            >
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{s.short}</span> · {fmtShortDate(s.point!.date)}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xl font-semibold tabular-nums">{fmtScore(s.point!.overall, 1)}</span>
                {asBand(s.point!.band) && <RiskBandBadge band={asBand(s.point!.band)!} />}
              </div>
              {s.point!.overallDedup != null && <div className="text-xs text-muted-foreground tabular-nums">adjusted {fmtScore(s.point!.overallDedup, 1)}</div>}
            </button>
          ))}
        </div>

        {sel && (
          <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="selected-day">
            On <strong className="text-foreground">{fmtDate(sel.date)}</strong> the score was <strong className="text-foreground">{fmtScore(sel.overall)}</strong> (
            {sel.band.toLowerCase()})
            {sel.overallDedup != null && (
              <>
                ; adjusted {fmtScore(sel.overallDedup)} ({sel.bandDedup?.toLowerCase()})
              </>
            )}
            . Main driver: <strong className="text-foreground">{humanize(sel.topDriver)}</strong>.
            {sel.bandChanged && <> The band changed on this day.</>}
          </p>
        )}

        <div className="h-72 w-full">
          <ResponsiveContainer>
            <LineChart
              data={points}
              margin={{ top: 16, right: 12, left: -12, bottom: 0 }}
              onClick={(s) => {
                const d = s && "activeLabel" in s ? s.activeLabel : undefined
                if (d != null && byDate.has(String(d))) {
                  setSelectedDate(String(d))
                  setSelectedEvent(null)
                }
              }}
            >
              {shaded.map((b) => (
                <ReferenceArea key={b.band} y1={b.lower} y2={b.upper} fill={BAND_FILL[b.band]} fillOpacity={0.07} ifOverflow="hidden" />
              ))}
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} minTickGap={24} />
              <YAxis domain={[0, yMax]} ticks={ticks} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(l) => fmtDate(String(l))}
                formatter={(v, name) => [fmtScore(v == null ? null : Number(v)), name === "overall" ? "Standard (v1)" : "Adjusted (v2)"]}
              />
              {abnormalStart && <ReferenceLine x={abnormalStart} stroke="var(--band-elevated)" strokeDasharray="4 3" label={{ value: "Pattern starts (v1)", fontSize: 11, fill: "var(--band-elevated)", position: "insideTopLeft" }} />}
              {abnormalStartDedup && abnormalStartDedup !== abnormalStart && (
                <ReferenceLine x={abnormalStartDedup} stroke="#6366f1" strokeDasharray="4 3" label={{ value: "v2", fontSize: 11, fill: "#6366f1", position: "insideTopRight" }} />
              )}
              {sel && <ReferenceLine x={sel.date} stroke="var(--primary)" strokeWidth={2} />}
              <Line type="monotone" dataKey="overall" stroke="var(--band-elevated)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="overall" isAnimationActive={false} />
              <Line type="monotone" dataKey="overallDedup" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 4" dot={false} name="overallDedup" isAnimationActive={false} />
              {eventMarks.map((m) => (
                <ReferenceDot
                  key={m.e.eventId}
                  x={m.date}
                  y={m.y}
                  r={selectedEvent === m.e.eventId ? 7 : 5}
                  fill={SEVERITY_FILL[m.e.severity] ?? "var(--muted-foreground)"}
                  stroke="var(--background)"
                  strokeWidth={2}
                  onClick={() => {
                    setSelectedEvent(m.e.eventId)
                    setSelectedDate(m.date)
                  }}
                  style={{ cursor: "pointer" }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-band-elevated" /> Standard score (v1)</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 border-t-2 border-dashed border-indigo-500" /> Adjusted score (v2)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-band-critical" /> Event (click for details)</span>
          {shaded.length > 0 && <span>Shaded bands: {shaded.map((b) => `${humanize(b.band)} ${b.lower}${b.upper >= yMax ? "+" : `–${b.upper}`}`).join(" · ")}</span>}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              Important events <ProvenanceChip kind="FACT" />
            </h3>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No early-warning events are recorded for this entity.</p>
            ) : (
              <ol className="mt-2 space-y-1 text-sm">
                {events.map((e) => (
                  <li key={e.eventId}>
                    <button
                      onClick={() => {
                        setSelectedEvent(e.eventId)
                        const d = e.detectedAt?.slice(0, 10)
                        if (d && byDate.has(d)) setSelectedDate(d)
                      }}
                      aria-pressed={selectedEvent === e.eventId}
                      className={cn("flex w-full gap-2 rounded-lg px-2 py-1 text-left hover:bg-accent", selectedEvent === e.eventId && "bg-primary/5 ring-1 ring-primary/30")}
                    >
                      <span className="w-14 shrink-0 text-muted-foreground">{e.detectedAt ? fmtShortDate(e.detectedAt) : "—"}</span>
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[e.severity] ?? "bg-muted-foreground")} aria-label={`${e.severity} severity`} />
                      <span>
                        {e.headline}
                        {e.isLeadingIndicator && <span className="ml-1 text-xs text-muted-foreground">(early sign)</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            {ev ? (
              <EventDetail e={ev} onClose={() => setSelectedEvent(null)} />
            ) : (
              <>
                <h3 className="text-sm font-medium">Band changes</h3>
                {bandChanges.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">The band did not change in this period.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {bandChanges.map((p) => (
                      <li key={p.date} className="flex items-center gap-2">
                        <button onClick={() => setSelectedDate(p.date)} className="w-14 text-left text-muted-foreground hover:text-foreground hover:underline">
                          {fmtShortDate(p.date)}
                        </button>
                        {asBand(p.band) && <RiskBandBadge band={asBand(p.band)!} />}
                        <span className="text-muted-foreground">driven by {humanize(p.topDriver).toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">Select an event in the list or on the chart to see its details.</p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PatternStart({ start, startDedup, beforeTimeline }: { start: string | null; startDedup: string | null; beforeTimeline: boolean }) {
  if (!start && !startDedup) return <p className="text-sm">No abnormal pattern has been detected in this period.</p>
  return (
    <div className="text-sm" data-testid="pattern-start">
      <p>
        <strong>The abnormal pattern began on {fmtDate(start)}</strong> in the standard model
        {startDedup && (startDedup !== start ? <>, and on <strong>{fmtDate(startDedup)}</strong> in the adjusted model</> : <> (same date in the adjusted model)</>)} — the
        first day after the last Normal score.
      </p>
      {beforeTimeline && <p className="text-xs text-muted-foreground">The pattern may have started before the earliest day in this history.</p>}
    </div>
  )
}

function EventDetail({ e, onClose }: { e: TimeMachineEvent; onClose: () => void }) {
  return (
    <section aria-label="Event details" className="rounded-xl border p-4 text-sm" data-testid="event-detail">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{e.headline}</h3>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground" aria-label="Close event details">
          Close
        </button>
      </div>
      <dl className="mt-3 space-y-2.5">
        <Row term="What happened">{e.details ?? e.headline}</Row>
        <Row term="When">{e.detectedAt ? fmtDate(e.detectedAt) : "Not recorded"}</Row>
        <Row term="Why it matters">
          {humanize(e.type ?? null)} · {humanize(e.severity)} severity
          {e.isLeadingIndicator ? " · flagged by the backend as a leading indicator (an early sign)" : " · not flagged as a leading indicator"}
        </Row>
        <Row term="Source">
          <span className="font-mono text-xs">INTEL.EARLY_WARNING_EVENTS · {e.eventId}</span>
          {e.relatedSignalIds && e.relatedSignalIds.length > 0 && (
            <span className="block text-xs text-muted-foreground">Related risk signals: {e.relatedSignalIds.join(", ")}</span>
          )}
        </Row>
      </dl>
    </section>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}
