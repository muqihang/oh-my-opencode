import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { CheckResult, CheckDefinition, McpServerInfo } from "../types"
import { CHECK_IDS, CHECK_NAMES } from "../constants"
import { parseJsonc } from "../../../shared"

const BUILTIN_MCP_SERVERS = ["context7", "grep_app"]

const MCP_CONFIG_PATHS = [
  join(homedir(), ".claude", ".mcp.json"),
  join(process.cwd(), ".mcp.json"),
  join(process.cwd(), ".claude", ".mcp.json"),
]

interface McpConfig {
  mcpServers?: Record<string, unknown>
}

function loadUserMcpConfig(): Record<string, unknown> {
  const servers: Record<string, unknown> = {}

  for (const configPath of MCP_CONFIG_PATHS) {
    if (!existsSync(configPath)) continue

    try {
      const content = readFileSync(configPath, "utf-8")
      const config = parseJsonc<McpConfig>(content)
      if (config.mcpServers) {
        Object.assign(servers, config.mcpServers)
      }
    } catch {
      // intentionally empty - skip invalid configs
    }
  }

  return servers
}

export function getBuiltinMcpInfo(): McpServerInfo[] {
  return BUILTIN_MCP_SERVERS.map((id) => ({
    id,
    type: "builtin" as const,
    enabled: true,
    valid: true,
  }))
}

export function getUserMcpInfo(): McpServerInfo[] {
  const userServers = loadUserMcpConfig()
  const servers: McpServerInfo[] = []

  for (const [id, config] of Object.entries(userServers)) {
    const isValid = typeof config === "object" && config !== null
    servers.push({
      id,
      type: "user",
      enabled: true,
      valid: isValid,
      error: isValid ? undefined : "配置格式无效",
    })
  }

  return servers
}

export async function checkBuiltinMcpServers(): Promise<CheckResult> {
  const servers = getBuiltinMcpInfo()

  return {
    name: CHECK_NAMES[CHECK_IDS.MCP_BUILTIN],
    status: "pass",
    message: `已启用 ${servers.length} 个内置服务器`,
    details: servers.map((s) => `已启用：${s.id}`),
  }
}

export async function checkUserMcpServers(): Promise<CheckResult> {
  const servers = getUserMcpInfo()

  if (servers.length === 0) {
    return {
      name: CHECK_NAMES[CHECK_IDS.MCP_USER],
      status: "skip",
      message: "未找到用户 MCP 配置",
      details: ["可选：添加 .mcp.json 以配置自定义 MCP 服务器"],
    }
  }

  const invalidServers = servers.filter((s) => !s.valid)
  if (invalidServers.length > 0) {
    return {
      name: CHECK_NAMES[CHECK_IDS.MCP_USER],
      status: "warn",
      message: `有 ${invalidServers.length} 个服务器存在配置问题`,
      details: [
        ...servers.filter((s) => s.valid).map((s) => `有效：${s.id}`),
        ...invalidServers.map((s) => `无效：${s.id} - ${s.error}`),
      ],
    }
  }

  return {
    name: CHECK_NAMES[CHECK_IDS.MCP_USER],
    status: "pass",
    message: `已配置 ${servers.length} 个用户服务器`,
    details: servers.map((s) => `已配置：${s.id}`),
  }
}

export function getMcpCheckDefinitions(): CheckDefinition[] {
  return [
    {
      id: CHECK_IDS.MCP_BUILTIN,
      name: CHECK_NAMES[CHECK_IDS.MCP_BUILTIN],
      category: "tools",
      check: checkBuiltinMcpServers,
      critical: false,
    },
    {
      id: CHECK_IDS.MCP_USER,
      name: CHECK_NAMES[CHECK_IDS.MCP_USER],
      category: "tools",
      check: checkUserMcpServers,
      critical: false,
    },
  ]
}
