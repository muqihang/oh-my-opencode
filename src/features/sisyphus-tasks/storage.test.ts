import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { join } from "path"
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "fs"
import { z } from "zod"
import {
  getTaskDir,
  getTaskPath,
  getTeamDir,
  getInboxPath,
  ensureDir,
  readJsonSafe,
  writeJsonAtomic,
} from "./storage"

const TEST_DIR = join(import.meta.dirname, ".test-storage")
let originalCwd = process.cwd()

describe("Storage Utilities", () => {
  beforeEach(() => {
    originalCwd = process.cwd()
    rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  describe("directory-aware path resolution", () => {
    //#given a session directory A
    //#when resolving task dir/path with explicit directory
    //#then it should resolve into A
    it("resolves task dir/path from explicit session directory", () => {
      const sessionDirectory = join(TEST_DIR, "session-A")

      mkdirSync(sessionDirectory, { recursive: true })

      const config = {
        sisyphus: {
          tasks: {
            storage_path: ".sisyphus/tasks",
            enabled: true,
            claude_code_compat: false,
          },
        },
      }

      const taskDir = getTaskDir("list-123", config, { directory: sessionDirectory })
      const taskPath = getTaskPath("list-123", "1", config, { directory: sessionDirectory })

      expect(taskDir).toBe(join(sessionDirectory, ".sisyphus", "tasks", "list-123"))
      expect(taskPath).toBe(join(sessionDirectory, ".sisyphus", "tasks", "list-123", "1.json"))
    })

    //#given a session directory A
    //#when resolving team dir/inbox path with explicit directory
    //#then it should resolve into A
    it("resolves team dir/path from explicit session directory", () => {
      const sessionDirectory = join(TEST_DIR, "session-A")

      mkdirSync(sessionDirectory, { recursive: true })

      const config = {
        sisyphus: {
          swarm: {
            storage_path: ".sisyphus/teams",
            enabled: true,
            ui_mode: "toast" as const,
          },
        },
      }

      const teamDir = getTeamDir("my-team", config, { directory: sessionDirectory })
      const inboxPath = getInboxPath("my-team", "agent-001", config, { directory: sessionDirectory })

      expect(teamDir).toBe(join(sessionDirectory, ".sisyphus", "teams", "my-team"))
      expect(inboxPath).toBe(join(sessionDirectory, ".sisyphus", "teams", "my-team", "inboxes", "agent-001.json"))
    })
  })

  describe("getTaskDir", () => {
    //#given default config (no claude_code_compat)
    //#when getting task directory
    //#then it should return .sisyphus/tasks/{listId}
    it("returns sisyphus path by default", () => {
      const config = { sisyphus: { tasks: { storage_path: ".sisyphus/tasks" } } }
      const result = getTaskDir("list-123", config as any)
      expect(result).toContain(".sisyphus/tasks/list-123")
    })

    //#given claude_code_compat enabled
    //#when getting task directory
    //#then it should return Claude Code path
    it("returns claude code path when compat enabled", () => {
      const config = {
        sisyphus: {
          tasks: {
            storage_path: ".sisyphus/tasks",
            claude_code_compat: true,
          },
        },
      }
      const result = getTaskDir("list-123", config as any)
      expect(result).toContain(".cache/claude-code/tasks/list-123")
    })
  })

  describe("getTaskPath", () => {
    //#given list and task IDs
    //#when getting task path
    //#then it should return path to task JSON file
    it("returns path to task JSON", () => {
      const config = { sisyphus: { tasks: { storage_path: ".sisyphus/tasks" } } }
      const result = getTaskPath("list-123", "1", config as any)
      expect(result).toContain("list-123/1.json")
    })
  })

  describe("getTeamDir", () => {
    //#given team name and default config
    //#when getting team directory
    //#then it should return .sisyphus/teams/{teamName}
    it("returns sisyphus team path", () => {
      const config = { sisyphus: { swarm: { storage_path: ".sisyphus/teams" } } }
      const result = getTeamDir("my-team", config as any)
      expect(result).toContain(".sisyphus/teams/my-team")
    })
  })

  describe("getInboxPath", () => {
    //#given team and agent names
    //#when getting inbox path
    //#then it should return path to inbox JSON file
    it("returns path to inbox JSON", () => {
      const config = { sisyphus: { swarm: { storage_path: ".sisyphus/teams" } } }
      const result = getInboxPath("my-team", "agent-001", config as any)
      expect(result).toContain("my-team/inboxes/agent-001.json")
    })
  })

  describe("ensureDir", () => {
    //#given a non-existent directory path
    //#when calling ensureDir
    //#then it should create the directory
    it("creates directory if not exists", () => {
      const dirPath = join(TEST_DIR, "new-dir", "nested")
      ensureDir(dirPath)
      expect(existsSync(dirPath)).toBe(true)
    })

    //#given an existing directory
    //#when calling ensureDir
    //#then it should not throw
    it("does not throw for existing directory", () => {
      const dirPath = join(TEST_DIR, "existing")
      mkdirSync(dirPath, { recursive: true })
      expect(() => ensureDir(dirPath)).not.toThrow()
    })
  })

  describe("readJsonSafe", () => {
    //#given a valid JSON file matching schema
    //#when reading with readJsonSafe
    //#then it should return parsed object
    it("reads and parses valid JSON", () => {
      const testSchema = z.object({ name: z.string(), value: z.number() })
      const filePath = join(TEST_DIR, "test.json")
      writeFileSync(filePath, JSON.stringify({ name: "test", value: 42 }))

      const result = readJsonSafe(filePath, testSchema)
      expect(result).toEqual({ name: "test", value: 42 })
    })

    //#given a non-existent file
    //#when reading with readJsonSafe
    //#then it should return null
    it("returns null for non-existent file", () => {
      const testSchema = z.object({ name: z.string() })
      const result = readJsonSafe(join(TEST_DIR, "missing.json"), testSchema)
      expect(result).toBeNull()
    })

    //#given invalid JSON content
    //#when reading with readJsonSafe
    //#then it should return null
    it("returns null for invalid JSON", () => {
      const testSchema = z.object({ name: z.string() })
      const filePath = join(TEST_DIR, "invalid.json")
      writeFileSync(filePath, "not valid json")

      const result = readJsonSafe(filePath, testSchema)
      expect(result).toBeNull()
    })

    //#given JSON that doesn't match schema
    //#when reading with readJsonSafe
    //#then it should return null
    it("returns null for schema mismatch", () => {
      const testSchema = z.object({ name: z.string(), required: z.number() })
      const filePath = join(TEST_DIR, "mismatch.json")
      writeFileSync(filePath, JSON.stringify({ name: "test" }))

      const result = readJsonSafe(filePath, testSchema)
      expect(result).toBeNull()
    })
  })

  describe("writeJsonAtomic", () => {
    //#given data to write
    //#when calling writeJsonAtomic
    //#then it should write to file atomically
    it("writes JSON atomically", () => {
      const filePath = join(TEST_DIR, "atomic.json")
      const data = { key: "value", number: 123 }

      writeJsonAtomic(filePath, data)

      const content = readFileSync(filePath, "utf-8")
      expect(JSON.parse(content)).toEqual(data)
    })

    //#given a deeply nested path
    //#when calling writeJsonAtomic
    //#then it should create parent directories
    it("creates parent directories", () => {
      const filePath = join(TEST_DIR, "deep", "nested", "file.json")
      writeJsonAtomic(filePath, { test: true })

      expect(existsSync(filePath)).toBe(true)
    })
  })
})
