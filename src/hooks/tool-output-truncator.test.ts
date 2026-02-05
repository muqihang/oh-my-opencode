import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createToolOutputTruncatorHook } from "./tool-output-truncator"
import * as dynamicTruncator from "../shared/dynamic-truncator"

describe("createToolOutputTruncatorHook", () => {
  let hook: ReturnType<typeof createToolOutputTruncatorHook>
  let truncateSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    truncateSpy = spyOn(dynamicTruncator, "createDynamicTruncator").mockReturnValue({
      truncate: mock(async (_sessionID: string, output: string, options?: { targetMaxTokens?: number }) => ({
        result: output,
        truncated: false,
        targetMaxTokens: options?.targetMaxTokens,
      })),
      getUsage: mock(async () => null),
      truncateSync: mock(() => ({ result: "", truncated: false })),
    })
    hook = createToolOutputTruncatorHook({} as never)
  })

  describe("tool.execute.after", () => {
    const createInput = (tool: string) => ({
      tool,
      sessionID: "test-session",
      callID: "test-call-id",
    })

    const createOutput = (outputText: string) => ({
      title: "Result",
      output: outputText,
      metadata: {},
    })

    describe("#given webfetch tool", () => {
      describe("#when output is processed", () => {
        it("#then should use aggressive truncation limit (10k tokens)", async () => {
          const truncateMock = mock(async (_sessionID: string, _output: string, options?: { targetMaxTokens?: number }) => ({
            result: "truncated",
            truncated: true,
            targetMaxTokens: options?.targetMaxTokens,
          }))
          truncateSpy.mockReturnValue({
            truncate: truncateMock,
            getUsage: mock(async () => null),
            truncateSync: mock(() => ({ result: "", truncated: false })),
          })
          hook = createToolOutputTruncatorHook({} as never)

          const input = createInput("webfetch")
          const output = createOutput("large content")

          await hook["tool.execute.after"](input, output)

          expect(truncateMock).toHaveBeenCalledWith(
            "test-session",
            "large content",
            { targetMaxTokens: 10_000 }
          )
        })
      })

      describe("#when using WebFetch variant", () => {
        it("#then should also use aggressive truncation limit", async () => {
          const truncateMock = mock(async (_sessionID: string, _output: string, options?: { targetMaxTokens?: number }) => ({
            result: "truncated",
            truncated: true,
          }))
          truncateSpy.mockReturnValue({
            truncate: truncateMock,
            getUsage: mock(async () => null),
            truncateSync: mock(() => ({ result: "", truncated: false })),
          })
          hook = createToolOutputTruncatorHook({} as never)

          const input = createInput("WebFetch")
          const output = createOutput("large content")

          await hook["tool.execute.after"](input, output)

          expect(truncateMock).toHaveBeenCalledWith(
            "test-session",
            "large content",
            { targetMaxTokens: 10_000 }
          )
        })
      })
    })

    describe("#given grep tool", () => {
      describe("#when output is processed", () => {
        it("#then should use default truncation limit (50k tokens)", async () => {
          const truncateMock = mock(async (_sessionID: string, _output: string, options?: { targetMaxTokens?: number }) => ({
            result: "truncated",
            truncated: true,
          }))
          truncateSpy.mockReturnValue({
            truncate: truncateMock,
            getUsage: mock(async () => null),
            truncateSync: mock(() => ({ result: "", truncated: false })),
          })
          hook = createToolOutputTruncatorHook({} as never)

          const input = createInput("grep")
          const output = createOutput("grep output")

          await hook["tool.execute.after"](input, output)

          expect(truncateMock).toHaveBeenCalledWith(
            "test-session",
            "grep output",
            { targetMaxTokens: 50_000 }
          )
        })
      })
    })

    describe("#given non-truncatable tool", () => {
      describe("#when tool is not in TRUNCATABLE_TOOLS list", () => {
        it("#then should not call truncator", async () => {
          const truncateMock = mock(async () => ({
            result: "truncated",
            truncated: true,
          }))
          truncateSpy.mockReturnValue({
            truncate: truncateMock,
            getUsage: mock(async () => null),
            truncateSync: mock(() => ({ result: "", truncated: false })),
          })
          hook = createToolOutputTruncatorHook({} as never)

          const input = createInput("Read")
          const output = createOutput("file content")

          await hook["tool.execute.after"](input, output)

          expect(truncateMock).not.toHaveBeenCalled()
        })
      })
    })

    describe("#given truncate_all_tool_outputs enabled", () => {
      describe("#when any tool output is processed", () => {
        it("#then should truncate non-listed tools too", async () => {
          const truncateMock = mock(async (_sessionID: string, _output: string, options?: { targetMaxTokens?: number }) => ({
            result: "truncated",
            truncated: true,
          }))
          truncateSpy.mockReturnValue({
            truncate: truncateMock,
            getUsage: mock(async () => null),
            truncateSync: mock(() => ({ result: "", truncated: false })),
          })
          hook = createToolOutputTruncatorHook({} as never, {
            experimental: { truncate_all_tool_outputs: true },
          })

          const input = createInput("Read")
          const output = createOutput("file content")

          await hook["tool.execute.after"](input, output)

          expect(truncateMock).toHaveBeenCalled()
        })
      })
    })

    describe("#given preserve_truncated_tool_output enabled", () => {
      it("#then writes raw output to disk and appends a short context_pointer", async () => {
        const truncateMock = mock(async () => ({
          result: "TRUNCATED",
          truncated: true,
        }))
        truncateSpy.mockReturnValue({
          truncate: truncateMock,
          getUsage: mock(async () => null),
          truncateSync: mock(() => ({ result: "", truncated: false })),
        })

        const tempDir = mkdtempSync(join(tmpdir(), "omo-truncator-"))
        hook = createToolOutputTruncatorHook({ directory: tempDir } as never, {
          experimental: {
            context_capsules: {
              dir: ".sisyphus/context-capsules",
              preserve_truncated_tool_output: true,
            },
          },
        })

        const raw = "RAW OUTPUT (FULL)"
        const input = createInput("grep")
        const output = createOutput(raw)

        await hook["tool.execute.after"](input, output)

        const sha256 = createHash("sha256").update(raw, "utf8").digest("hex")
        const expectedPath = join(tempDir, ".sisyphus", "context-capsules", `${sha256}.md`)

        expect(existsSync(expectedPath)).toBe(true)
        expect(readFileSync(expectedPath, "utf8")).toBe(raw)

        expect(output.output).toContain("<context_pointer>")
        expect(output.output).toContain(`path: .sisyphus/context-capsules/${sha256}.md`)
        expect(output.output).toContain(`sha256: ${sha256}`)
      })
    })

    describe("#given preserve_truncated_tool_output disabled (default)", () => {
      it("#then does not write file or append pointer (existing behavior)", async () => {
        const truncateMock = mock(async () => ({
          result: "TRUNCATED",
          truncated: true,
        }))
        truncateSpy.mockReturnValue({
          truncate: truncateMock,
          getUsage: mock(async () => null),
          truncateSync: mock(() => ({ result: "", truncated: false })),
        })

        const tempDir = mkdtempSync(join(tmpdir(), "omo-truncator-"))
        hook = createToolOutputTruncatorHook({ directory: tempDir } as never, {
          experimental: {
            context_capsules: {
              dir: ".sisyphus/context-capsules",
              preserve_truncated_tool_output: false,
            },
          },
        })

        const raw = "RAW OUTPUT (FULL)"
        const input = createInput("grep")
        const output = createOutput(raw)

        await hook["tool.execute.after"](input, output)

        const sha256 = createHash("sha256").update(raw, "utf8").digest("hex")
        const expectedPath = join(tempDir, ".sisyphus", "context-capsules", `${sha256}.md`)

        expect(existsSync(expectedPath)).toBe(false)
        expect(output.output).toBe("TRUNCATED")
        expect(output.output).not.toContain("<context_pointer>")
      })
    })
  })
})
