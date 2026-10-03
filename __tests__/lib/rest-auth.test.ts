import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getRestApiAuthHeaders, resetTomlConfigCache } from "../../lib/snowflake"

/** REST credential resolution outside SPCS (no /snowflake/session/token, no TOML token file). */
describe("getRestApiAuthHeaders (local)", () => {
  const saved = { ...process.env }
  beforeEach(() => {
    process.env.SNOWFLAKE_HOME = path.join(os.tmpdir(), "oracle-x-no-snowflake-config")
    delete process.env.SNOWFLAKE_CONNECTION_NAME
    delete process.env.SNOWFLAKE_SECRET_ORACLE_X_PAT_SECRET_STRING
    resetTomlConfigCache()
  })
  afterEach(() => {
    process.env = { ...saved }
    resetTomlConfigCache()
  })

  it("uses a programmatic access token supplied through the server-side secret helper", async () => {
    process.env.SNOWFLAKE_SECRET_ORACLE_X_PAT_SECRET_STRING = "pat-value"
    await expect(getRestApiAuthHeaders()).resolves.toEqual({
      Authorization: "Bearer pat-value",
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
    })
  })

  it("fails with a clear server-side error when no REST credential exists", async () => {
    await expect(getRestApiAuthHeaders()).rejects.toThrow(/No Snowflake REST credential/)
  })
})
