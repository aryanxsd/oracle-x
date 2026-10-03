import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

/**
 * Static guarantees that server-side Snowflake code and credentials cannot reach the browser.
 * Client components ("use client") must not import server modules; server modules must be
 * marked server-only so Next.js fails the build if a client imports them.
 */
const ROOT = path.resolve(__dirname, "../..")
const SOURCE_DIRS = ["app", "components", "lib"]

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}
const files = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
const read = (f: string) => fs.readFileSync(f, "utf8")

describe("server-side secret protection", () => {
  it("server modules are marked server-only", () => {
    for (const f of walk(path.join(ROOT, "lib", "server"))) {
      expect(read(f).startsWith('import "server-only"'), path.relative(ROOT, f)).toBe(true)
    }
  })

  it("client components never import Snowflake or server modules", () => {
    const clients = files.filter((f) => /^\s*["']use client["']/.test(read(f)))
    expect(clients.length).toBeGreaterThan(0)
    for (const f of clients) {
      const src = read(f)
      expect(src, path.relative(ROOT, f)).not.toMatch(/from\s+["'](@\/lib\/snowflake|@\/lib\/server\/[^"']+|snowflake-sdk)["']/)
    }
  })

  it("no source file embeds a credential or reads secrets outside lib/snowflake.ts", () => {
    for (const f of files) {
      const src = read(f)
      const rel = path.relative(ROOT, f)
      expect(src, rel).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/)
      expect(src, rel).not.toMatch(/\bver:\d+-hint:/) // PAT format
      if (!rel.endsWith(path.join("lib", "snowflake.ts"))) {
        expect(src, rel).not.toMatch(/process\.env\.SNOWFLAKE_(PASSWORD|SECRET_|PRIVATE_KEY|TOKEN)/)
      }
    }
  })

  it("no NEXT_PUBLIC_ variables expose Snowflake settings to the browser", () => {
    for (const f of files) expect(read(f), path.relative(ROOT, f)).not.toMatch(/NEXT_PUBLIC_SNOWFLAKE/)
  })

  it(".env.local is git-ignored", () => {
    expect(read(path.join(ROOT, ".gitignore"))).toMatch(/^\.env\.local$/m)
  })
})
