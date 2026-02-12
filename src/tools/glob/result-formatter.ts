import type { GlobResult } from "./types"

export function formatGlobResult(result: GlobResult): string {
  if (result.error) {
    return `错误：${result.error}`
  }

  if (result.files.length === 0) {
    return "未找到文件"
  }

  const lines: string[] = []
  lines.push(`找到 ${result.totalFiles} 个文件`)
  lines.push("")

  for (const file of result.files) {
    lines.push(file.path)
  }

  if (result.truncated) {
    lines.push("")
    lines.push("（结果已截断。请考虑使用更具体的路径或 pattern。）")
  }

  return lines.join("\n")
}
