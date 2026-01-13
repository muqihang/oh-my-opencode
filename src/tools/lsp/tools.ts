import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { getAllServers } from "./config"
import {
  DEFAULT_MAX_REFERENCES,
  DEFAULT_MAX_SYMBOLS,
  DEFAULT_MAX_DIAGNOSTICS,
} from "./constants"
import {
  withLspClient,
  formatHoverResult,
  formatLocation,
  formatDocumentSymbol,
  formatSymbolInfo,
  formatDiagnostic,
  filterDiagnosticsBySeverity,
  formatPrepareRenameResult,
  formatCodeActions,
  applyWorkspaceEdit,
  formatApplyResult,
} from "./utils"
import type {
  HoverResult,
  Location,
  LocationLink,
  DocumentSymbol,
  SymbolInfo,
  Diagnostic,
  PrepareRenameResult,
  PrepareRenameDefaultBehavior,
  WorkspaceEdit,
  CodeAction,
  Command,
} from "./types"



export const lsp_hover: ToolDefinition = tool({
  description: "获取指定位置符号的类型信息、文档与签名。",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("从 1 开始"),
    character: tool.schema.number().min(0).describe("从 0 开始"),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.hover(args.filePath, args.line, args.character)) as HoverResult | null
      })
      const output = formatHoverResult(result)
      return output
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_goto_definition: ToolDefinition = tool({
  description: "跳转到符号定义位置，定位其定义处。",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("从 1 开始"),
    character: tool.schema.number().min(0).describe("从 0 开始"),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.definition(args.filePath, args.line, args.character)) as
          | Location
          | Location[]
          | LocationLink[]
          | null
      })

      if (!result) {
        const output = "未找到定义"
        return output
      }

      const locations = Array.isArray(result) ? result : [result]
      if (locations.length === 0) {
        const output = "未找到定义"
        return output
      }

      const output = locations.map(formatLocation).join("\n")
      return output
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_find_references: ToolDefinition = tool({
  description: "在整个工作区查找符号的所有引用/使用。",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("从 1 开始"),
    character: tool.schema.number().min(0).describe("从 0 开始"),
    includeDeclaration: tool.schema.boolean().optional().describe("包含定义本身"),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.references(args.filePath, args.line, args.character, args.includeDeclaration ?? true)) as
          | Location[]
          | null
      })

      if (!result || result.length === 0) {
        const output = "未找到引用"
        return output
      }

      const total = result.length
      const truncated = total > DEFAULT_MAX_REFERENCES
      const limited = truncated ? result.slice(0, DEFAULT_MAX_REFERENCES) : result
      const lines = limited.map(formatLocation)
      if (truncated) {
        lines.unshift(`共找到 ${total} 个引用（显示前 ${DEFAULT_MAX_REFERENCES} 个）：`)
      }
      const output = lines.join("\n")
      return output
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_document_symbols: ToolDefinition = tool({
  description: "获取文件内所有符号的层级结构。",
  args: {
    filePath: tool.schema.string(),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.documentSymbols(args.filePath)) as DocumentSymbol[] | SymbolInfo[] | null
      })

      if (!result || result.length === 0) {
        const output = "未找到符号"
        return output
      }

      const total = result.length
      const truncated = total > DEFAULT_MAX_SYMBOLS
      const limited = truncated ? result.slice(0, DEFAULT_MAX_SYMBOLS) : result

      const lines: string[] = []
      if (truncated) {
        lines.push(`共找到 ${total} 个符号（显示前 ${DEFAULT_MAX_SYMBOLS} 个）：`)
      }

      if ("range" in limited[0]) {
        lines.push(...(limited as DocumentSymbol[]).map((s) => formatDocumentSymbol(s)))
      } else {
        lines.push(...(limited as SymbolInfo[]).map(formatSymbolInfo))
      }
      return lines.join("\n")
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_workspace_symbols: ToolDefinition = tool({
  description: "按名称在整个工作区搜索符号。",
  args: {
    filePath: tool.schema.string(),
    query: tool.schema.string().describe("符号名称（模糊匹配）"),
    limit: tool.schema.number().optional().describe("最大结果数"),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.workspaceSymbols(args.query)) as SymbolInfo[] | null
      })

      if (!result || result.length === 0) {
        const output = "未找到符号"
        return output
      }

      const total = result.length
      const limit = Math.min(args.limit ?? DEFAULT_MAX_SYMBOLS, DEFAULT_MAX_SYMBOLS)
      const truncated = total > limit
      const limited = result.slice(0, limit)
      const lines = limited.map(formatSymbolInfo)
      if (truncated) {
        lines.unshift(`共找到 ${total} 个符号（显示前 ${limit} 个）：`)
      }
      const output = lines.join("\n")
      return output
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_diagnostics: ToolDefinition = tool({
  description: "在构建前从语言服务器获取错误、警告和提示。",
  args: {
    filePath: tool.schema.string(),
    severity: tool.schema
      .enum(["error", "warning", "information", "hint", "all"])
      .optional()
      .describe("按严重级别过滤"),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.diagnostics(args.filePath)) as { items?: Diagnostic[] } | Diagnostic[] | null
      })

      let diagnostics: Diagnostic[] = []
      if (result) {
        if (Array.isArray(result)) {
          diagnostics = result
        } else if (result.items) {
          diagnostics = result.items
        }
      }

      diagnostics = filterDiagnosticsBySeverity(diagnostics, args.severity)

      if (diagnostics.length === 0) {
        const output = "未发现诊断信息"
        return output
      }

      const total = diagnostics.length
      const truncated = total > DEFAULT_MAX_DIAGNOSTICS
      const limited = truncated ? diagnostics.slice(0, DEFAULT_MAX_DIAGNOSTICS) : diagnostics
      const lines = limited.map(formatDiagnostic)
      if (truncated) {
        lines.unshift(`共找到 ${total} 条诊断信息（显示前 ${DEFAULT_MAX_DIAGNOSTICS} 条）：`)
      }
      const output = lines.join("\n")
      return output
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_servers: ToolDefinition = tool({
  description: "列出可用的 LSP 服务器及安装状态。",
  args: {},
  execute: async (_args, context) => {
    try {
      const servers = getAllServers()
      const lines = servers.map((s) => {
        if (s.disabled) {
          return `${s.id} [已禁用] - ${s.extensions.join(", ")}`
        }
        const status = s.installed ? "[已安装]" : "[未安装]"
        return `${s.id} ${status} - ${s.extensions.join(", ")}`
      })
      const output = lines.join("\n")
      return output
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_prepare_rename: ToolDefinition = tool({
  description: "检查重命名是否可行，应在 lsp_rename 之前使用。",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("从 1 开始"),
    character: tool.schema.number().min(0).describe("从 0 开始"),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.prepareRename(args.filePath, args.line, args.character)) as
          | PrepareRenameResult
          | PrepareRenameDefaultBehavior
          | null
      })
      const output = formatPrepareRenameResult(result)
      return output
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_rename: ToolDefinition = tool({
  description: "在整个工作区重命名符号，会修改所有相关文件。",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("从 1 开始"),
    character: tool.schema.number().min(0).describe("从 0 开始"),
    newName: tool.schema.string().describe("新符号名称"),
  },
  execute: async (args, context) => {
    try {
      const edit = await withLspClient(args.filePath, async (client) => {
        return (await client.rename(args.filePath, args.line, args.character, args.newName)) as WorkspaceEdit | null
      })
      const result = applyWorkspaceEdit(edit)
      const output = formatApplyResult(result)
      return output
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_code_actions: ToolDefinition = tool({
  description: "获取可用的快速修复、重构与源代码操作（整理导入、全部修复等）。",
  args: {
    filePath: tool.schema.string(),
    startLine: tool.schema.number().min(1).describe("从 1 开始"),
    startCharacter: tool.schema.number().min(0).describe("从 0 开始"),
    endLine: tool.schema.number().min(1).describe("从 1 开始"),
    endCharacter: tool.schema.number().min(0).describe("从 0 开始"),
    kind: tool.schema
      .enum([
        "quickfix",
        "refactor",
        "refactor.extract",
        "refactor.inline",
        "refactor.rewrite",
        "source",
        "source.organizeImports",
        "source.fixAll",
      ])
      .optional()
      .describe("按代码操作类型过滤"),
  },
  execute: async (args, context) => {
    try {
      const only = args.kind ? [args.kind] : undefined
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.codeAction(
          args.filePath,
          args.startLine,
          args.startCharacter,
          args.endLine,
          args.endCharacter,
          only
        )) as (CodeAction | Command)[] | null
      })
      const output = formatCodeActions(result)
      return output
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

export const lsp_code_action_resolve: ToolDefinition = tool({
  description: "解析并执行 lsp_code_actions 返回的代码操作。",
  args: {
    filePath: tool.schema.string(),
    codeAction: tool.schema.string().describe("来自 lsp_code_actions 的代码操作 JSON"),
  },
  execute: async (args, context) => {
    try {
      const codeAction = JSON.parse(args.codeAction) as CodeAction
      const resolved = await withLspClient(args.filePath, async (client) => {
        return (await client.codeActionResolve(codeAction)) as CodeAction | null
      })

      if (!resolved) {
        const output = "解析代码操作失败"
        return output
      }

      const lines: string[] = []
      lines.push(`操作：${resolved.title}`)
      if (resolved.kind) lines.push(`类型：${resolved.kind}`)

      if (resolved.edit) {
        const result = applyWorkspaceEdit(resolved.edit)
        lines.push(formatApplyResult(result))
      } else {
        lines.push("没有可应用的编辑")
      }

      if (resolved.command) {
        lines.push(`命令：${resolved.command.title} (${resolved.command.command}) - 未执行`)
      }

      const output = lines.join("\n")
      return output
    } catch (e) {
      const output = `错误：${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})
