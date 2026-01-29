import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CheckResult, CheckDefinition, ConfigInfo } from "../types"
import { CHECK_IDS, CHECK_NAMES, PACKAGE_NAME } from "../constants"
import { parseJsonc, detectConfigFile, getOpenCodeConfigDir } from "../../../shared"
import { OhMyOpenCodeConfigSchema } from "../../../config"

const USER_CONFIG_DIR = getOpenCodeConfigDir({ binary: "opencode" })
const USER_CONFIG_BASE = join(USER_CONFIG_DIR, `${PACKAGE_NAME}`)
const PROJECT_CONFIG_BASE = join(process.cwd(), ".opencode", PACKAGE_NAME)

function findConfigPath(): { path: string; format: "json" | "jsonc" } | null {
  const projectDetected = detectConfigFile(PROJECT_CONFIG_BASE)
  if (projectDetected.format !== "none") {
    return { path: projectDetected.path, format: projectDetected.format as "json" | "jsonc" }
  }

  const userDetected = detectConfigFile(USER_CONFIG_BASE)
  if (userDetected.format !== "none") {
    return { path: userDetected.path, format: userDetected.format as "json" | "jsonc" }
  }

  return null
}

export function validateConfig(configPath: string): { valid: boolean; errors: string[] } {
  try {
    const content = readFileSync(configPath, "utf-8")
    const rawConfig = parseJsonc<Record<string, unknown>>(content)
    const result = OhMyOpenCodeConfigSchema.safeParse(rawConfig)

    if (!result.success) {
      const errors = result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      )
      return { valid: false, errors }
    }

    return { valid: true, errors: [] }
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : "配置解析失败"],
    }
  }
}

export function getConfigInfo(): ConfigInfo {
  const configPath = findConfigPath()

  if (!configPath) {
    return {
      exists: false,
      path: null,
      format: null,
      valid: true,
      errors: [],
    }
  }

  if (!existsSync(configPath.path)) {
    return {
      exists: false,
      path: configPath.path,
      format: configPath.format,
      valid: true,
      errors: [],
    }
  }

  const validation = validateConfig(configPath.path)

  return {
    exists: true,
    path: configPath.path,
    format: configPath.format,
    valid: validation.valid,
    errors: validation.errors,
  }
}

export async function checkConfigValidity(): Promise<CheckResult> {
  const info = getConfigInfo()

  if (!info.exists) {
    return {
      name: CHECK_NAMES[CHECK_IDS.CONFIG_VALIDATION],
      status: "pass",
      message: "使用默认配置",
      details: ["未找到自定义配置文件（可选）"],
    }
  }

  if (!info.valid) {
    return {
      name: CHECK_NAMES[CHECK_IDS.CONFIG_VALIDATION],
      status: "fail",
      message: "配置存在校验错误",
      details: [
        `路径：${info.path}`,
        ...info.errors.map((e) => `错误：${e}`),
      ],
    }
  }

  return {
    name: CHECK_NAMES[CHECK_IDS.CONFIG_VALIDATION],
    status: "pass",
    message: `${info.format?.toUpperCase()} 配置有效`,
    details: [`路径：${info.path}`],
  }
}

export function getConfigCheckDefinition(): CheckDefinition {
  return {
    id: CHECK_IDS.CONFIG_VALIDATION,
    name: CHECK_NAMES[CHECK_IDS.CONFIG_VALIDATION],
    category: "configuration",
    check: checkConfigValidity,
    critical: false,
  }
}
