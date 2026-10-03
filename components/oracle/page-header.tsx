import type { NavItem } from "@/lib/nav"

export function PageHeader({ item, children }: { item: NavItem; children?: React.ReactNode }) {
  const Icon = item.icon
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{item.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
