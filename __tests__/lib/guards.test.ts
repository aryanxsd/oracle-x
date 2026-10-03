import { describe, expect, it, vi } from "vitest"
import { entityId, graphBounds, searchText, question, InputError } from "../../lib/server/guards"

vi.mock("server-only", () => ({}))

describe("guards", () => {
  it("accepts canonical entity ids and normalises case", () => {
    expect(entityId("m044")).toBe("M044")
    expect(entityId("IP04999")).toBe("IP04999")
  })

  it("rejects anything that is not an entity id", () => {
    for (const bad of ["", "M044; DROP TABLE x", "M044'", "../etc", "M"]) {
      expect(() => entityId(bad)).toThrow(InputError)
    }
  })

  it("never widens the backend graph limits", () => {
    expect(graphBounds(15, 100000)).toEqual({ hops: 3, paths: 200 })
    expect(graphBounds(0, 0)).toEqual({ hops: 1, paths: 1 })
    expect(graphBounds(undefined, undefined)).toEqual({ hops: 2, paths: 50 })
  })

  it("bounds free text", () => {
    expect(searchText("  Harborview ")).toBe("Harborview")
    expect(() => searchText("x")).toThrow(InputError)
    expect(() => question("a".repeat(2001))).toThrow(InputError)
  })
})
