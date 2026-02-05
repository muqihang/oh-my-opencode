import { readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"

const BaseEvidenceEntrySchema = z.object({
  kind: z.string(),
  path: z.string(),
  sha256: z.string(),
})

const BaseEvidenceManifestSchema = z.object({
  entries: z.array(BaseEvidenceEntrySchema),
})

export type BaseEvidenceEntry = z.infer<typeof BaseEvidenceEntrySchema>
export type BaseEvidenceManifest = z.infer<typeof BaseEvidenceManifestSchema>

export type ReadBaseEvidenceManifestInput = {
  baseDir: string
  sessionId: string
}

export function readBaseEvidenceManifest(
  input: ReadBaseEvidenceManifestInput,
): BaseEvidenceManifest | undefined {
  try {
    const manifestPath = join(
      input.baseDir,
      ".opencode",
      "evidence",
      input.sessionId,
      "manifest.json",
    )
    const raw = readFileSync(manifestPath, "utf8")
    const json = JSON.parse(raw)

    const parsed = BaseEvidenceManifestSchema.safeParse(json)
    if (!parsed.success) return undefined
    return parsed.data
  } catch {
    return undefined
  }
}

const ALLOWLISTED_KINDS = [
  "orchestrator-plan",
  "retrieval-hits",
] as const

export function selectBaseEvidenceEntries(
  entries: Array<BaseEvidenceEntry>,
): Array<BaseEvidenceEntry> {
  return entries
    .filter((entry) =>
      (ALLOWLISTED_KINDS as readonly string[]).includes(entry.kind),
    )
    .slice()
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path))
}

export type RenderBaseEvidenceIndexInput = {
  sessionId: string
  planName: string
  manifestPath: string
  entries: Array<BaseEvidenceEntry>
}

export function renderBaseEvidenceIndex(input: RenderBaseEvidenceIndexInput): string {
  const lines: string[] = []

  lines.push("<!-- opencode-base-evidence -->")
  lines.push("")
  lines.push("# opencode-base-evidence")
  lines.push("")
  lines.push(`- sessionId: \`${input.sessionId}\``)
  lines.push(`- plan: \`${input.planName}\``)
  lines.push(`- manifest: \`${input.manifestPath}\``)
  lines.push("")

  if (input.entries.length === 0) {
    lines.push("_No allowlisted evidence entries found in manifest._")
    lines.push("")
    return lines.join("\n")
  }

  lines.push("| kind | path | sha256 |")
  lines.push("| --- | --- | --- |")

  for (const entry of input.entries) {
    lines.push(`| ${entry.kind} | \`${entry.path}\` | \`${entry.sha256}\` |`)
  }

  lines.push("")
  return lines.join("\n")
}

