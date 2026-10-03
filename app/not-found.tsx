import Link from "next/link"
import { SearchX } from "lucide-react"
import { EntitySearch } from "@/components/shell/entity-search"

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <SearchX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">That entity or page was not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Entity ids look like M044, C04901 or D2750. Search by name or id below, or go back to the{" "}
        <Link href="/" className="font-medium text-primary hover:underline">
          Command Center
        </Link>
        .
      </p>
      <div className="mt-6 text-left">
        <EntitySearch />
      </div>
    </div>
  )
}
