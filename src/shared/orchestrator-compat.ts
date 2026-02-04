export type OrchestratorCompatWarning = {
  shouldWarn: boolean
  message: string
}

function isEnvEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

function normalizeEnvValue(raw: string | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  return value.toLowerCase()
}

export function getOrchestratorForkStrategyCompatWarning(
  env: Record<string, string | undefined>
): OrchestratorCompatWarning {
  const experimentalOrchestratorEnabled = isEnvEnabled(env.OPENCODE_EXPERIMENTAL_ORCHESTRATOR)
  if (!experimentalOrchestratorEnabled) {
    return { shouldWarn: false, message: "" }
  }

  const forkStrategy = normalizeEnvValue(env.OPENCODE_ORCHESTRATOR_FORK_STRATEGY)
  const isAutoOrMissing = forkStrategy === undefined || forkStrategy === "auto"

  if (!isAutoOrMissing) {
    return { shouldWarn: false, message: "" }
  }

  const message =
    [
      "[oh-my-opencode] Orchestrator compatibility notice:",
      "Detected OPENCODE_EXPERIMENTAL_ORCHESTRATOR=1 with OPENCODE_ORCHESTRATOR_FORK_STRATEGY=auto (default).",
      "This can cause double-dispatch (both OpenCode base and Oh-My-OpenCode trying to delegate).",
      "",
      "If you want Oh-My-OpenCode to own orchestration/dispatching, set:",
      "  OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest",
    ].join("\n")

  return { shouldWarn: true, message }
}

