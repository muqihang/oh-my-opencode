import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadClaudeHooksConfig } from "./config"

describe("loadClaudeHooksConfig", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "omo-claude-hooks-"))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test("loads project-local .claude/settings.json from provided directory", async () => {
    //#given
    const marker = `__omo_marker_${Date.now()}__`
    const claudeDir = join(tempDir, ".claude")
    mkdirSync(claudeDir, { recursive: true })

    const settingsPath = join(claudeDir, "settings.json")
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: "*",
                hooks: [{ type: "command", command: marker }],
              },
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    )

    //#when
    const config = await loadClaudeHooksConfig({
      directory: tempDir,
      claudeConfigDir: join(tempDir, "__empty_claude_config_dir__"),
    })

    //#then
    expect(config?.PreToolUse?.[0]?.hooks?.[0]?.command).toBe(marker)
  })
})

