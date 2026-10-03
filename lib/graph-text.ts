/**
 * Plain-language wording for the backend's own graph fields (presentation only).
 * Every sentence is driven by a value the backend returned; nothing is inferred beyond it.
 */

export const NATURE_TEXT: Record<string, { label: string; why: string }> = {
  STRUCTURAL_OR_DOCUMENTED: {
    label: "Documented relationship",
    why: "This relationship is recorded in the bank’s own records (for example KYC, account or device registration).",
  },
  BEHAVIORAL_OBSERVED: {
    label: "Observed in activity",
    why: "This relationship was observed in transaction or wire activity rather than declared.",
  },
  ADVERSE_OR_UNVERIFIED: {
    label: "Adverse or unverified link",
    why: "This link points toward adverse or unverified information. It needs verification and is not proof of wrongdoing.",
  },
}

const REL_TEXT: Record<string, string> = {
  TRANSACTED_ON_DEVICE: "took payments on device",
  TRANSACTED_WITH_CUSTOMER: "was paid by customer",
  CARD_PRESENT_AT: "had in-store card payments at",
  OPERATES_DEVICE: "operates device",
  WIRED_TO: "sent wires to",
  RECEIVED_WIRE_FROM: "received wires from",
  DOCUMENTED_SUPPLIER: "has documented supplier",
  OWNS_ACCOUNT: "owns account",
  OWNER_OF: "is the owner of",
  AUTHORIZED_SIGNATORY_OF: "is an authorised signatory of",
  LOCATED_AT: "is located at",
  BRANCH_AT: "has a registered branch at",
  SHARED_DEVICE_HISTORY: "shares device history with",
  USES_DEVICE: "uses device",
  USES_IP: "uses IP address",
  DEVICE_SEEN_ON_IP: "was seen on IP address",
  LISTED_AS: "is listed as",
  REPORTED_OWNERSHIP_UNVERIFIED: "is reported (unverified) to be owned by",
  NAME_SIMILARITY_ONLY: "has a similar name to",
}

export function relText(rel: string): string {
  return REL_TEXT[rel] ?? rel.replace(/_/g, " ").toLowerCase()
}

export function relLabel(rel: string): string {
  const t = relText(rel)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Human-readable evidence reference, e.g. "RAW.TRANSACTIONS[merchant_id=M044, device_id=D2750, n=18]". */
export function evidenceText(ref: string): string {
  const m = ref.match(/^RAW\.([A-Z_]+)\[(.*)\]$/)
  if (m) {
    const n = m[2].match(/\bn=(\d+)/)?.[1]
    const table = m[1].replace(/_/g, " ").toLowerCase()
    return n ? `${Number(n).toLocaleString("en-US")} ${table} records` : `${table} records`
  }
  const k = ref.match(/^RAW\.([A-Z_]+):(.+)$/)
  if (k) return `${k[1].replace(/_/g, " ").toLowerCase()} record ${k[2]}`
  return ref
}
