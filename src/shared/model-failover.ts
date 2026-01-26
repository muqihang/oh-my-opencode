type PromptModel = {
  providerID: string
  modelID: string
}

type SessionPromptRequest = {
  path: { id: string }
  body: {
    agent: string
    model: PromptModel
    parts: Array<{ type: string; [key: string]: unknown }>
    [key: string]: unknown
  }
}

type ClientWithSessionPrompt = {
  session: {
    prompt: (input: unknown) => Promise<unknown>
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (isRecord(error) && typeof error.message === "string") return error.message
  return ""
}

function isRateLimitError(error: unknown): boolean {
  const message = errorMessage(error)
  if (!message) return false

  return (
    message.includes("429") ||
    message.includes("Too Many Requests") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.toLowerCase().includes("rate limit")
  )
}

function normalizeAntigravityModelId(modelID: string): string {
  if (modelID.endsWith("-preview")) return modelID
  if (modelID.endsWith("-high")) return modelID.slice(0, -"-high".length) + "-preview"
  return `${modelID}-preview`
}

function buildFailoverChain(model: PromptModel): PromptModel[] {
  const chain: PromptModel[] = [model]

  if (model.providerID === "google" && model.modelID.startsWith("antigravity-")) {
    const base = model.modelID.slice("antigravity-".length)
    const normalized = normalizeAntigravityModelId(base)
    const next: PromptModel = { providerID: "google", modelID: normalized }
    chain.push(next)

    // If Gemini CLI also rate-limits, fall back to Copilot's gateway.
    if (normalized === "gemini-3-pro-preview") {
      chain.push({ providerID: "github-copilot", modelID: normalized })
    }
  }

  return chain
}

export async function promptWithModelFailover(
  client: ClientWithSessionPrompt,
  request: SessionPromptRequest,
): Promise<unknown> {
  const chain = buildFailoverChain(request.body.model)

  let lastError: unknown = undefined
  for (const model of chain) {
    const attemptRequest: SessionPromptRequest = {
      ...request,
      body: {
        ...request.body,
        model,
      },
    }

    try {
      return await client.session.prompt(attemptRequest)
    } catch (error) {
      lastError = error
      if (!isRateLimitError(error)) throw error
    }
  }

  throw lastError ?? new Error("Model failover exhausted")
}

