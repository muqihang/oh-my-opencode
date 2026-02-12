import { z } from "zod"

export const SisyphusTasksConfigSchema = z.object({
  /** Absolute or relative storage path override. When set, bypasses global config dir. */
  storage_path: z.string().optional(),
  /** Force task list ID (alternative to env ULTRAWORK_TASK_LIST_ID) */
  task_list_id: z.string().optional(),
  /** Enable Claude Code path compatibility mode */
  claude_code_compat: z.boolean().default(false),
})

export const SisyphusSwarmConfigSchema = z.object({
  /** Absolute or relative storage path override for team storage */
  storage_path: z.string().optional(),
  /** Enable swarm workflows */
  enabled: z.boolean().optional(),
  /** UI notification mode for swarm operations */
  ui_mode: z.string().optional(),
})

export const SisyphusConfigSchema = z.object({
  tasks: SisyphusTasksConfigSchema.optional(),
  swarm: SisyphusSwarmConfigSchema.optional(),
})

export type SisyphusTasksConfig = z.infer<typeof SisyphusTasksConfigSchema>
export type SisyphusSwarmConfig = z.infer<typeof SisyphusSwarmConfigSchema>
export type SisyphusConfig = z.infer<typeof SisyphusConfigSchema>
