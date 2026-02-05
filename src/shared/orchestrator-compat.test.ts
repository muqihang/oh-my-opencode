import { describe, test, expect } from "bun:test"
import { getOrchestratorForkStrategyCompatWarning } from "./orchestrator-compat"

describe("getOrchestratorForkStrategyCompatWarning", () => {
  test("warns when experimental orchestrator is enabled and forkStrategy is undefined", () => {
    // #given
    const env: Record<string, string | undefined> = {
      OPENCODE_EXPERIMENTAL_ORCHESTRATOR: "1",
    }

    // #when
    const result = getOrchestratorForkStrategyCompatWarning(env)

    // #then
    expect(result.shouldWarn).toBe(true)
    expect(result.message).toContain("OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest")
  })

  test("does not warn when product.mode is programming (base defaults to suggest)", () => {
    // #given
    const env: Record<string, string | undefined> = {
      OPENCODE_EXPERIMENTAL_ORCHESTRATOR: "1",
    }

    // #when
    const result = getOrchestratorForkStrategyCompatWarning(env, {
      product: { mode: "programming" },
    })

    // #then
    expect(result.shouldWarn).toBe(false)
  })

  test("does not warn when product.mode is legal (base defaults to suggest)", () => {
    // #given
    const env: Record<string, string | undefined> = {
      OPENCODE_EXPERIMENTAL_ORCHESTRATOR: "1",
      OPENCODE_ORCHESTRATOR_FORK_STRATEGY: "auto",
    }

    // #when
    const result = getOrchestratorForkStrategyCompatWarning(env, {
      product: { mode: "legal" },
    })

    // #then
    expect(result.shouldWarn).toBe(false)
  })

  test("warns when product.forkStrategy explicitly forces auto (even in programming mode)", () => {
    // #given
    const env: Record<string, string | undefined> = {
      OPENCODE_EXPERIMENTAL_ORCHESTRATOR: "1",
    }

    // #when
    const result = getOrchestratorForkStrategyCompatWarning(env, {
      product: { mode: "programming", forkStrategy: "auto" },
    })

    // #then
    expect(result.shouldWarn).toBe(true)
  })

  test("warns when experimental orchestrator is enabled and forkStrategy is auto", () => {
    // #given
    const env: Record<string, string | undefined> = {
      OPENCODE_EXPERIMENTAL_ORCHESTRATOR: "1",
      OPENCODE_ORCHESTRATOR_FORK_STRATEGY: "auto",
    }

    // #when
    const result = getOrchestratorForkStrategyCompatWarning(env)

    // #then
    expect(result.shouldWarn).toBe(true)
    expect(result.message).toContain("OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest")
  })

  test("does not warn when experimental orchestrator is enabled and forkStrategy is suggest", () => {
    // #given
    const env: Record<string, string | undefined> = {
      OPENCODE_EXPERIMENTAL_ORCHESTRATOR: "1",
      OPENCODE_ORCHESTRATOR_FORK_STRATEGY: "suggest",
    }

    // #when
    const result = getOrchestratorForkStrategyCompatWarning(env)

    // #then
    expect(result.shouldWarn).toBe(false)
  })

  test("does not warn when experimental orchestrator is enabled and forkStrategy is off", () => {
    // #given
    const env: Record<string, string | undefined> = {
      OPENCODE_EXPERIMENTAL_ORCHESTRATOR: "1",
      OPENCODE_ORCHESTRATOR_FORK_STRATEGY: "off",
    }

    // #when
    const result = getOrchestratorForkStrategyCompatWarning(env)

    // #then
    expect(result.shouldWarn).toBe(false)
  })

  test("does not warn when experimental orchestrator is disabled", () => {
    // #given
    const env: Record<string, string | undefined> = {
      OPENCODE_EXPERIMENTAL_ORCHESTRATOR: "0",
      OPENCODE_ORCHESTRATOR_FORK_STRATEGY: "auto",
    }

    // #when
    const result = getOrchestratorForkStrategyCompatWarning(env)

    // #then
    expect(result.shouldWarn).toBe(false)
  })
})
