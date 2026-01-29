import color from "picocolors"
import type { VersionInfo } from "./types"

const SYMBOLS = {
  check: color.green("[OK]"),
  cross: color.red("[X]"),
  arrow: color.cyan("->"),
  info: color.blue("[i]"),
  warn: color.yellow("[!]"),
  pin: color.magenta("[PINNED]"),
  dev: color.cyan("[DEV]"),
}

export function formatVersionOutput(info: VersionInfo): string {
  const lines: string[] = []

  lines.push("")
  lines.push(color.bold(color.white("oh-my-opencode 版本信息")))
  lines.push(color.dim("─".repeat(50)))
  lines.push("")

  if (info.currentVersion) {
    lines.push(`  当前版本：${color.cyan(info.currentVersion)}`)
  } else {
    lines.push(`  当前版本：${color.dim("未知")}`)
  }

  if (!info.isLocalDev && info.latestVersion) {
    lines.push(`  最新版本：${color.cyan(info.latestVersion)}`)
  }

  lines.push("")

  switch (info.status) {
    case "up-to-date":
      lines.push(`  ${SYMBOLS.check} ${color.green("已是最新版本！")}`)
      break
    case "outdated":
      lines.push(`  ${SYMBOLS.warn} ${color.yellow("有可用更新")}`)
      lines.push(`  ${color.dim("执行：")} ${color.cyan("cd ~/.config/opencode && bun update oh-my-opencode")}`)
      break
    case "local-dev":
      lines.push(`  ${SYMBOLS.dev} ${color.cyan("正在以本地开发模式运行")}`)
      lines.push(`  ${color.dim("正在使用配置中的 file:// 协议")}`)
      break
    case "pinned":
      lines.push(`  ${SYMBOLS.pin} ${color.magenta(`版本已固定为 ${info.pinnedVersion}`)}`)
      lines.push(`  ${color.dim("固定版本已跳过更新检查")}`)
      break
    case "error":
      lines.push(`  ${SYMBOLS.cross} ${color.red("无法检查更新")}`)
      lines.push(`  ${color.dim("网络错误或 npm registry 不可用")}`)
      break
    case "unknown":
      lines.push(`  ${SYMBOLS.info} ${color.yellow("版本信息不可用")}`)
      break
  }

  lines.push("")

  return lines.join("\n")
}

export function formatJsonOutput(info: VersionInfo): string {
  return JSON.stringify(info, null, 2)
}
