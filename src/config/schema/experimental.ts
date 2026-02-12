import { z } from "zod"
import { DynamicContextPruningConfigSchema } from "./dynamic-context-pruning"

export const ContextCapsulesConfigSchema = z.object({
  /** Directory for storing truncated-output capsule files */
  dir: z.string().optional(),
  /** Persist full tool output to capsule file and append pointer */
  preserve_truncated_tool_output: z.boolean().optional(),
})

export const OpenCodeBaseArtifactsBridgeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  inject_to_delegate_task: z.boolean().default(false),
  verbose: z.boolean().default(false),
  write_json: z.boolean().default(false),
  allowlist: z.array(z.string()).optional(),
})

export const ExperimentalConfigSchema = z.object({
  aggressive_truncation: z.boolean().optional(),
  auto_resume: z.boolean().optional(),
  preemptive_compaction: z.boolean().optional(),
  /** Truncate all tool outputs, not just whitelisted tools (default: false). Tool output truncator is enabled by default - disable via disabled_hooks. */
  truncate_all_tool_outputs: z.boolean().optional(),
  /** Dynamic context pruning configuration */
  dynamic_context_pruning: DynamicContextPruningConfigSchema.optional(),
  /** Config for context-capsule pointerization behavior */
  context_capsules: ContextCapsulesConfigSchema.optional(),
  opencode_base_artifacts_bridge: OpenCodeBaseArtifactsBridgeConfigSchema.optional(),
  /** Enable experimental task system for Todowrite disabler hook */
  task_system: z.boolean().optional(),
  /** Timeout in ms for loadAllPluginComponents during config handler init (default: 10000, min: 1000) */
  plugin_load_timeout_ms: z.number().min(1000).optional(),
  /** Wrap hook creation in try/catch to prevent one failing hook from crashing the plugin (default: true at call site) */
  safe_hook_creation: z.boolean().optional(),
})

export type ContextCapsulesConfig = z.infer<typeof ContextCapsulesConfigSchema>
export type OpenCodeBaseArtifactsBridgeConfig = z.infer<typeof OpenCodeBaseArtifactsBridgeConfigSchema>
export type ExperimentalConfig = z.infer<typeof ExperimentalConfigSchema>
