import { redirect } from "next/navigation"

/** Old shell route; Similar Investigations now lives at /similar-cases. */
export default async function SimilarRedirect({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const e = (await searchParams).entity
  redirect(e && /^[A-Za-z]{1,3}[0-9]{2,6}$/.test(e) ? `/similar-cases?entity=${e.toUpperCase()}` : "/similar-cases")
}
