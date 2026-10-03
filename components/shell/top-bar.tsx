import { ThemeToggle } from "@/components/theme-toggle"
import { EntitySearch } from "@/components/shell/entity-search"
import { ConnectionStatus } from "@/components/shell/connection-status"
import { MobileNav } from "@/components/shell/mobile-nav"
import { AS_OF_DATE } from "@/lib/constants"

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <MobileNav />
        <div className="min-w-0 max-w-xl flex-1">
          <EntitySearch />
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span className="hidden xl:inline">Risk as of {AS_OF_DATE}</span>
          <span className="hidden md:inline-flex">
            <ConnectionStatus />
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
