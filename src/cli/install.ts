import * as p from "@clack/prompts"
import color from "picocolors"
import type { InstallArgs, InstallConfig, ClaudeSubscription, BooleanArg, DetectedConfig } from "./types"
import {
  addPluginToOpenCodeConfig,
  writeOmoConfig,
  isOpenCodeInstalled,
  getOpenCodeVersion,
  addAuthPlugins,
  addProviderConfig,
  detectCurrentConfig,
} from "./config-manager"
import { shouldShowChatGPTOnlyWarning } from "./model-fallback"
import packageJson from "../../package.json" with { type: "json" }

const VERSION = packageJson.version

const SYMBOLS = {
  check: color.green("[OK]"),
  cross: color.red("[X]"),
  arrow: color.cyan("->"),
  bullet: color.dim("*"),
  info: color.blue("[i]"),
  warn: color.yellow("[!]"),
  star: color.yellow("*"),
}

function formatProvider(name: string, enabled: boolean, detail?: string): string {
  const status = enabled ? SYMBOLS.check : color.dim("○")
  const label = enabled ? color.white(name) : color.dim(name)
  const suffix = detail ? color.dim(` (${detail})`) : ""
  return `  ${status} ${label}${suffix}`
}

function formatConfigSummary(config: InstallConfig): string {
  const lines: string[] = []

  lines.push(color.bold(color.white("配置摘要")))
  lines.push("")

  const claudeDetail = config.hasClaude ? (config.isMax20 ? "max20" : "标准") : undefined
  lines.push(formatProvider("Claude", config.hasClaude, claudeDetail))
  lines.push(formatProvider("OpenAI/ChatGPT", config.hasOpenAI, "Oracle 使用 GPT-5.2"))
  lines.push(formatProvider("Gemini", config.hasGemini))
  lines.push(formatProvider("GitHub Copilot", config.hasCopilot, "备用"))
  lines.push(formatProvider("OpenCode Zen", config.hasOpencodeZen, "opencode/ 模型"))
  lines.push(formatProvider("Z.ai Coding Plan", config.hasZaiCodingPlan, "Librarian/Multimodal"))

  lines.push("")
  lines.push(color.dim("─".repeat(40)))
  lines.push("")

  lines.push(color.bold(color.white("模型分配")))
  lines.push("")
  lines.push(`  ${SYMBOLS.info} 模型将根据 Provider 优先级自动配置`)
  lines.push(`  ${SYMBOLS.bullet} 优先级：原生 > Copilot > OpenCode Zen > Z.ai`)

  return lines.join("\n")
}

function printHeader(isUpdate: boolean): void {
  const mode = isUpdate ? "更新" : "安装"
  console.log()
  console.log(color.bgMagenta(color.white(` oMoMoMoMo... ${mode} `)))
  console.log()
}

function printStep(step: number, total: number, message: string): void {
  const progress = color.dim(`[${step}/${total}]`)
  console.log(`${progress} ${message}`)
}

function printSuccess(message: string): void {
  console.log(`${SYMBOLS.check} ${message}`)
}

function printError(message: string): void {
  console.log(`${SYMBOLS.cross} ${color.red(message)}`)
}

function printInfo(message: string): void {
  console.log(`${SYMBOLS.info} ${message}`)
}

function printWarning(message: string): void {
  console.log(`${SYMBOLS.warn} ${color.yellow(message)}`)
}

function printBox(content: string, title?: string): void {
  const lines = content.split("\n")
  const maxWidth = Math.max(...lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, "").length), title?.length ?? 0) + 4
  const border = color.dim("─".repeat(maxWidth))

  console.log()
  if (title) {
    console.log(color.dim("┌─") + color.bold(` ${title} `) + color.dim("─".repeat(maxWidth - title.length - 4)) + color.dim("┐"))
  } else {
    console.log(color.dim("┌") + border + color.dim("┐"))
  }

  for (const line of lines) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, "")
    const padding = maxWidth - stripped.length
    console.log(color.dim("│") + ` ${line}${" ".repeat(padding - 1)}` + color.dim("│"))
  }

  console.log(color.dim("└") + border + color.dim("┘"))
  console.log()
}

function validateNonTuiArgs(args: InstallArgs): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (args.claude === undefined) {
    errors.push("必须提供 --claude（取值：no, yes, max20）")
  } else if (!["no", "yes", "max20"].includes(args.claude)) {
    errors.push(`--claude 参数值无效：${args.claude}（期望：no, yes, max20）`)
  }

  if (args.gemini === undefined) {
    errors.push("必须提供 --gemini（取值：no, yes）")
  } else if (!["no", "yes"].includes(args.gemini)) {
    errors.push(`--gemini 参数值无效：${args.gemini}（期望：no, yes）`)
  }

  if (args.copilot === undefined) {
    errors.push("必须提供 --copilot（取值：no, yes）")
  } else if (!["no", "yes"].includes(args.copilot)) {
    errors.push(`--copilot 参数值无效：${args.copilot}（期望：no, yes）`)
  }

  if (args.openai !== undefined && !["no", "yes"].includes(args.openai)) {
    errors.push(`--openai 参数值无效：${args.openai}（期望：no, yes）`)
  }

  if (args.opencodeZen !== undefined && !["no", "yes"].includes(args.opencodeZen)) {
    errors.push(`--opencode-zen 参数值无效：${args.opencodeZen}（期望：no, yes）`)
  }

  if (args.zaiCodingPlan !== undefined && !["no", "yes"].includes(args.zaiCodingPlan)) {
    errors.push(`--zai-coding-plan 参数值无效：${args.zaiCodingPlan}（期望：no, yes）`)
  }

  return { valid: errors.length === 0, errors }
}

function argsToConfig(args: InstallArgs): InstallConfig {
  return {
    hasClaude: args.claude !== "no",
    isMax20: args.claude === "max20",
    hasOpenAI: args.openai === "yes",
    hasGemini: args.gemini === "yes",
    hasCopilot: args.copilot === "yes",
    hasOpencodeZen: args.opencodeZen === "yes",
    hasZaiCodingPlan: args.zaiCodingPlan === "yes",
  }
}

function detectedToInitialValues(detected: DetectedConfig): { claude: ClaudeSubscription; openai: BooleanArg; gemini: BooleanArg; copilot: BooleanArg; opencodeZen: BooleanArg; zaiCodingPlan: BooleanArg } {
  let claude: ClaudeSubscription = "no"
  if (detected.hasClaude) {
    claude = detected.isMax20 ? "max20" : "yes"
  }

  return {
    claude,
    openai: detected.hasOpenAI ? "yes" : "no",
    gemini: detected.hasGemini ? "yes" : "no",
    copilot: detected.hasCopilot ? "yes" : "no",
    opencodeZen: detected.hasOpencodeZen ? "yes" : "no",
    zaiCodingPlan: detected.hasZaiCodingPlan ? "yes" : "no",
  }
}

async function runTuiMode(detected: DetectedConfig): Promise<InstallConfig | null> {
  const initial = detectedToInitialValues(detected)

  const claude = await p.select({
    message: "你是否拥有 Claude Pro/Max 订阅？",
    options: [
      { value: "no" as const, label: "没有", hint: "将使用 opencode/big-pickle 作为回退" },
      { value: "yes" as const, label: "有（标准）", hint: "使用 Claude Opus 4.5 作为编排器" },
      { value: "max20" as const, label: "有（max20 模式）", hint: "为 Librarian 启用 Claude Sonnet 4.5（满血）" },
    ],
    initialValue: initial.claude,
  })

  if (p.isCancel(claude)) {
    p.cancel("已取消安装。")
    return null
  }

  const openai = await p.select({
    message: "你是否拥有 OpenAI/ChatGPT Plus 订阅？",
    options: [
      { value: "no" as const, label: "没有", hint: "Oracle 将使用回退模型" },
      { value: "yes" as const, label: "有", hint: "Oracle 使用 GPT-5.2（高质量调试）" },
    ],
    initialValue: initial.openai,
  })

  if (p.isCancel(openai)) {
    p.cancel("已取消安装。")
    return null
  }

  const gemini = await p.select({
    message: "是否集成 Google Gemini？",
    options: [
      { value: "no" as const, label: "否", hint: "前端/文档代理将使用回退模型" },
      { value: "yes" as const, label: "是", hint: "使用 Gemini 3 Pro 生成高质量 UI" },
    ],
    initialValue: initial.gemini,
  })

  if (p.isCancel(gemini)) {
    p.cancel("已取消安装。")
    return null
  }

  const copilot = await p.select({
    message: "你是否拥有 GitHub Copilot 订阅？",
    options: [
      { value: "no" as const, label: "没有", hint: "仅使用原生 Provider" },
      { value: "yes" as const, label: "有", hint: "当原生 Provider 不可用时作为回退" },
    ],
    initialValue: initial.copilot,
  })

  if (p.isCancel(copilot)) {
    p.cancel("已取消安装。")
    return null
  }

  const opencodeZen = await p.select({
    message: "你是否可以使用 OpenCode Zen（opencode/ 模型）？",
    options: [
      { value: "no" as const, label: "不可以", hint: "将使用其他已配置的 Provider" },
      { value: "yes" as const, label: "可以", hint: "例如：opencode/claude-opus-4-5、opencode/gpt-5.2 等" },
    ],
    initialValue: initial.opencodeZen,
  })

  if (p.isCancel(opencodeZen)) {
    p.cancel("已取消安装。")
    return null
  }

  const zaiCodingPlan = await p.select({
    message: "你是否拥有 Z.ai Coding Plan 订阅？",
    options: [
      { value: "no" as const, label: "没有", hint: "将使用其他已配置的 Provider" },
      { value: "yes" as const, label: "有", hint: "作为 Librarian / Multimodal Looker 的回退" },
    ],
    initialValue: initial.zaiCodingPlan,
  })

  if (p.isCancel(zaiCodingPlan)) {
    p.cancel("已取消安装。")
    return null
  }

  return {
    hasClaude: claude !== "no",
    isMax20: claude === "max20",
    hasOpenAI: openai === "yes",
    hasGemini: gemini === "yes",
    hasCopilot: copilot === "yes",
    hasOpencodeZen: opencodeZen === "yes",
    hasZaiCodingPlan: zaiCodingPlan === "yes",
  }
}

async function runNonTuiInstall(args: InstallArgs): Promise<number> {
  const validation = validateNonTuiArgs(args)
  if (!validation.valid) {
    printHeader(false)
    printError("参数校验失败：")
    for (const err of validation.errors) {
      console.log(`  ${SYMBOLS.bullet} ${err}`)
    }
    console.log()
    printInfo("用法：bunx oh-my-opencode install --no-tui --claude=<no|yes|max20> --gemini=<no|yes> --copilot=<no|yes>")
    console.log()
    return 1
  }

  const detected = detectCurrentConfig()
  const isUpdate = detected.isInstalled

  printHeader(isUpdate)

  const totalSteps = 6
  let step = 1

  printStep(step++, totalSteps, "检查 OpenCode 安装情况...")
  const installed = await isOpenCodeInstalled()
  const version = await getOpenCodeVersion()
  if (!installed) {
    printWarning("未找到 OpenCode 可执行文件。会继续配置插件，但你需要先安装 OpenCode 才能使用。")
    printInfo("安装说明：https://opencode.ai/docs")
  } else {
    printSuccess(`检测到 OpenCode ${version ?? ""}`)
  }

  if (isUpdate) {
    const initial = detectedToInitialValues(detected)
    printInfo(`当前配置：Claude=${initial.claude}, Gemini=${initial.gemini}`)
  }

  const config = argsToConfig(args)

  printStep(step++, totalSteps, "添加 oh-my-opencode 插件...")
  const pluginResult = await addPluginToOpenCodeConfig(VERSION)
  if (!pluginResult.success) {
    printError(`失败：${pluginResult.error}`)
    return 1
  }
  printSuccess(`插件${isUpdate ? "已验证" : "已添加"} ${SYMBOLS.arrow} ${color.dim(pluginResult.configPath)}`)

  if (config.hasGemini) {
    printStep(step++, totalSteps, "添加认证插件...")
    const authResult = await addAuthPlugins(config)
    if (!authResult.success) {
      printError(`失败：${authResult.error}`)
      return 1
    }
    printSuccess(`认证插件已配置 ${SYMBOLS.arrow} ${color.dim(authResult.configPath)}`)

    printStep(step++, totalSteps, "添加 Provider 配置...")
    const providerResult = addProviderConfig(config)
    if (!providerResult.success) {
      printError(`失败：${providerResult.error}`)
      return 1
    }
    printSuccess(`Provider 配置完成 ${SYMBOLS.arrow} ${color.dim(providerResult.configPath)}`)
  } else {
    step += 2
  }

  printStep(step++, totalSteps, "写入 oh-my-opencode 配置...")
  const omoResult = writeOmoConfig(config)
  if (!omoResult.success) {
    printError(`失败：${omoResult.error}`)
    return 1
  }
  printSuccess(`配置已写入 ${SYMBOLS.arrow} ${color.dim(omoResult.configPath)}`)

  printBox(formatConfigSummary(config), isUpdate ? "配置已更新" : "安装完成")

  if (!config.hasClaude) {
    console.log()
    console.log(color.bgRed(color.white(color.bold(" 重要警告 "))))
    console.log()
    console.log(color.red(color.bold("  Sisyphus 代理强烈建议搭配 Claude Opus 4.5 使用。")))
    console.log(color.red("  若未配置 Claude，你可能会遇到明显的性能下降："))
    console.log(color.dim("    • 编排质量降低"))
    console.log(color.dim("    • 工具选择与委托更弱"))
    console.log(color.dim("    • 任务完成可靠性下降"))
    console.log()
    console.log(color.yellow("  建议订阅 Claude Pro/Max 以获得最佳体验。"))
    console.log()
  }

  if (!config.hasClaude && !config.hasOpenAI && !config.hasGemini && !config.hasCopilot && !config.hasOpencodeZen) {
    printWarning("未配置任何模型 Provider，将使用 opencode/big-pickle 作为回退。")
  }

  console.log(`${SYMBOLS.star} ${color.bold(color.green(isUpdate ? "配置已更新！" : "安装完成！"))}`)
  console.log(`  运行 ${color.cyan("opencode")} 即可开始！`)
  console.log()

  printBox(
    `${color.bold("小贴士：")}在提示词中加入 ${color.cyan("ultrawork")}（或 ${color.cyan("ulw")}）。\n` +
    `所有能力将像“开挂”一样生效：并行代理、后台任务、\n` +
    `深度探索，以及不达目标不罢休的执行。`,
    "魔法关键词"
  )

  console.log(`${SYMBOLS.star} ${color.yellow("如果对你有帮助，欢迎给仓库点个 Star！")}`)
  console.log(`  ${color.dim("gh repo star code-yeongyu/oh-my-opencode")}`)
  console.log()
  console.log(color.dim("oMoMoMoMo... 尽情享用！"))
  console.log()

  if ((config.hasClaude || config.hasGemini || config.hasCopilot) && !args.skipAuth) {
    printBox(
      `运行 ${color.cyan("opencode auth login")} 并选择你的 Provider：\n` +
      (config.hasClaude ? `  ${SYMBOLS.bullet} Anthropic ${color.gray("→ Claude Pro/Max")}\n` : "") +
      (config.hasGemini ? `  ${SYMBOLS.bullet} Google ${color.gray("→ Antigravity OAuth")}\n` : "") +
      (config.hasCopilot ? `  ${SYMBOLS.bullet} GitHub ${color.gray("→ Copilot")}` : ""),
      "认证你的 Provider"
    )
  }

  return 0
}

export async function install(args: InstallArgs): Promise<number> {
  if (!args.tui) {
    return runNonTuiInstall(args)
  }

  const detected = detectCurrentConfig()
  const isUpdate = detected.isInstalled

  p.intro(color.bgMagenta(color.white(isUpdate ? " oMoMoMoMo... 更新 " : " oMoMoMoMo... 安装 ")))

  if (isUpdate) {
    const initial = detectedToInitialValues(detected)
    p.log.info(`检测到已有配置：Claude=${initial.claude}, Gemini=${initial.gemini}`)
  }

  const s = p.spinner()
  s.start("检查 OpenCode 安装情况")

  const installed = await isOpenCodeInstalled()
  const version = await getOpenCodeVersion()
  if (!installed) {
    s.stop(`未找到 OpenCode 可执行文件 ${color.yellow("[!]")}`)
    p.log.warn("未找到 OpenCode 可执行文件。会继续配置插件，但你需要先安装 OpenCode 才能使用。")
    p.note("安装说明：https://opencode.ai/docs", "安装指南")
  } else {
    s.stop(`OpenCode ${version ?? "已安装"} ${color.green("[OK]")}`)
  }

  const config = await runTuiMode(detected)
  if (!config) return 1

  s.start("将 oh-my-opencode 写入 OpenCode 配置")
  const pluginResult = await addPluginToOpenCodeConfig(VERSION)
  if (!pluginResult.success) {
    s.stop(`添加插件失败：${pluginResult.error}`)
    p.outro(color.red("安装失败。"))
    return 1
  }
  s.stop(`插件已写入 ${color.cyan(pluginResult.configPath)}`)

  if (config.hasGemini) {
    s.start("添加认证插件（获取最新版本）")
    const authResult = await addAuthPlugins(config)
    if (!authResult.success) {
      s.stop(`添加认证插件失败：${authResult.error}`)
      p.outro(color.red("安装失败。"))
      return 1
    }
    s.stop(`认证插件已写入 ${color.cyan(authResult.configPath)}`)

    s.start("添加 Provider 配置")
    const providerResult = addProviderConfig(config)
    if (!providerResult.success) {
      s.stop(`添加 Provider 配置失败：${providerResult.error}`)
      p.outro(color.red("安装失败。"))
      return 1
    }
    s.stop(`Provider 配置已写入 ${color.cyan(providerResult.configPath)}`)
  }

  s.start("写入 oh-my-opencode 配置")
  const omoResult = writeOmoConfig(config)
  if (!omoResult.success) {
    s.stop(`写入配置失败：${omoResult.error}`)
    p.outro(color.red("安装失败。"))
    return 1
  }
  s.stop(`配置已写入 ${color.cyan(omoResult.configPath)}`)

  if (!config.hasClaude) {
    console.log()
    console.log(color.bgRed(color.white(color.bold(" 重要警告 "))))
    console.log()
    console.log(color.red(color.bold("  Sisyphus 代理强烈建议搭配 Claude Opus 4.5 使用。")))
    console.log(color.red("  若未配置 Claude，你可能会遇到明显的性能下降："))
    console.log(color.dim("    • 编排质量降低"))
    console.log(color.dim("    • 工具选择与委托更弱"))
    console.log(color.dim("    • 任务完成可靠性下降"))
    console.log()
    console.log(color.yellow("  建议订阅 Claude Pro/Max 以获得最佳体验。"))
    console.log()
  }

  if (!config.hasClaude && !config.hasOpenAI && !config.hasGemini && !config.hasCopilot && !config.hasOpencodeZen) {
    p.log.warn("未配置任何模型 Provider，将使用 opencode/big-pickle 作为回退。")
  }

  p.note(formatConfigSummary(config), isUpdate ? "配置已更新" : "安装完成")

  p.log.success(color.bold(isUpdate ? "配置已更新！" : "安装完成！"))
  p.log.message(`运行 ${color.cyan("opencode")} 即可开始！`)

  p.note(
    `在提示词中加入 ${color.cyan("ultrawork")}（或 ${color.cyan("ulw")}）。\n` +
    `所有能力将像“开挂”一样生效：并行代理、后台任务、\n` +
    `深度探索，以及不达目标不罢休的执行。`,
    "魔法关键词"
  )

  p.log.message(`${color.yellow("★")} 如果对你有帮助，欢迎给仓库点个 Star！`)
  p.log.message(`  ${color.dim("gh repo star code-yeongyu/oh-my-opencode")}`)

  p.outro(color.green("oMoMoMoMo... 尽情享用！"))

  if ((config.hasClaude || config.hasGemini || config.hasCopilot) && !args.skipAuth) {
    const providers: string[] = []
    if (config.hasClaude) providers.push(`Anthropic ${color.gray("→ Claude Pro/Max")}`)
    if (config.hasGemini) providers.push(`Google ${color.gray("→ OAuth with Antigravity")}`)
    if (config.hasCopilot) providers.push(`GitHub ${color.gray("→ Copilot")}`)

    console.log()
    console.log(color.bold("认证你的 Provider"))
    console.log()
    console.log(`   运行 ${color.cyan("opencode auth login")} 并选择：`)
    for (const provider of providers) {
      console.log(`   ${SYMBOLS.bullet} ${provider}`)
    }
    console.log()
  }

  return 0
}
