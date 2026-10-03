import { Construction } from "lucide-react"
import { Card } from "@/components/ui/card"

/**
 * Placeholder for a screen whose data wiring is scheduled for a later milestone.
 * Shows what the screen will do in plain language — never sample or mock data.
 */
export function ScreenPending({ title, points }: { title: string; points: string[] }) {
  return (
    <Card className="border-dashed p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Construction className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">This screen is part of the application shell. It will be connected to Snowflake in the next milestone.</p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}
