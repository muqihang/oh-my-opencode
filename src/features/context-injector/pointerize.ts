import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve, join } from "node:path"

export interface PointerizeInput {
  sessionID: string
  text: string
  maxChars: number
  baseDir: string
}

export type PointerizeResult =
  | { mode: "inline"; text: string }
  | { mode: "pointer"; text: string; path: string; sha256: string }

/**
 * 将超出预算的大文本落盘为指针，避免直接注入长内容。
 */
export function pointerize(input: PointerizeInput): PointerizeResult {
  if (input.text.length <= input.maxChars) {
    return { mode: "inline", text: input.text }
  }

  const sha256 = createHash("sha256").update(input.text, "utf8").digest("hex")
  const baseDir = resolve(input.baseDir || process.cwd())
  const capsuleDir = join(baseDir, ".opencode", "context-capsules")
  const filePath = join(capsuleDir, `${sha256}.md`)

  mkdirSync(capsuleDir, { recursive: true })
  writeFileSync(filePath, input.text, "utf8")

  return {
    mode: "pointer",
    path: filePath,
    sha256,
    text: `<context_pointer>\npath: ${filePath}\nsha256: ${sha256}\n</context_pointer>`,
  }
}
