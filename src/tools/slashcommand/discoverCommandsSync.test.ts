import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { discoverCommandsSync } from "./tools"

describe("discoverCommandsSync", () => {
  let tempDir: string
  let originalCwd: string
  let originalClaudeConfigDir: string | undefined
  let originalOpenCodeConfigDir: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "omo-discoverCommandsSync-"))
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

  test("prefers explicit cwd over process.cwd() for project and opencode-project commands", () => {
    // #given two different directories A and B
    const dirA = join(tempDir, "A")
    const dirB = join(tempDir, "B")
    mkdirSync(dirA, { recursive: true })
    mkdirSync(dirB, { recursive: true })

    // Isolate from user's real config directories
    const emptyClaudeConfigDir = join(tempDir, "empty-claude-config")
    const emptyOpenCodeConfigDir = join(tempDir, "empty-opencode-config")
    mkdirSync(emptyClaudeConfigDir, { recursive: true })
    mkdirSync(emptyOpenCodeConfigDir, { recursive: true })
    process.env.CLAUDE_CONFIG_DIR = emptyClaudeConfigDir
    process.env.OPENCODE_CONFIG_DIR = emptyOpenCodeConfigDir

    // Create commands in A only
    const projectCommandsDir = join(dirA, ".claude", "commands")
    mkdirSync(projectCommandsDir, { recursive: true })
    writeFileSync(
      join(projectCommandsDir, "zz-project-cmd.md"),
      "---\ndescription: project\n---\n# zz-project-cmd\n",
      "utf8",
    )

    const opencodeProjectCommandsDir = join(dirA, ".opencode", "command")
    mkdirSync(opencodeProjectCommandsDir, { recursive: true })
    writeFileSync(
      join(opencodeProjectCommandsDir, "zz-opencode-cmd.md"),
      "---\ndescription: opencode\n---\n# zz-opencode-cmd\n",
      "utf8",
    )

    // #when process.cwd() is switched to B
    process.chdir(dirB)

    // #then discoverCommandsSync() uses process.cwd() and does not see A's commands
    const defaultCommands = discoverCommandsSync()
    expect(defaultCommands.some((cmd) => cmd.name === "zz-project-cmd")).toBe(false)
    expect(defaultCommands.some((cmd) => cmd.name === "zz-opencode-cmd")).toBe(false)

    // #then discoverCommandsSync(A) uses A and sees both commands
    const scopedCommands = discoverCommandsSync(dirA)
    expect(scopedCommands.some((cmd) => cmd.name === "zz-project-cmd")).toBe(true)
    expect(scopedCommands.some((cmd) => cmd.name === "zz-opencode-cmd")).toBe(true)
  })
})

