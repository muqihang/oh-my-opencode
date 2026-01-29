import type { GrepResult, GrepMatch, CountResult } from "./types"

export function formatGrepResult(result: GrepResult): string {
  if (result.error) {
    return `错误：${result.error}`
  }

  if (result.matches.length === 0) {
    return "未找到匹配项"
  }

  const lines: string[] = []

  lines.push(`在 ${result.filesSearched} 个文件中找到 ${result.totalMatches} 处匹配`)
  if (result.truncated) {
    lines.push("【输出已因大小限制被截断】")
  }
  lines.push("")

  const byFile = new Map<string, GrepMatch[]>()
  for (const match of result.matches) {
    const existing = byFile.get(match.file) || []
    existing.push(match)
    byFile.set(match.file, existing)
  }

  for (const [file, matches] of byFile) {
    lines.push(file)
    for (const match of matches) {
      lines.push(`  ${match.line}: ${match.text.trim()}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

export function formatCountResult(results: CountResult[]): string {
  if (results.length === 0) {
    return "未找到匹配项"
  }

  const total = results.reduce((sum, r) => sum + r.count, 0)
  const lines: string[] = [`在 ${results.length} 个文件中找到 ${total} 处匹配：`, ""]

  const sorted = [...results].sort((a, b) => b.count - a.count)

  for (const { file, count } of sorted) {
    lines.push(`  ${count.toString().padStart(6)}: ${file}`)
  }

  return lines.join("\n")
}
