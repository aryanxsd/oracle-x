import type { Metadata } from "next"
import type React from "react"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { TopBar } from "@/components/shell/top-bar"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/components/query-provider"
import { APP_TAGLINE, APP_TITLE, LOGO_SRC } from "@/lib/constants"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: APP_TITLE, template: `%s · ${APP_TITLE}` },
  description: `${APP_TITLE} — ${APP_TAGLINE}. Evidence-grounded risk investigation on Snowflake.`,
  icons: { icon: LOGO_SRC },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <QueryProvider>
            <div className="flex min-h-screen">
              <div className="contents print:hidden">
                <AppSidebar />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="contents print:hidden">
                  <TopBar />
                </div>
                <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 print:max-w-none print:p-0">{children}</main>
              </div>
            </div>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
