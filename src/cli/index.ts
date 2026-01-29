#!/usr/bin/env bun
import { Command } from "commander"
import { install } from "./install"
import { run } from "./run"
import { getLocalVersion } from "./get-local-version"
import { doctor } from "./doctor"
import type { InstallArgs } from "./types"
import type { RunOptions } from "./run"
import type { GetLocalVersionOptions } from "./get-local-version/types"
import type { DoctorOptions } from "./doctor"
import packageJson from "../../package.json" with { type: "json" }

const VERSION = packageJson.version

const program = new Command()

program
  .name("oh-my-opencode")
  .description("终极 OpenCode 插件——多模型编排、LSP 工具等")
  .version(VERSION, "-v, --version", "显示版本号")

program
  .command("install")
  .description("通过交互式向导安装并配置 oh-my-opencode")
  .option("--no-tui", "以非交互模式运行（需要提供所有选项）")
  .option("--claude <value>", "Claude 订阅：no, yes, max20")
  .option("--openai <value>", "OpenAI/ChatGPT 订阅：no, yes（默认：no）")
  .option("--gemini <value>", "Gemini 集成：no, yes")
  .option("--copilot <value>", "GitHub Copilot 订阅：no, yes")
  .option("--opencode-zen <value>", "OpenCode Zen 权限：no, yes（默认：no）")
  .option("--zai-coding-plan <value>", "Z.ai Coding Plan 订阅：no, yes（默认：no）")
  .option("--skip-auth", "跳过鉴权/登录配置提示")
  .addHelpText("after", `
示例：
  $ bunx oh-my-opencode install
  $ bunx oh-my-opencode install --no-tui --claude=max20 --openai=yes --gemini=yes --copilot=no
  $ bunx oh-my-opencode install --no-tui --claude=no --gemini=no --copilot=yes --opencode-zen=yes

模型提供方（优先级：Native > Copilot > OpenCode Zen > Z.ai）：
  Claude        原生 anthropic/ 模型（Opus、Sonnet、Haiku）
  OpenAI        原生 openai/ 模型（Oracle 默认用 GPT-5.2）
  Gemini        原生 google/ 模型（Gemini 3 Pro、Flash）
  Copilot       github-copilot/ 模型（兜底）
  OpenCode Zen  opencode/ 模型（如 opencode/claude-opus-4-5 等）
  Z.ai          zai-coding-plan/glm-4.7（Librarian 优先）
`)
  .action(async (options) => {
    const args: InstallArgs = {
      tui: options.tui !== false,
      claude: options.claude,
      openai: options.openai,
      gemini: options.gemini,
      copilot: options.copilot,
      opencodeZen: options.opencodeZen,
      zaiCodingPlan: options.zaiCodingPlan,
      skipAuth: options.skipAuth ?? false,
    }
    const exitCode = await install(args)
    process.exit(exitCode)
  })

program
  .command("run <message>")
  .description("运行 opencode，并强制等待 TODO/后台任务完成")
  .option("-a, --agent <name>", "使用的 Agent（默认：Sisyphus）")
  .option("-d, --directory <path>", "工作目录")
  .option("-t, --timeout <ms>", "超时时间（毫秒，默认：0（不超时））", parseInt)
  .addHelpText("after", `
示例：
  $ bunx oh-my-opencode run "Fix the bug in index.ts"
  $ bunx oh-my-opencode run --agent Sisyphus "Implement feature X"
  $ bunx oh-my-opencode run --timeout 3600000 "Large refactoring task"

不同于 'opencode run'，该命令会一直等待，直到：
  - 所有 TODO 都已完成或已取消
  - 所有子会话（后台任务）都处于 idle
`)
  .action(async (message: string, options) => {
    const runOptions: RunOptions = {
      message,
      agent: options.agent,
      directory: options.directory,
      timeout: options.timeout,
    }
    const exitCode = await run(runOptions)
    process.exit(exitCode)
  })

program
  .command("get-local-version")
  .description("显示当前安装版本并检查更新")
  .option("-d, --directory <path>", "用于读取配置的工作目录")
  .option("--json", "以 JSON 输出，便于脚本处理")
  .addHelpText("after", `
示例：
  $ bunx oh-my-opencode get-local-version
  $ bunx oh-my-opencode get-local-version --json
  $ bunx oh-my-opencode get-local-version --directory /path/to/project

该命令会显示：
  - 当前安装版本
  - npm 上最新可用版本
  - 是否已是最新
  - 特殊模式（本地开发、固定版本）
`)
  .action(async (options) => {
    const versionOptions: GetLocalVersionOptions = {
      directory: options.directory,
      json: options.json ?? false,
    }
    const exitCode = await getLocalVersion(versionOptions)
    process.exit(exitCode)
  })

program
  .command("doctor")
  .description("检查 oh-my-opencode 安装健康状况并诊断问题")
  .option("--verbose", "显示更详细的诊断信息")
  .option("--json", "以 JSON 输出结果")
  .option("--category <category>", "仅运行指定类别")
  .addHelpText("after", `
示例：
  $ bunx oh-my-opencode doctor
  $ bunx oh-my-opencode doctor --verbose
  $ bunx oh-my-opencode doctor --json
  $ bunx oh-my-opencode doctor --category authentication

类别：
  installation     检查 OpenCode 与插件安装
  configuration    校验配置文件
  authentication   检查鉴权/登录状态
  dependencies     检查外部依赖
  tools            检查 LSP 与 MCP 服务
  updates          检查版本更新
`)
  .action(async (options) => {
    const doctorOptions: DoctorOptions = {
      verbose: options.verbose ?? false,
      json: options.json ?? false,
      category: options.category,
    }
    const exitCode = await doctor(doctorOptions)
    process.exit(exitCode)
  })

program
  .command("version")
  .description("显示版本信息")
  .action(() => {
    console.log(`oh-my-opencode v${VERSION}`)
  })

program.parse()
