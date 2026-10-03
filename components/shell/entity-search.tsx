"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface Match {
  entityId: string
  name: string
  type: string
  isInvestigationSubject: boolean
}

/**
 * "Investigate an entity" search. Resolves names or ids server-side through
 * /api/entities/search (AGENTS.TOOL_RESOLVE_ENTITY) and opens the investigation.
 */
export function EntitySearch({ size = "md", autoFocus = false }: { size?: "md" | "lg"; autoFocus?: boolean }) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [debounced, setDebounced] = useState("")
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 300)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  const { data, isFetching, isError } = useQuery({
    queryKey: ["entity-search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async (): Promise<Match[]> => {
      const r = await fetch(`/api/entities/search?q=${encodeURIComponent(debounced)}`)
      if (!r.ok) throw new Error("Search failed")
      return (await r.json()).matches
    },
  })

  const go = (id: string) => {
    setOpen(false)
    router.push(`/investigations/${encodeURIComponent(id)}`)
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <label htmlFor={`entity-search-${size}`} className="sr-only">Investigate an entity</label>
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring/40",
          size === "lg" ? "px-4 py-3" : "px-3 py-2",
        )}
      >
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <input
          id={`entity-search-${size}`}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && data?.[0]) go(data[0].entityId)
          }}
          placeholder="Investigate an entity — try “Harborview” or “M044”"
          className={cn("w-full bg-transparent outline-none placeholder:text-muted-foreground", size === "lg" ? "text-base" : "text-sm")}
          autoComplete="off"
        />
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Searching" />}
      </div>

      {open && debounced.length >= 2 && !isFetching && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border bg-popover shadow-lg" role="listbox">
          {isError && <p className="px-4 py-3 text-sm text-destructive">Search is unavailable right now.</p>}
          {!isError && data?.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No matching entity.</p>}
          {data?.map((m) => (
            <button
              key={m.entityId}
              role="option"
              aria-selected={false}
              onClick={() => go(m.entityId)}
              className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm hover:bg-accent"
            >
              <span>
                <span className="font-medium">{m.name}</span>
                <span className="ml-2 text-muted-foreground">{m.entityId}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {m.isInvestigationSubject && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Under investigation</span>}
                {m.type.toLowerCase().replace(/_/g, " ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
