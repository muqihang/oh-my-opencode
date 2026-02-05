import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { loadPluginExtendedConfig } from "./config-loader"

describe("loadPluginExtendedConfig", () => {
  let tempDir: string
  let expectedPattern: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cc-plugin-config-test-"))
    expectedPattern = `__cc_plugin_project_pattern_${Date.now()}__`

    mkdirSync(join(tempDir, ".opencode"), { recursive: true })

    const projectConfigPath = join(tempDir, ".opencode", "opencode-cc-plugin.json")
    writeFileSync(
      projectConfigPath,
      JSON.stringify(
        {
          disabledHooks: {
            PreToolUse: [expectedPattern],
          },
        },
        null,
        2
      )
    )
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch (e) {
      console.error(`Failed to clean up temp dir: ${e}`)
    }
  })

  test("loads project config from provided directory even when user config path is missing", async () => {
    const missingUserConfigPath = join(tempDir, "missing-user-config.json")

    const config = await loadPluginExtendedConfig({
      directory: tempDir,
      userConfigPath: missingUserConfigPath,
    })

    expect(config.disabledHooks?.PreToolUse ?? []).toContain(expectedPattern)
  })
})

