import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { executeSlashCommand } from "./executor"

describe("auto-slash-command executor directory resolution", () => {
  let tempDir: string
  let originalCwd: string
  let originalClaudeConfigDir: string | undefined
  let originalOpenCodeConfigDir: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "omo-auto-slash-executor-"))
    originalCwd = process.cwd()
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    originalOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR
  })

  afterEach(() => {
    process.chdir(originalCwd)

    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
    }

    if (originalOpenCodeConfigDir === undefined) {
      delete process.env.OPENCODE_CONFIG_DIR
    } else {
      process.env.OPENCODE_CONFIG_DIR = originalOpenCodeConfigDir
    }

    rmSync(tempDir, { recursive: true, force: true })
  })

  test("uses explicit directory when cwd differs for project/opencode-project commands", async () => {
    // #given A has project commands (directory override is the signal)
    const dirA = join(tempDir, "A")
    mkdirSync(dirA, { recursive: true })

    const projectCommandsDir = join(dirA, ".claude", "commands")
    mkdirSync(projectCommandsDir, { recursive: true })
    writeFileSync(
      join(projectCommandsDir, "zz-session-project.md"),
      "---\ndescription: from session directory\n---\nRun project command from session directory\n",
      "utf8",
    )

    const opencodeProjectCommandsDir = join(dirA, ".opencode", "command")
    mkdirSync(opencodeProjectCommandsDir, { recursive: true })
    writeFileSync(
      join(opencodeProjectCommandsDir, "zz-session-opencode.md"),
      "---\ndescription: opencode from session directory\n---\nRun opencode command from session directory\n",
      "utf8",
    )

    const emptyClaudeConfigDir = join(tempDir, "empty-claude-config")
    const emptyOpenCodeConfigDir = join(tempDir, "empty-opencode-config")
    mkdirSync(emptyClaudeConfigDir, { recursive: true })
    mkdirSync(emptyOpenCodeConfigDir, { recursive: true })
    process.env.CLAUDE_CONFIG_DIR = emptyClaudeConfigDir
    process.env.OPENCODE_CONFIG_DIR = emptyOpenCodeConfigDir

    // #when directory option points to A
    const scopedProjectResult = await executeSlashCommand({
      command: "zz-session-project",
      args: "",
      raw: "/zz-session-project",
    }, {
      skills: [],
      directory: dirA,
    })

    const scopedOpencodeResult = await executeSlashCommand({
      command: "zz-session-opencode",
      args: "",
      raw: "/zz-session-opencode",
    }, {
      skills: [],
      directory: dirA,
    })

    // #then both commands resolve correctly from session directory A
    expect(scopedProjectResult.success).toBe(true)
    expect(scopedProjectResult.replacementText).toContain("Run project command from session directory")
    expect(scopedOpencodeResult.success).toBe(true)
    expect(scopedOpencodeResult.replacementText).toContain("Run opencode command from session directory")
  })
})
