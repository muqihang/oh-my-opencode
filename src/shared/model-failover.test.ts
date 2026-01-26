import { describe, expect, test } from "bun:test"
import { promptWithModelFailover } from "./model-failover"

describe("promptWithModelFailover", () => {
  test("should fallback from antigravity to Gemini CLI on rate limit", async () => {
    // #given
    const calls: Array<unknown> = []
    let attempt = 0
    const client = {
      session: {
        prompt: async (input: unknown) => {
          calls.push(input)
          attempt++
          if (attempt === 1) {
            throw new Error("429 Too Many Requests")
          }
          return undefined
        },
      },
    }

    // #when
    await promptWithModelFailover(client, {
      path: { id: "ses_test" },
      body: {
        agent: "explore",
        model: { providerID: "google", modelID: "antigravity-gemini-3-flash" },
        parts: [{ type: "text", text: "hello" }],
      },
    })

    // #then
    expect(calls.length).toBe(2)
    const first = calls[0] as { body?: { model?: { providerID: string; modelID: string } } }
    const second = calls[1] as { body?: { model?: { providerID: string; modelID: string } } }
    expect(first.body?.model).toEqual({ providerID: "google", modelID: "antigravity-gemini-3-flash" })
    expect(second.body?.model).toEqual({ providerID: "google", modelID: "gemini-3-flash-preview" })
  })

  test("should fallback from Gemini CLI to GitHub Copilot on rate limit", async () => {
    // #given
    const calls: Array<unknown> = []
    let attempt = 0
    const client = {
      session: {
        prompt: async (input: unknown) => {
          calls.push(input)
          attempt++
          if (attempt <= 2) {
            throw new Error("RESOURCE_EXHAUSTED")
          }
          return undefined
        },
      },
    }

    // #when
    await promptWithModelFailover(client, {
      path: { id: "ses_test" },
      body: {
        agent: "explore",
        model: { providerID: "google", modelID: "antigravity-gemini-3-pro-high" },
        parts: [{ type: "text", text: "hello" }],
      },
    })

    // #then
    expect(calls.length).toBe(3)
    const models = calls.map((c) => (c as { body?: { model?: { providerID: string; modelID: string } } }).body?.model)
    expect(models).toEqual([
      { providerID: "google", modelID: "antigravity-gemini-3-pro-high" },
      { providerID: "google", modelID: "gemini-3-pro-preview" },
      { providerID: "github-copilot", modelID: "gemini-3-pro-preview" },
    ])
  })
})
