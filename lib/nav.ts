import {
  Bot,
  ClipboardCheck,
  Dna,
  FileText,
  FlaskConical,
  Gauge,
  Network,
  Radar,
  Scale,
  Search,
  Shapes,
  Siren,
  Waypoints,
  type LucideIcon,
} from "lucide-react"
import type { PageKey } from "@/lib/data-sources"

export type NavGroup = "Investigate" | "Analyze" | "Document" | "Technical"

export interface NavItem {
  key: PageKey | "radar"
  label: string
  href: string
  icon: LucideIcon
  /** Plain-language description shown as a tooltip and on page headers. */
  description: string
  group: NavGroup
}

export const NAV_GROUPS: NavGroup[] = ["Investigate", "Analyze", "Document", "Technical"]

export const NAV_ITEMS: NavItem[] = [
  { key: "command", label: "Command Center", href: "/", icon: Radar, description: "What needs attention right now", group: "Investigate" },
  { key: "investigations", label: "Investigations", href: "/investigations", icon: Search, description: "Investigate one entity end to end", group: "Investigate" },
  { key: "radar", label: "Early Warning Radar", href: "/#radar", icon: Siren, description: "Scored entities by risk band", group: "Investigate" },
  { key: "graph", label: "Entity Graph", href: "/graph", icon: Network, description: "Who and what this entity is connected to", group: "Analyze" },
  { key: "risk", label: "Risk Intelligence", href: "/risk", icon: Gauge, description: "How the risk score is built and how it changed", group: "Analyze" },
  { key: "evidence", label: "Evidence", href: "/evidence", icon: Scale, description: "Why each conclusion was reached", group: "Analyze" },
  { key: "blast", label: "Blast Radius", href: "/blast-radius", icon: Waypoints, description: "What else could be affected", group: "Analyze" },
  { key: "scenarios", label: "Scenarios", href: "/scenarios", icon: FlaskConical, description: "Compare Do nothing, Monitor and Block", group: "Analyze" },
  { key: "dna", label: "Risk DNA", href: "/risk-dna", icon: Dna, description: "What kind of risk pattern this entity has", group: "Analyze" },
  { key: "similar", label: "Similar Investigations", href: "/similar-cases", icon: Shapes, description: "Past investigations with a similar risk profile", group: "Analyze" },
  { key: "cases", label: "Case Files", href: "/cases", icon: FileText, description: "Readable investigation reports", group: "Document" },
  { key: "trace", label: "Agent Trace", href: "/agent-trace", icon: Bot, description: "How ORACLE and its specialists reached the answer", group: "Technical" },
  { key: "evaluation", label: "Evaluation", href: "/evaluation", icon: ClipboardCheck, description: "Quality checks on ORACLE's answers", group: "Technical" },
]

export function navItem(key: PageKey): NavItem {
  return NAV_ITEMS.find((n) => n.key === key)!
}

/** Hash links (e.g. /#radar) never mark themselves active; "/" only matches exactly. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href.includes("#")) return false
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
