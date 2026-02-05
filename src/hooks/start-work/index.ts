import type { PluginInput } from "@opencode-ai/plugin"
import type { ExperimentalConfig } from "../../config"
import {
  readBoulderState,
  writeBoulderState,
  appendSessionId,
  findPrometheusPlans,
  getPlanProgress,
  createBoulderState,
  getPlanName,
  clearBoulderState,
} from "../../features/boulder-state"
import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { log } from "../../shared/logger"
import { getSessionAgent, updateSessionAgent } from "../../features/claude-code-session-state"
import {
  readBaseEvidenceManifest,
  renderBaseEvidenceIndex,
  selectBaseEvidenceEntries,
} from "../../shared/opencode-base-evidence-bridge"

export const HOOK_NAME = "start-work"

const KEYWORD_PATTERN = /\b(ultrawork|ulw)\b/gi

interface StartWorkHookInput {
  sessionID: string
  messageID?: string
}

interface StartWorkHookOutput {
  parts: Array<{ type: string; text?: string }>
}

function extractUserRequestPlanName(promptText: string): string | null {
  const userRequestMatch = promptText.match(/<user-request>\s*([\s\S]*?)\s*<\/user-request>/i)
  if (!userRequestMatch) return null
  
  const rawArg = userRequestMatch[1].trim()
  if (!rawArg) return null
  
  const cleanedArg = rawArg.replace(KEYWORD_PATTERN, "").trim()
  return cleanedArg || null
}

function findPlanByName(plans: string[], requestedName: string): string | null {
  const lowerName = requestedName.toLowerCase()
  
  const exactMatch = plans.find(p => getPlanName(p).toLowerCase() === lowerName)
  if (exactMatch) return exactMatch
  
  const partialMatch = plans.find(p => getPlanName(p).toLowerCase().includes(lowerName))
  return partialMatch || null
}

export function createStartWorkHook(
  ctx: PluginInput,
  options?: { experimental?: ExperimentalConfig },
) {
  return {
    "chat.message": async (
      input: StartWorkHookInput,
      output: StartWorkHookOutput
    ): Promise<void> => {
      const parts = output.parts
      const promptText = parts
        ?.filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("\n")
        .trim() || ""

      // Only trigger on actual command execution (contains <session-context> tag)
      // NOT on description text like "Start Sisyphus work session from Prometheus plan"
      const isStartWorkCommand = promptText.includes("<session-context>")

      if (!isStartWorkCommand) {
        return
      }

      log(`[${HOOK_NAME}] Processing start-work command`, {
        sessionID: input.sessionID,
      })

      const currentAgent = getSessionAgent(input.sessionID)
      if (!currentAgent) {
        updateSessionAgent(input.sessionID, "atlas")
      }

      const existingState = readBoulderState(ctx.directory)
      const sessionId = input.sessionID
      const timestamp = new Date().toISOString()

      let contextInfo = ""
      let bridgePlanName: string | null = null

      const explicitPlanName = extractUserRequestPlanName(promptText)
      
      if (explicitPlanName) {
        log(`[${HOOK_NAME}] Explicit plan name requested: ${explicitPlanName}`, {
          sessionID: input.sessionID,
        })
        
        const allPlans = findPrometheusPlans(ctx.directory)
        const matchedPlan = findPlanByName(allPlans, explicitPlanName)
        
        if (matchedPlan) {
          const progress = getPlanProgress(matchedPlan)
          
          if (progress.isComplete) {
            contextInfo = `
## Plan Already Complete

The requested plan "${getPlanName(matchedPlan)}" has been completed.
All ${progress.total} tasks are done. Create a new plan with: /plan "your task"`
          } else {
            if (existingState) {
              clearBoulderState(ctx.directory)
            }
            const newState = createBoulderState(matchedPlan, sessionId)
            writeBoulderState(ctx.directory, newState)
            bridgePlanName = newState.plan_name
            
            contextInfo = `
## Auto-Selected Plan

**Plan**: ${getPlanName(matchedPlan)}
**Path**: ${matchedPlan}
**Progress**: ${progress.completed}/${progress.total} tasks
**Session ID**: ${sessionId}
**Started**: ${timestamp}

boulder.json has been created. Read the plan and begin execution.`
          }
        } else {
          const incompletePlans = allPlans.filter(p => !getPlanProgress(p).isComplete)
          if (incompletePlans.length > 0) {
            const planList = incompletePlans.map((p, i) => {
              const prog = getPlanProgress(p)
              return `${i + 1}. [${getPlanName(p)}] - Progress: ${prog.completed}/${prog.total}`
            }).join("\n")
            
            contextInfo = `
## Plan Not Found

Could not find a plan matching "${explicitPlanName}".

Available incomplete plans:
${planList}

Ask the user which plan to work on.`
          } else {
            contextInfo = `
## Plan Not Found

Could not find a plan matching "${explicitPlanName}".
No incomplete plans available. Create a new plan with: /plan "your task"`
          }
        }
      } else if (existingState) {
        const progress = getPlanProgress(existingState.active_plan)
        
        if (!progress.isComplete) {
          appendSessionId(ctx.directory, sessionId)
          bridgePlanName = existingState.plan_name
          contextInfo = `
## Active Work Session Found

**Status**: RESUMING existing work
**Plan**: ${existingState.plan_name}
**Path**: ${existingState.active_plan}
**Progress**: ${progress.completed}/${progress.total} tasks completed
**Sessions**: ${existingState.session_ids.length + 1} (current session appended)
**Started**: ${existingState.started_at}

The current session (${sessionId}) has been added to session_ids.
Read the plan file and continue from the first unchecked task.`
        } else {
          contextInfo = `
## Previous Work Complete

The previous plan (${existingState.plan_name}) has been completed.
Looking for new plans...`
        }
      }

      if ((!existingState && !explicitPlanName) || (existingState && !explicitPlanName && getPlanProgress(existingState.active_plan).isComplete)) {
        const plans = findPrometheusPlans(ctx.directory)
        const incompletePlans = plans.filter(p => !getPlanProgress(p).isComplete)
        
        if (plans.length === 0) {
          contextInfo += `

## No Plans Found

No Prometheus plan files found at .sisyphus/plans/
Use Prometheus to create a work plan first: /plan "your task"`
        } else if (incompletePlans.length === 0) {
          contextInfo += `

## All Plans Complete

All ${plans.length} plan(s) are complete. Create a new plan with: /plan "your task"`
        } else if (incompletePlans.length === 1) {
          const planPath = incompletePlans[0]
          const progress = getPlanProgress(planPath)
          const newState = createBoulderState(planPath, sessionId)
          writeBoulderState(ctx.directory, newState)
          bridgePlanName = newState.plan_name

          contextInfo += `

## Auto-Selected Plan

**Plan**: ${getPlanName(planPath)}
**Path**: ${planPath}
**Progress**: ${progress.completed}/${progress.total} tasks
**Session ID**: ${sessionId}
**Started**: ${timestamp}

boulder.json has been created. Read the plan and begin execution.`
        } else {
          const planList = incompletePlans.map((p, i) => {
            const progress = getPlanProgress(p)
            const stat = require("node:fs").statSync(p)
            const modified = new Date(stat.mtimeMs).toISOString()
            return `${i + 1}. [${getPlanName(p)}] - Modified: ${modified} - Progress: ${progress.completed}/${progress.total}`
          }).join("\n")

          contextInfo += `

<system-reminder>
## Multiple Plans Found

Current Time: ${timestamp}
Session ID: ${sessionId}

${planList}

Ask the user which plan to work on. Present the options above and wait for their response.
</system-reminder>`
        }
      }

      if (
        options?.experimental?.opencode_base_artifacts_bridge?.enabled === true &&
        bridgePlanName
      ) {
        try {
          const verbose = options?.experimental?.opencode_base_artifacts_bridge?.verbose === true
          const manifest = readBaseEvidenceManifest({
            baseDir: ctx.directory,
            sessionId,
          })

          if (!manifest) {
            log(`[${HOOK_NAME}] Base evidence manifest missing or invalid`, {
              sessionID: input.sessionID,
            })
            if (verbose) {
              contextInfo += `\n\n## OpenCode Base Evidence Index\n\nSkipped: \`.opencode/evidence/${sessionId}/manifest.json\` missing or unsupported.`
            }
          } else {
            const manifestPath = `.opencode/evidence/${sessionId}/manifest.json`
            const picked = selectBaseEvidenceEntries(manifest.entries)
            const index = renderBaseEvidenceIndex({
              sessionId,
              planName: bridgePlanName,
              manifestPath,
              entries: picked,
            })

            const notepadDir = join(
              ctx.directory,
              ".sisyphus",
              "notepads",
              bridgePlanName,
            )
            mkdirSync(notepadDir, { recursive: true })

            const indexPath = join(notepadDir, "opencode-base-evidence.md")
            const indexRelPath = `.sisyphus/notepads/${bridgePlanName}/opencode-base-evidence.md`
            const sectionTimestamp = new Date().toISOString()
            const hasExisting = existsSync(indexPath)
            const section = [
              hasExisting ? "\n\n---\n\n" : "",
              `## OpenCode base evidence bridge (${sectionTimestamp})\n\n`,
              index.trimEnd(),
              "\n",
            ].join("")

            appendFileSync(indexPath, section, "utf8")
            contextInfo += `\n\n## OpenCode Base Evidence Index\n\nWrote: \`${indexRelPath}\``
          }
        } catch (error) {
          log(`[${HOOK_NAME}] Base evidence bridge failed (ignored)`, {
            sessionID: input.sessionID,
            error: String(error),
          })
        }
      }

      const idx = output.parts.findIndex((p) => p.type === "text" && p.text)
      if (idx >= 0 && output.parts[idx].text) {
        output.parts[idx].text = output.parts[idx].text
          .replace(/\$SESSION_ID/g, sessionId)
          .replace(/\$TIMESTAMP/g, timestamp)
        
        output.parts[idx].text += `\n\n---\n${contextInfo}`
      }

      log(`[${HOOK_NAME}] Context injected`, {
        sessionID: input.sessionID,
        hasExistingState: !!existingState,
      })
    },
  }
}
