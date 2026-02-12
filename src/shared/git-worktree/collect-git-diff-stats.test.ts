/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import * as childProcess from "node:child_process"
import * as fs from "node:fs"
import { collectGitDiffStats } from "./collect-git-diff-stats"

describe("collectGitDiffStats", () => {
  afterEach(() => {
    mock.restore()
  })

  test("uses execFileSync with arg arrays (no shell injection)", () => {
    const execSyncMock = spyOn(childProcess, "execSync").mockImplementation(() => {
      throw new Error("execSync should not be called")
    })

    const execFileSyncMock = spyOn(childProcess, "execFileSync").mockImplementation((file, args) => {
      if (file !== "git") throw new Error(`unexpected file: ${file}`)
      const subcommand = args[0]

      if (subcommand === "diff") {
        return "1\t2\tfile.ts\n"
      }

      if (subcommand === "status") {
        return " M file.ts\n?? new-file.ts\n"
      }

      if (subcommand === "ls-files") {
        return "new-file.ts\n"
      }

      throw new Error(`unexpected args: ${args.join(" ")}`)
    })

    const readFileSyncMock = spyOn(fs, "readFileSync").mockImplementation((_path, _encoding) => {
      return "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n"
    })

    //#given
    const directory = "/tmp/safe-repo;touch /tmp/pwn"

    //#when
    const result = collectGitDiffStats(directory)

    //#then
    expect(execSyncMock).not.toHaveBeenCalled()
    expect(execFileSyncMock).toHaveBeenCalledTimes(3)

    const [firstCallFile, firstCallArgs, firstCallOpts] = execFileSyncMock.mock
      .calls[0]! as unknown as [string, string[], { cwd?: string }]
    expect(firstCallFile).toBe("git")
    expect(firstCallArgs).toEqual(["diff", "--numstat", "HEAD"])
    expect(firstCallOpts.cwd).toBe(directory)
    expect(firstCallArgs.join(" ")).not.toContain(directory)

    const [secondCallFile, secondCallArgs, secondCallOpts] = execFileSyncMock.mock
      .calls[1]! as unknown as [string, string[], { cwd?: string }]
    expect(secondCallFile).toBe("git")
    expect(secondCallArgs).toEqual(["status", "--porcelain"])
    expect(secondCallOpts.cwd).toBe(directory)
    expect(secondCallArgs.join(" ")).not.toContain(directory)

    const [thirdCallFile, thirdCallArgs, thirdCallOpts] = execFileSyncMock.mock
      .calls[2]! as unknown as [string, string[], { cwd?: string }]
    expect(thirdCallFile).toBe("git")
    expect(thirdCallArgs).toEqual(["ls-files", "--others", "--exclude-standard"])
    expect(thirdCallOpts.cwd).toBe(directory)
    expect(thirdCallArgs.join(" ")).not.toContain(directory)

    expect(readFileSyncMock).toHaveBeenCalled()

    expect(result).toEqual([
      {
        path: "file.ts",
        added: 1,
        removed: 2,
        status: "modified",
      },
      {
        path: "new-file.ts",
        added: 10,
        removed: 0,
        status: "added",
      },
    ])
  })
})
