"use client"

import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Route-level error boundary: plain-language message, no stack traces or backend detail. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg py-20 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This screen couldn’t be loaded. Your data in Snowflake is unaffected. Try again in a moment.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
