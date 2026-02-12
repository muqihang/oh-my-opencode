import { join } from "path"
import { existsSync } from "fs"
import { getClaudeConfigDir } from "../../shared"
import type { ClaudeHooksConfig, HookMatcher, HookCommand } from "./types"

export interface LoadClaudeHooksConfigOptions {
  directory?: string
  customSettingsPath?: string
  claudeConfigDir?: string
}

interface RawHookMatcher {
  matcher?: string
  pattern?: string
  hooks: HookCommand[]
}

interface RawClaudeHooksConfig {
  PreToolUse?: RawHookMatcher[]
  PostToolUse?: RawHookMatcher[]
  UserPromptSubmit?: RawHookMatcher[]
  Stop?: RawHookMatcher[]
  PreCompact?: RawHookMatcher[]
}

function normalizeHookMatcher(raw: RawHookMatcher): HookMatcher {
  return {
    matcher: raw.matcher ?? raw.pattern ?? "*",
    hooks: Array.isArray(raw.hooks) ? raw.hooks : [],
  }
}

function normalizeHooksConfig(raw: RawClaudeHooksConfig): ClaudeHooksConfig {
  const result: ClaudeHooksConfig = {}
  const eventTypes: (keyof RawClaudeHooksConfig)[] = [
    "PreToolUse",
    "PostToolUse",
    "UserPromptSubmit",
    "Stop",
    "PreCompact",
  ]

  for (const eventType of eventTypes) {
    if (raw[eventType]) {
      result[eventType] = raw[eventType].map(normalizeHookMatcher)
    }
  }

  return result
}

export function getClaudeSettingsPaths(options: LoadClaudeHooksConfigOptions = {}): string[] {
  const directory = options.directory ?? process.cwd()
  const claudeConfigDir = options.claudeConfigDir ?? getClaudeConfigDir()
  const paths = [
    join(claudeConfigDir, "settings.json"),
    join(directory, ".claude", "settings.json"),
    join(directory, ".claude", "settings.local.json"),
  ]

  const customPath = options.customSettingsPath
  if (customPath && existsSync(customPath)) {
    paths.unshift(customPath)
  }

  // Deduplicate paths to prevent loading the same file multiple times
  // (e.g., when cwd is the home directory)
  return [...new Set(paths)]
}

function mergeHooksConfig(
  base: ClaudeHooksConfig,
  override: ClaudeHooksConfig
): ClaudeHooksConfig {
  const result: ClaudeHooksConfig = { ...base }
  const eventTypes: (keyof ClaudeHooksConfig)[] = [
    "PreToolUse",
    "PostToolUse",
    "UserPromptSubmit",
    "Stop",
    "PreCompact",
  ]
  for (const eventType of eventTypes) {
    if (override[eventType]) {
      result[eventType] = [...(base[eventType] || []), ...override[eventType]]
    }
  }
  return result
}

export async function loadClaudeHooksConfig(
  options: LoadClaudeHooksConfigOptions = {}
): Promise<ClaudeHooksConfig | null> {
  const paths = getClaudeSettingsPaths(options)
  let mergedConfig: ClaudeHooksConfig = {}

  for (const settingsPath of paths) {
    if (existsSync(settingsPath)) {
      try {
        const content = await Bun.file(settingsPath).text()
        const settings = JSON.parse(content) as { hooks?: RawClaudeHooksConfig }
        if (settings.hooks) {
          const normalizedHooks = normalizeHooksConfig(settings.hooks)
          mergedConfig = mergeHooksConfig(mergedConfig, normalizedHooks)
        }
      } catch {
        continue
      }
    }
  }

  return Object.keys(mergedConfig).length > 0 ? mergedConfig : null
}
