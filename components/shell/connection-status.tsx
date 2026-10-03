"use client"

import { useQuery } from "@tanstack/react-query"
import { cn } from "@/lib/utils"

/** Small indicator that the server can reach Snowflake (/api/health). */
export function ConnectionStatus() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const r = await fetch("/api/health")
      if (!r.ok) throw new Error("down")
      return r.json() as Promise<{ ok: boolean }>
    },
    refetchInterval: 60_000,
  })
  const state = isLoading ? "checking" : isError || !data?.ok ? "offline" : "live"
  return (
    <span className="flex items-center gap-1.5" title="Connection to Snowflake">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          state === "live" && "bg-band-normal",
          state === "offline" && "bg-band-critical",
          state === "checking" && "animate-pulse bg-muted-foreground",
        )}
      />
      {state === "live" ? "Snowflake connected" : state === "offline" ? "Snowflake unreachable" : "Connecting…"}
    </span>
  )
}
