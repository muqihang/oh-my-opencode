import type { PluginInput } from "@opencode-ai/plugin"
import type { ExperimentalConfig } from "../config/schema"
import { createDynamicTruncator } from "../shared/dynamic-truncator"
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"

const DEFAULT_MAX_TOKENS = 50_000 // ~200k chars
const WEBFETCH_MAX_TOKENS = 10_000 // ~40k chars - web pages need aggressive truncation

const TRUNCATABLE_TOOLS = [
  "grep",
  "Grep",
  "safe_grep",
  "glob",
  "Glob",
  "safe_glob",
  "lsp_diagnostics",
  "ast_grep_search",
  "interactive_bash",
  "Interactive_bash",
  "skill_mcp",
  "webfetch",
  "WebFetch",
]

const TOOL_SPECIFIC_MAX_TOKENS: Record<string, number> = {
  webfetch: WEBFETCH_MAX_TOKENS,
  WebFetch: WEBFETCH_MAX_TOKENS,
}

interface ToolOutputTruncatorOptions {
  experimental?: ExperimentalConfig
}

export function createToolOutputTruncatorHook(ctx: PluginInput, options?: ToolOutputTruncatorOptions) {
  const truncator = createDynamicTruncator(ctx)
  const truncateAll = options?.experimental?.truncate_all_tool_outputs ?? false
  const preserveTruncatedToolOutput =
    options?.experimental?.context_capsules?.preserve_truncated_tool_output ?? false
  const contextCapsulesDir =
    options?.experimental?.context_capsules?.dir ?? ".opencode/context-capsules"

  const toolExecuteAfter = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: unknown }
  ) => {
    if (!truncateAll && !TRUNCATABLE_TOOLS.includes(input.tool)) return
    if (typeof output.output !== 'string') return

    try {
      const raw = output.output
      const targetMaxTokens = TOOL_SPECIFIC_MAX_TOKENS[input.tool] ?? DEFAULT_MAX_TOKENS
      const { result, truncated } = await truncator.truncate(
        input.sessionID,
        raw,
        { targetMaxTokens }
      )
      if (truncated) {
        output.output = result
      }

      if (truncated && preserveTruncatedToolOutput) {
        try {
          // Write full raw output to a capsule file and append a short pointer.
          // Best-effort only: any failure should not break tool execution.
          const baseDir = typeof ctx.directory === "string" ? ctx.directory : ""
          if (!baseDir) return

          const sha256 = createHash("sha256").update(raw, "utf8").digest("hex")
          const capsuleDirAbs = resolve(baseDir, contextCapsulesDir)
          const filePathAbs = join(capsuleDirAbs, `${sha256}.md`)

          await mkdir(capsuleDirAbs, { recursive: true })
          await writeFile(filePathAbs, raw, "utf8")

          let relPath = relative(baseDir, filePathAbs)
          if (sep !== "/") {
            relPath = relPath.split(sep).join("/")
          }

          output.output = `${output.output}\n\n<context_pointer>\npath: ${relPath}\nsha256: ${sha256}\n</context_pointer>`
        } catch {
          // Graceful degradation: skip pointerization on any IO/hash failure
        }
      }
    } catch {
      // Graceful degradation - don't break tool execution
    }
  }

  return {
    "tool.execute.after": toolExecuteAfter,
  }
}
