import type { PluginInput } from "@opencode-ai/plugin"

export interface DelegateTaskErrorPattern {
  pattern: string
  errorType: string
  fixHint: string
}

export const DELEGATE_TASK_ERROR_PATTERNS: DelegateTaskErrorPattern[] = [
  {
    pattern: "run_in_background",
    errorType: "missing_run_in_background",
    fixHint: "添加 run_in_background=false（用于委派）或 run_in_background=true（用于并行探索）",
  },
  {
    pattern: "load_skills",
    errorType: "missing_load_skills",
    fixHint: "添加 load_skills=[] 参数（若不需要技能则传空数组）。注意：调用 Skill 工具不会自动填充该字段。",
  },
  {
    pattern: "category OR subagent_type",
    errorType: "mutual_exclusion",
    fixHint: "只能二选一：category（如 'general'、'quick'）或 subagent_type（如 'oracle'、'explore'）",
  },
  {
    pattern: "Must provide either category or subagent_type",
    errorType: "missing_category_or_agent",
    fixHint: "添加 category='general' 或 subagent_type='explore'（二选一）",
  },
  {
    pattern: "Unknown category",
    errorType: "unknown_category",
    fixHint: "从错误信息中的 Available 列表里选择一个有效的 category",
  },
  {
    pattern: "Agent name cannot be empty",
    errorType: "empty_agent",
    fixHint: "提供一个非空的 subagent_type 值",
  },
  {
    pattern: "Unknown agent",
    errorType: "unknown_agent",
    fixHint: "从错误信息中的 Available agents 列表里选择一个有效的 agent",
  },
  {
    pattern: "Cannot call primary agent",
    errorType: "primary_agent",
    fixHint: "Primary agent 不能通过 delegate_task 调用。请使用子代理，如 'explore'、'oracle' 或 'librarian'",
  },
  {
    pattern: "Skills not found",
    errorType: "unknown_skills",
    fixHint: "从错误信息中的 Available 列表里选择有效的 skill 名称",
  },
]

export interface DetectedError {
  errorType: string
  originalOutput: string
}

export function detectDelegateTaskError(output: string): DetectedError | null {
  if (!output.includes("[ERROR]") && !output.includes("Invalid arguments")) return null

  for (const errorPattern of DELEGATE_TASK_ERROR_PATTERNS) {
    if (output.includes(errorPattern.pattern)) {
      return {
        errorType: errorPattern.errorType,
        originalOutput: output,
      }
    }
  }

  return null
}

function extractAvailableList(output: string): string | null {
  const availableMatch = output.match(/Available[^:]*:\s*(.+)$/m)
  return availableMatch ? availableMatch[1].trim() : null
}

export function buildRetryGuidance(errorInfo: DetectedError): string {
  const pattern = DELEGATE_TASK_ERROR_PATTERNS.find(
    (p) => p.errorType === errorInfo.errorType
  )

  if (!pattern) {
    return `[delegate_task 错误] 请修复错误并使用正确参数重试。`
  }

  let guidance = `
[delegate_task 调用失败 - 需要立即重试]

**错误类型**: ${errorInfo.errorType}
**修复方式**: ${pattern.fixHint}
`

  const availableList = extractAvailableList(errorInfo.originalOutput)
  if (availableList) {
    guidance += `\n**可用选项**: ${availableList}\n`
  }

  guidance += `
**操作**: 请立即使用修正后的参数重试 delegate_task。

正确调用示例：
\`\`\`
delegate_task(
  description="Task description",
  prompt="Detailed prompt...",
  category="unspecified-low",  // 或 subagent_type="explore"
  run_in_background=false,
  load_skills=[]
)
\`\`\`
`

  return guidance
}

export function createDelegateTaskRetryHook(_ctx: PluginInput) {
  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown }
    ) => {
      if (input.tool.toLowerCase() !== "delegate_task") return

      const errorInfo = detectDelegateTaskError(output.output)
      if (errorInfo) {
        const guidance = buildRetryGuidance(errorInfo)
        output.output += `\n${guidance}`
      }
    },
  }
}
