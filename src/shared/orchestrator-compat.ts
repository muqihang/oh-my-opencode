export type OrchestratorCompatWarning = {
  shouldWarn: boolean
  message: string
}

type ProductMode = "base" | "programming" | "legal"
type ForkStrategy = "auto" | "suggest" | "off"

function isEnvEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeEnvValue(raw: string | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  return value.toLowerCase()
}

function normalizeForkStrategy(raw: unknown): ForkStrategy | undefined {
  if (typeof raw !== "string") return undefined
  const value = raw.trim().toLowerCase()
  if (value === "auto" || value === "suggest" || value === "off") return value
  return undefined
}

function normalizeProductMode(raw: unknown): ProductMode | undefined {
  if (typeof raw !== "string") return undefined
  const value = raw.trim().toLowerCase()
  if (value === "base" || value === "programming" || value === "legal") return value
  return undefined
}

function resolveBaseForkStrategy(
  env: Record<string, string | undefined>,
  baseConfig?: unknown
): ForkStrategy {
  if (isRecord(baseConfig)) {
    const product = baseConfig.product
    if (isRecord(product)) {
      const explicit = normalizeForkStrategy(product.forkStrategy)
      if (explicit) return explicit

      const mode = normalizeProductMode(product.mode)
      if (mode && mode !== "base") return "suggest"
    }
  }

  const envForkStrategy = normalizeForkStrategy(normalizeEnvValue(env.OPENCODE_ORCHESTRATOR_FORK_STRATEGY))
  return envForkStrategy ?? "auto"
}

export function getOrchestratorForkStrategyCompatWarning(
  env: Record<string, string | undefined>,
  baseConfig?: unknown
): OrchestratorCompatWarning {
  const experimentalOrchestratorEnabled = isEnvEnabled(env.OPENCODE_EXPERIMENTAL_ORCHESTRATOR)
  if (!experimentalOrchestratorEnabled) {
    return { shouldWarn: false, message: "" }
  }

  const resolvedForkStrategy = resolveBaseForkStrategy(env, baseConfig)
  if (resolvedForkStrategy !== "auto") {
    return { shouldWarn: false, message: "" }
  }

  const message =
    [
      "[oh-my-opencode] Orchestrator compatibility notice:",
      "Detected OPENCODE_EXPERIMENTAL_ORCHESTRATOR=1 with a base fork strategy resolving to auto.",
      "This can cause double-dispatch (both OpenCode base and Oh-My-OpenCode trying to delegate).",
      "",
      "Recommended (config-first): set OpenCode product mode/fork strategy in opencode.json:",
      `  { "product": { "mode": "programming" } }`,
      `  { "product": { "forkStrategy": "suggest" } }`,
      "",
      "If you want Oh-My-OpenCode to own orchestration/dispatching, set:",
      "  OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest",
    ].join("\n")

  return { shouldWarn: true, message }
}
