import { PageHeader } from "@/components/oracle/page-header"
import { ScreenPending } from "@/components/oracle/screen-pending"
import { TechnicalDetails } from "@/components/oracle/technical-details"
import { PAGE_SOURCES, type PageKey } from "@/lib/data-sources"
import { navItem } from "@/lib/nav"

/** Standard shell for a screen not yet wired to data: header, plan, data sources. */
export function ShellPage({
  page,
  title,
  points,
  children,
}: {
  page: PageKey
  title: string
  points: string[]
  children?: React.ReactNode
}) {
  return (
    <>
      <PageHeader item={navItem(page)} />
      <div className="space-y-6">
        {children}
        <ScreenPending title={title} points={points} />
        <TechnicalDetails title="Where this screen’s data comes from" sources={PAGE_SOURCES[page]} />
      </div>
    </>
  )
}
