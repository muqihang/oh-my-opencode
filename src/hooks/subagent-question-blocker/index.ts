import type { Hooks } from "@opencode-ai/plugin"
import { subagentSessions } from "../../features/claude-code-session-state"
import { log } from "../../shared"

export function createSubagentQuestionBlockerHook(): Hooks {
  return {
    "tool.execute.before": async (input) => {
      const toolName = input.tool?.toLowerCase()
      if (toolName !== "question" && toolName !== "askuserquestion") {
        return
      }

      if (!subagentSessions.has(input.sessionID)) {
        return
      }

      log("[subagent-question-blocker] Blocking question tool call from subagent session", {
        sessionID: input.sessionID,
        tool: input.tool,
      })

      throw new Error(
        "子代理会话中已禁用 Question 工具。子代理应自主完成工作，不应直接向用户提问。若需要澄清，请带着你的发现与不确定点返回父代理。"
      )
    },
  }
}
