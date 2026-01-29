import { createOpencode } from "@opencode-ai/sdk"
import pc from "picocolors"
import type { RunOptions, RunContext } from "./types"
import { checkCompletionConditions } from "./completion"
import { createEventState, processEvents, serializeError } from "./events"

const POLL_INTERVAL_MS = 500
const DEFAULT_TIMEOUT_MS = 0
const SESSION_CREATE_MAX_RETRIES = 3
const SESSION_CREATE_RETRY_DELAY_MS = 1000

export async function run(options: RunOptions): Promise<number> {
  const {
    message,
    agent,
    directory = process.cwd(),
    timeout = DEFAULT_TIMEOUT_MS,
  } = options

  console.log(pc.cyan("正在启动 opencode 服务..."))

  const abortController = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  // timeout=0 means no timeout (run until completion)
  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      console.log(pc.yellow("\n已达到超时时间，正在中止..."))
      abortController.abort()
    }, timeout)
  }

  try {
    // Support custom OpenCode server port via environment variable
    // This allows Open Agent and other orchestrators to run multiple
    // concurrent missions without port conflicts
    const serverPort = process.env.OPENCODE_SERVER_PORT
      ? parseInt(process.env.OPENCODE_SERVER_PORT, 10)
      : undefined
    const serverHostname = process.env.OPENCODE_SERVER_HOSTNAME || undefined

    const { client, server } = await createOpencode({
      signal: abortController.signal,
      ...(serverPort && !isNaN(serverPort) ? { port: serverPort } : {}),
      ...(serverHostname ? { hostname: serverHostname } : {}),
    })

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      server.close()
    }

    process.on("SIGINT", () => {
      console.log(pc.yellow("\n已中断，正在关闭..."))
      cleanup()
      process.exit(130)
    })

    try {
      // Retry session creation with exponential backoff
      // Server might not be fully ready even after "listening" message
      let sessionID: string | undefined
      let lastError: unknown

      for (let attempt = 1; attempt <= SESSION_CREATE_MAX_RETRIES; attempt++) {
        const sessionRes = await client.session.create({
          body: { title: "oh-my-opencode 运行" },
        })

        if (sessionRes.error) {
          lastError = sessionRes.error
          console.error(pc.yellow(`创建会话尝试 ${attempt}/${SESSION_CREATE_MAX_RETRIES} 失败：`))
          console.error(pc.dim(`  错误：${serializeError(sessionRes.error)}`))

          if (attempt < SESSION_CREATE_MAX_RETRIES) {
            const delay = SESSION_CREATE_RETRY_DELAY_MS * attempt
            console.log(pc.dim(`  将在 ${delay}ms 后重试...`))
            await new Promise((resolve) => setTimeout(resolve, delay))
            continue
          }
        }

        sessionID = sessionRes.data?.id
        if (sessionID) {
          break
        }

        // No error but also no session ID - unexpected response
        lastError = new Error(`意外响应：${JSON.stringify(sessionRes, null, 2)}`)
        console.error(pc.yellow(`创建会话尝试 ${attempt}/${SESSION_CREATE_MAX_RETRIES}：未返回 session ID`))

        if (attempt < SESSION_CREATE_MAX_RETRIES) {
          const delay = SESSION_CREATE_RETRY_DELAY_MS * attempt
          console.log(pc.dim(`  将在 ${delay}ms 后重试...`))
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }

      if (!sessionID) {
        console.error(pc.red("多次重试后仍无法创建会话"))
        console.error(pc.dim(`最后一次错误：${serializeError(lastError)}`))
        cleanup()
        return 1
      }

      console.log(pc.dim(`会话：${sessionID}`))

      const ctx: RunContext = {
        client,
        sessionID,
        directory,
        abortController,
      }

      const events = await client.event.subscribe()
      const eventState = createEventState()
      const eventProcessor = processEvents(ctx, events.stream, eventState)

      console.log(pc.dim("\n正在发送提示词..."))
      await client.session.promptAsync({
        path: { id: sessionID },
        body: {
          agent,
          parts: [{ type: "text", text: message }],
        },
        query: { directory },
      })

      console.log(pc.dim("正在等待完成...\n"))

      while (!abortController.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

        if (!eventState.mainSessionIdle) {
          continue
        }

        // Check if session errored - exit with failure if so
        if (eventState.mainSessionError) {
          console.error(pc.red(`\n\n会话以错误结束：${eventState.lastError}`))
          console.error(pc.yellow("请检查在出错前 TODO 是否已完成。"))
          cleanup()
          process.exit(1)
        }

        const shouldExit = await checkCompletionConditions(ctx)
        if (shouldExit) {
          console.log(pc.green("\n\n所有任务已完成。"))
          cleanup()
          process.exit(0)
        }
      }

      await eventProcessor.catch(() => {})
      cleanup()
      return 130
    } catch (err) {
      cleanup()
      throw err
    }
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId)
    if (err instanceof Error && err.name === "AbortError") {
      return 130
    }
    console.error(pc.red(`错误：${serializeError(err)}`))
    return 1
  }
}
