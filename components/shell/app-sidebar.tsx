"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAV_GROUPS, NAV_ITEMS, isNavActive } from "@/lib/nav"
import { APP_TAGLINE, APP_TITLE, LOGO_SRC } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-nav text-nav-fg lg:flex">
      <Link href="/" className="flex items-center gap-3 px-5 py-5">
        <Image src={LOGO_SRC} alt="" width={32} height={32} />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-wide">{APP_TITLE}</div>
          <div className="text-xs text-nav-muted">{APP_TAGLINE}</div>
        </div>
      </Link>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((g) => (
          <div key={g} className="mb-3">
            <div className={cn("px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.12em]", g === "Technical" ? "text-nav-muted/70" : "text-nav-muted")}>{g}</div>
            <ul className="space-y-0.5">
              {NAV_ITEMS.filter((i) => i.group === g).map((item) => {
                const active = isNavActive(item.href, pathname)
                const Icon = item.icon
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      title={item.description}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                        active ? "bg-nav-active text-white" : "text-nav-muted hover:bg-nav-active/60 hover:text-nav-fg",
                      )}
                    >
                      <Icon className={cn("h-4 w-4", active ? "text-[#7aa2ff]" : "text-nav-muted group-hover:text-nav-fg")} aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 px-5 py-4 text-xs text-nav-muted">
        Synthetic data · Snowflake is the source of truth
      </div>
    </aside>
  )
}
