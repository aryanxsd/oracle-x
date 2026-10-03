"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { AlertTriangle, Building2, CreditCard, Globe, Landmark, MapPin, Receipt, ShieldAlert, Smartphone, User } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export const TYPE_STYLE: Record<string, { label: string; icon: LucideIcon; ring: string; bg: string; text: string }> = {
  MERCHANT: { label: "Merchant", icon: Building2, ring: "ring-sky-500/50", bg: "bg-sky-500/10", text: "text-sky-700 dark:text-sky-300" },
  CUSTOMER: { label: "Customer", icon: User, ring: "ring-violet-500/50", bg: "bg-violet-500/10", text: "text-violet-700 dark:text-violet-300" },
  ACCOUNT: { label: "Account", icon: CreditCard, ring: "ring-emerald-500/50", bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300" },
  TRANSACTION: { label: "Transaction", icon: Receipt, ring: "ring-slate-500/50", bg: "bg-slate-500/10", text: "text-slate-700 dark:text-slate-300" },
  DEVICE: { label: "Device", icon: Smartphone, ring: "ring-amber-500/50", bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300" },
  LOCATION: { label: "Location", icon: MapPin, ring: "ring-teal-500/50", bg: "bg-teal-500/10", text: "text-teal-700 dark:text-teal-300" },
  COUNTERPARTY: { label: "Counterparty", icon: Landmark, ring: "ring-indigo-500/50", bg: "bg-indigo-500/10", text: "text-indigo-700 dark:text-indigo-300" },
  IP_ADDRESS: { label: "IP address", icon: Globe, ring: "ring-cyan-500/50", bg: "bg-cyan-500/10", text: "text-cyan-700 dark:text-cyan-300" },
  WATCHLIST_ENTRY: { label: "Watchlist entry", icon: ShieldAlert, ring: "ring-rose-500/50", bg: "bg-rose-500/10", text: "text-rose-700 dark:text-rose-300" },
}
export const typeStyle = (t: string) => TYPE_STYLE[t] ?? { label: t.toLowerCase(), icon: Globe, ring: "ring-slate-500/40", bg: "bg-slate-500/10", text: "text-slate-600" }

export interface EntityNodeData extends Record<string, unknown> {
  id: string
  type: string
  name: string
  flagged: boolean
  center: boolean
  selected: boolean
  dimmed: boolean
}

function EntityNodeImpl({ data }: NodeProps) {
  const d = data as EntityNodeData
  const s = typeStyle(d.type)
  const Icon = s.icon
  return (
    <div
      className={cn(
        "flex max-w-[190px] items-center gap-2 rounded-xl border bg-card px-2.5 py-1.5 shadow-sm ring-2 transition-opacity",
        d.center ? "ring-primary px-3 py-2.5 shadow-md" : s.ring,
        d.selected && "ring-4 ring-primary",
        d.dimmed && "opacity-30",
      )}
      title={`${s.label}: ${d.name}`}
    >
      <Handle type="target" position={Position.Left} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", s.bg, s.text)}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate font-medium leading-tight", d.center ? "text-sm" : "text-xs")}>{d.name}</span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {s.label} · {d.id}
        </span>
      </span>
      {d.flagged && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-band-critical" aria-label="Flagged" />}
      <Handle type="source" position={Position.Right} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  )
}

export const EntityNode = memo(EntityNodeImpl)
