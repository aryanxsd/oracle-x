/** Display formatting helpers (presentation only). */

export function fmtScore(v: number | null | undefined, digits = 2): string {
  return v == null || Number.isNaN(v) ? "—" : v.toFixed(digits)
}

export function fmtNumber(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—"
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("en-US")
  if (Math.abs(v) < 1 && v !== 0) return v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

export function fmtShortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

/** TRANSACTION_ANOMALY → "Transaction anomaly" */
export function humanize(key: string | null | undefined): string {
  if (!key) return "—"
  const s = key.replace(/_/g, " ").toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Splits a backend reference list ("A; B | C") into items for display. */
export function splitRefs(s: string | null | undefined): string[] {
  if (!s) return []
  return s.split(/\s*(?:;|\|)\s*/).map((x) => x.trim()).filter(Boolean)
}
