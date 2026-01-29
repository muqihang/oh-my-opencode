import { readFileSync, existsSync } from "node:fs"
import type { CheckResult, CheckDefinition } from "../types"
import { CHECK_IDS, CHECK_NAMES } from "../constants"
import { parseJsonc, detectConfigFile } from "../../../shared"
import {
  AGENT_MODEL_REQUIREMENTS,
  CATEGORY_MODEL_REQUIREMENTS,
  type ModelRequirement,
} from "../../../shared/model-requirements"
import { homedir } from "node:os"
import { join } from "node:path"

function getOpenCodeCacheDir(): string {
  const xdgCache = process.env.XDG_CACHE_HOME
  if (xdgCache) return join(xdgCache, "opencode")
  return join(homedir(), ".cache", "opencode")
}

function loadAvailableModels(): { providers: string[]; modelCount: number; cacheExists: boolean } {
  const cacheFile = join(getOpenCodeCacheDir(), "models.json")
  
  if (!existsSync(cacheFile)) {
    return { providers: [], modelCount: 0, cacheExists: false }
  }

  try {
    const content = readFileSync(cacheFile, "utf-8")
    const data = JSON.parse(content) as Record<string, { models?: Record<string, unknown> }>
    
    const providers = Object.keys(data)
    let modelCount = 0
    for (const providerId of providers) {
      const models = data[providerId]?.models
      if (models && typeof models === "object") {
        modelCount += Object.keys(models).length
      }
    }
    
    return { providers, modelCount, cacheExists: true }
  } catch {
    return { providers: [], modelCount: 0, cacheExists: false }
  }
}

const PACKAGE_NAME = "oh-my-opencode"
const USER_CONFIG_DIR = join(homedir(), ".config", "opencode")
const USER_CONFIG_BASE = join(USER_CONFIG_DIR, PACKAGE_NAME)
const PROJECT_CONFIG_BASE = join(process.cwd(), ".opencode", PACKAGE_NAME)

export interface AgentResolutionInfo {
  name: string
  requirement: ModelRequirement
  userOverride?: string
  effectiveModel: string
  effectiveResolution: string
}

export interface CategoryResolutionInfo {
  name: string
  requirement: ModelRequirement
  userOverride?: string
  effectiveModel: string
  effectiveResolution: string
}

export interface ModelResolutionInfo {
  agents: AgentResolutionInfo[]
  categories: CategoryResolutionInfo[]
}

interface OmoConfig {
  agents?: Record<string, { model?: string }>
  categories?: Record<string, { model?: string }>
}

function loadConfig(): OmoConfig | null {
  const projectDetected = detectConfigFile(PROJECT_CONFIG_BASE)
  if (projectDetected.format !== "none") {
    try {
      const content = readFileSync(projectDetected.path, "utf-8")
      return parseJsonc<OmoConfig>(content)
    } catch {
      return null
    }
  }

  const userDetected = detectConfigFile(USER_CONFIG_BASE)
  if (userDetected.format !== "none") {
    try {
      const content = readFileSync(userDetected.path, "utf-8")
      return parseJsonc<OmoConfig>(content)
    } catch {
      return null
    }
  }

  return null
}

function formatProviderChain(providers: string[]): string {
  return providers.join(" → ")
}

function getEffectiveModel(requirement: ModelRequirement, userOverride?: string): string {
  if (userOverride) {
    return userOverride
  }
  const firstEntry = requirement.fallbackChain[0]
  if (!firstEntry) {
    return "未知"
  }
  return `${firstEntry.providers[0]}/${firstEntry.model}`
}

function buildEffectiveResolution(
  requirement: ModelRequirement,
  userOverride?: string,
): string {
  if (userOverride) {
    return `用户覆盖：${userOverride}`
  }
  const firstEntry = requirement.fallbackChain[0]
  if (!firstEntry) {
    return "未定义回退链"
  }
  return `提供方回退：${formatProviderChain(firstEntry.providers)} → ${firstEntry.model}`
}

export function getModelResolutionInfo(): ModelResolutionInfo {
  const agents: AgentResolutionInfo[] = Object.entries(AGENT_MODEL_REQUIREMENTS).map(
    ([name, requirement]) => ({
      name,
      requirement,
      effectiveModel: getEffectiveModel(requirement),
      effectiveResolution: buildEffectiveResolution(requirement),
    }),
  )

  const categories: CategoryResolutionInfo[] = Object.entries(CATEGORY_MODEL_REQUIREMENTS).map(
    ([name, requirement]) => ({
      name,
      requirement,
      effectiveModel: getEffectiveModel(requirement),
      effectiveResolution: buildEffectiveResolution(requirement),
    }),
  )

  return { agents, categories }
}

export function getModelResolutionInfoWithOverrides(config: OmoConfig): ModelResolutionInfo {
  const agents: AgentResolutionInfo[] = Object.entries(AGENT_MODEL_REQUIREMENTS).map(
    ([name, requirement]) => {
      const userOverride = config.agents?.[name]?.model
      return {
        name,
        requirement,
        userOverride,
        effectiveModel: getEffectiveModel(requirement, userOverride),
        effectiveResolution: buildEffectiveResolution(requirement, userOverride),
      }
    },
  )

  const categories: CategoryResolutionInfo[] = Object.entries(CATEGORY_MODEL_REQUIREMENTS).map(
    ([name, requirement]) => {
      const userOverride = config.categories?.[name]?.model
      return {
        name,
        requirement,
        userOverride,
        effectiveModel: getEffectiveModel(requirement, userOverride),
        effectiveResolution: buildEffectiveResolution(requirement, userOverride),
      }
    },
  )

  return { agents, categories }
}

function formatModelWithVariant(model: string, variant?: string): string {
  return variant ? `${model} (${variant})` : model
}

function getEffectiveVariant(requirement: ModelRequirement): string | undefined {
  const firstEntry = requirement.fallbackChain[0]
  return firstEntry?.variant ?? requirement.variant
}

interface AvailableModelsInfo {
  providers: string[]
  modelCount: number
  cacheExists: boolean
}

function buildDetailsArray(info: ModelResolutionInfo, available: AvailableModelsInfo): string[] {
  const details: string[] = []

  details.push("═══ 可用模型（来自缓存） ═══")
  details.push("")
  if (available.cacheExists) {
    details.push(`  缓存中的 Providers：${available.providers.length}`)
    details.push(`  示例：${available.providers.slice(0, 6).join(", ")}${available.providers.length > 6 ? "..." : ""}`)
    details.push(`  模型总数：${available.modelCount}`)
    details.push(`  缓存位置：~/.cache/opencode/models.json`)
    details.push(`  ℹ 运行时：仅使用已连接的 Providers`)
    details.push(`  刷新：opencode models --refresh`)
  } else {
    details.push("  ⚠ 未找到缓存。请运行 'opencode' 以生成缓存。")
  }
  details.push("")

  details.push("═══ 已配置模型 ═══")
  details.push("")
  details.push("代理：")
  for (const agent of info.agents) {
    const marker = agent.userOverride ? "●" : "○"
    const display = formatModelWithVariant(agent.effectiveModel, getEffectiveVariant(agent.requirement))
    details.push(`  ${marker} ${agent.name}: ${display}`)
  }
  details.push("")
  details.push("分类：")
  for (const category of info.categories) {
    const marker = category.userOverride ? "●" : "○"
    const display = formatModelWithVariant(category.effectiveModel, getEffectiveVariant(category.requirement))
    details.push(`  ${marker} ${category.name}: ${display}`)
  }
  details.push("")
  details.push("● = 用户覆盖，○ = Provider 回退")

  return details
}

export async function checkModelResolution(): Promise<CheckResult> {
  const config = loadConfig() ?? {}
  const info = getModelResolutionInfoWithOverrides(config)
  const available = loadAvailableModels()

  const agentCount = info.agents.length
  const categoryCount = info.categories.length
  const agentOverrides = info.agents.filter((a) => a.userOverride).length
  const categoryOverrides = info.categories.filter((c) => c.userOverride).length
  const totalOverrides = agentOverrides + categoryOverrides

  const overrideNote = totalOverrides > 0 ? `（${totalOverrides} 项覆盖）` : ""
  const cacheNote = available.cacheExists ? `，可用模型 ${available.modelCount} 个` : "，未找到缓存"

  return {
    name: CHECK_NAMES[CHECK_IDS.MODEL_RESOLUTION],
    status: available.cacheExists ? "pass" : "warn",
    message: `${agentCount} 个代理，${categoryCount} 个分类${overrideNote}${cacheNote}`,
    details: buildDetailsArray(info, available),
  }
}

export function getModelResolutionCheckDefinition(): CheckDefinition {
  return {
    id: CHECK_IDS.MODEL_RESOLUTION,
    name: CHECK_NAMES[CHECK_IDS.MODEL_RESOLUTION],
    category: "configuration",
    check: checkModelResolution,
    critical: false,
  }
}
