import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadProjectAgents } from "./loader"

describe("claude-code-agent-loader directory resolution", () => {
  let tempDir: string
  let originalCwd: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "omo-agent-loader-"))
    originalCwd = process.cwd()
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { recursive: true, force: true })
  })

  test("prefers explicit directory over process.cwd() for project agents", () => {
    // #given an isolated directory A (cwd does not matter)
    const dirA = join(tempDir, "A")
    mkdirSync(dirA, { recursive: true })

    const projectAgentsDir = join(dirA, ".claude", "agents")
    mkdirSync(projectAgentsDir, { recursive: true })
    writeFileSync(
      join(projectAgentsDir, "zz-project-agent.md"),
      "---\nname: zz-project-agent\ndescription: project agent\n---\nYou are project agent\n",
      "utf8",
    )

    // #when explicit directory is provided
    const scopedProjectAgents = loadProjectAgents(dirA)

    // #then agents are resolved from A
    expect(Object.keys(scopedProjectAgents)).toContain("zz-project-agent")
  })
})
