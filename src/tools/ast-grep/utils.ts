import type { AnalyzeResult, SgResult } from "./types"

export function formatSearchResult(result: SgResult): string {
  if (result.error) {
    return `错误：${result.error}`
  }

  if (result.matches.length === 0) {
    return "未找到匹配项"
  }

  const lines: string[] = []

  if (result.truncated) {
    const reason = result.truncatedReason === "max_matches"
      ? `仅显示前 ${result.matches.length}/${result.totalMatches} 条`
      : result.truncatedReason === "max_output_bytes"
      ? "输出超过 1MB 限制"
      : "搜索超时"
    lines.push(`【已截断】结果已截断（${reason}）\n`)
  }

  lines.push(`找到 ${result.matches.length} 处匹配${result.truncated ? `（从 ${result.totalMatches} 处截断）` : ""}：\n`)

  for (const match of result.matches) {
    const loc = `${match.file}:${match.range.start.line + 1}:${match.range.start.column + 1}`
    lines.push(`${loc}`)
    lines.push(`  ${match.lines.trim()}`)
    lines.push("")
  }

  return lines.join("\n")
}

export function formatReplaceResult(result: SgResult, isDryRun: boolean): string {
  if (result.error) {
    return `错误：${result.error}`
  }

  if (result.matches.length === 0) {
    return "未找到可替换的匹配项"
  }

  const prefix = isDryRun ? "[DRY RUN] " : ""
  const lines: string[] = []

  if (result.truncated) {
    const reason = result.truncatedReason === "max_matches"
      ? `仅显示前 ${result.matches.length}/${result.totalMatches} 条`
      : result.truncatedReason === "max_output_bytes"
      ? "输出超过 1MB 限制"
      : "搜索超时"
    lines.push(`【已截断】结果已截断（${reason}）\n`)
  }

  lines.push(`${prefix}${result.matches.length} 处替换：\n`)

  for (const match of result.matches) {
    const loc = `${match.file}:${match.range.start.line + 1}:${match.range.start.column + 1}`
    lines.push(`${loc}`)
    lines.push(`  ${match.text}`)
    lines.push("")
  }

  if (isDryRun) {
    lines.push("使用 dryRun=false 以应用更改")
  }

  return lines.join("\n")
}

export function formatAnalyzeResult(results: AnalyzeResult[], extractedMetaVars: boolean): string {
  if (results.length === 0) {
    return "未找到匹配项"
  }

  const lines: string[] = [`找到 ${results.length} 处匹配：\n`]

  for (const result of results) {
    const loc = `L${result.range.start.line + 1}:${result.range.start.column + 1}`
    lines.push(`[${loc}] (${result.kind})`)
    lines.push(`  ${result.text}`)

    if (extractedMetaVars && result.metaVariables.length > 0) {
      lines.push("  元变量：")
      for (const mv of result.metaVariables) {
        lines.push(`    $${mv.name} = "${mv.text}" (${mv.kind})`)
      }
    }
    lines.push("")
  }

  return lines.join("\n")
}

export function formatTransformResult(_original: string, transformed: string, editCount: number): string {
  if (editCount === 0) {
    return "未找到可转换的匹配项"
  }

  return `已转换（${editCount} 处编辑）：\n\`\`\`\n${transformed}\n\`\`\``
}
