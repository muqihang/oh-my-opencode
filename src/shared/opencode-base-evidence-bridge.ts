import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"

const BaseEvidenceEntrySchema = z.object({
  kind: z.string(),
  path: z.string(),
  sha256: z.string(),
})

const BaseEvidenceManifestSchema = z.object({
  specVersion: z.literal("evidence-manifest/1.0"),
  entries: z.array(BaseEvidenceEntrySchema),
}).passthrough()

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

export const DEFAULT_BASE_EVIDENCE_ALLOWLIST = ALLOWLISTED_KINDS as readonly string[]

function isSafeEvidencePath(path: string): boolean {
  if (!path) return false

  const normalized = path.replace(/\\/g, "/")
  if (normalized.startsWith("/")) return false
  if (/^[A-Za-z]:\//.test(normalized)) return false
  if (!normalized.startsWith(".opencode/")) return false

  return !normalized.split("/").some((part) => part === "..")
}

export function selectBaseEvidenceEntries(
  entries: Array<BaseEvidenceEntry>,
  allowlist: readonly string[] = DEFAULT_BASE_EVIDENCE_ALLOWLIST,
): Array<BaseEvidenceEntry> {
  const allowlistSet = new Set(normalizeBaseEvidenceAllowlist(allowlist))

  const picked = entries
    .filter((entry) => allowlistSet.has(entry.kind))
    .filter((entry) => isSafeEvidencePath(entry.path))

  return normalizeBaseEvidenceEntries(picked)
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

export const BASE_EVIDENCE_SNAPSHOT_SCHEMA_VERSION = "omo-opencode-base-evidence/1" as const

export type BaseEvidenceSnapshotEntry = {
  kind: string
  path: string
  sha256: string
}

export type BaseEvidenceSnapshot = {
  schemaVersion: typeof BASE_EVIDENCE_SNAPSHOT_SCHEMA_VERSION
  generatedAtUtc: string
  plan: { name: string }
  source: { manifestPath: string; specVersion: "evidence-manifest/1.0" }
  allowlist: string[]
  entries: BaseEvidenceSnapshotEntry[]
  hash: string
}

const BaseEvidenceSnapshotEntrySchema = z.object({
  kind: z.string(),
  path: z.string(),
  sha256: z.string(),
})

export const BaseEvidenceSnapshotSchema = z.object({
  schemaVersion: z.literal(BASE_EVIDENCE_SNAPSHOT_SCHEMA_VERSION),
  generatedAtUtc: z.string(),
  plan: z.object({ name: z.string() }),
  source: z.object({
    manifestPath: z.string(),
    specVersion: z.literal("evidence-manifest/1.0"),
  }),
  allowlist: z.array(z.string()),
  entries: z.array(BaseEvidenceSnapshotEntrySchema),
  hash: z.string(),
})

export type CreateBaseEvidenceSnapshotInput = {
  generatedAtUtc: string
  planName: string
  manifestPath: string
  allowlist: readonly string[]
  entries: readonly BaseEvidenceEntry[]
}

export function createBaseEvidenceSnapshot(
  input: CreateBaseEvidenceSnapshotInput,
): BaseEvidenceSnapshot {
  const normalizedAllowlist = normalizeBaseEvidenceAllowlist(input.allowlist)
  const normalizedEntries = normalizeBaseEvidenceEntries(input.entries)

  return {
    schemaVersion: BASE_EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    plan: { name: input.planName },
    source: {
      manifestPath: input.manifestPath,
      specVersion: "evidence-manifest/1.0",
    },
    allowlist: normalizedAllowlist,
    entries: normalizedEntries,
    hash: computeBaseEvidenceSnapshotHash({
      allowlist: normalizedAllowlist,
      entries: normalizedEntries,
    }),
  }
}

export function parseBaseEvidenceSnapshot(raw: unknown): BaseEvidenceSnapshot | undefined {
  const parsed = BaseEvidenceSnapshotSchema.safeParse(raw)
  if (!parsed.success) return undefined
  return parsed.data
}

export function computeBaseEvidenceSnapshotHash(input: {
  allowlist: readonly string[]
  entries: readonly BaseEvidenceEntry[]
}): string {
  const normalizedAllowlist = normalizeBaseEvidenceAllowlist(input.allowlist)
  const normalizedEntries = normalizeBaseEvidenceEntries(input.entries)

  const payload = JSON.stringify({
    allowlist: normalizedAllowlist,
    entries: normalizedEntries.map((entry) => ({
      kind: entry.kind,
      path: entry.path,
      sha256: entry.sha256,
    })),
  })

  return createHash("sha256").update(payload).digest("hex")
}

export function normalizeBaseEvidenceAllowlist(allowlist: readonly string[]): string[] {
  return Array.from(new Set(allowlist)).slice().sort((a, b) => a.localeCompare(b))
}

export function normalizeBaseEvidenceEntries(
  entries: readonly BaseEvidenceEntry[],
): Array<BaseEvidenceEntry> {
  const deduped = new Map<string, BaseEvidenceEntry>()

  for (const entry of entries) {
    const key = `${entry.kind}\0${entry.path}\0${entry.sha256}`
    if (deduped.has(key)) continue
    deduped.set(key, {
      kind: entry.kind,
      path: entry.path,
      sha256: entry.sha256,
    })
  }

  return Array.from(deduped.values()).sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.path.localeCompare(b.path) ||
      a.sha256.localeCompare(b.sha256),
  )
}
