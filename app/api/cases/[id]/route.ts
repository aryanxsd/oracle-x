import { getCaseBriefs, getCaseFile, getCouncilCase } from "@/lib/server/cases"
import { errorResponse, InputError } from "@/lib/server/guards"
import { CASE_FILE_ID_RE, COUNCIL_RUN_ID_RE } from "@/lib/case-types"

export const dynamic = "force-dynamic"

/**
 * GET /api/cases/{id}               council report (id = council run) or historical case file (id = CF-…)
 * GET /api/cases/{id}?part=briefs   parsed specialist briefs for a council report
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = decodeURIComponent((await params).id)
    const part = new URL(req.url).searchParams.get("part")
    if (part != null && part !== "briefs") throw new InputError("Unknown part")
    const headers = { "Cache-Control": "private, max-age=60" }
    if (CASE_FILE_ID_RE.test(id)) {
      if (part) throw new InputError("Briefs are only available for council reports")
      const f = await getCaseFile(id)
      return f ? Response.json(f, { headers }) : Response.json({ error: "Case file not found" }, { status: 404 })
    }
    if (!COUNCIL_RUN_ID_RE.test(id)) throw new InputError("Invalid case id")
    const c = await getCouncilCase(id)
    if (!c) return Response.json({ error: "Case file not found" }, { status: 404 })
    if (part === "briefs") return Response.json({ id, briefs: await getCaseBriefs(id) }, { headers })
    return Response.json(c, { headers })
  } catch (e) {
    return errorResponse(e, "Case file")
  }
}
