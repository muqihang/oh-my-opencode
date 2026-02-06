import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadOpencodeProjectCommands, loadProjectCommands } from "./loader"

describe("claude-code-command-loader directory resolution", () => {
  let tempDir: string
  let originalCwd: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "omo-command-loader-"))
    originalCwd = process.cwd()
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { recursive: true, force: true })
  })

  test("prefers explicit directory over process.cwd() for project command sources", async () => {
    // #given an isolated directory A (cwd does not matter)
    const dirA = join(tempDir, "A")
    mkdirSync(dirA, { recursive: true })

    const projectCommandsDir = join(dirA, ".claude", "commands")
    mkdirSync(projectCommandsDir, { recursive: true })
    writeFileSync(
      join(projectCommandsDir, "zz-project-command.md"),
      "---\ndescription: project command\n---\nProject command body\n",
      "utf8",
    )

    const opencodeProjectCommandsDir = join(dirA, ".opencode", "command")
    mkdirSync(opencodeProjectCommandsDir, { recursive: true })
    writeFileSync(
      join(opencodeProjectCommandsDir, "zz-opencode-command.md"),
      "---\ndescription: opencode project command\n---\nOpencode project command body\n",
      "utf8",
    )

    // #when explicit directory is provided
    const scopedProjectCommands = await loadProjectCommands(dirA)
    const scopedOpencodeProjectCommands = await loadOpencodeProjectCommands(dirA)

    // #then commands are resolved from A
    expect(Object.keys(scopedProjectCommands)).toContain("zz-project-command")
    expect(Object.keys(scopedOpencodeProjectCommands)).toContain("zz-opencode-command")
  })
})
