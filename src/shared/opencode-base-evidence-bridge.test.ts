import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  readBaseEvidenceManifest,
  renderBaseEvidenceIndex,
  selectBaseEvidenceEntries,
} from "./opencode-base-evidence-bridge"

describe("opencode base evidence bridge", () => {
  test("selectBaseEvidenceEntries filters allowlisted kinds", () => {
    //#given - a minimal manifest entries list
    const entries = [
      {
        kind: "orchestrator-plan",
        path: ".opencode/artifacts/ses/orchestrator/x/orchestrator.plan.json",
        sha256: "a",
      },
      { kind: "retrieval-hits", path: ".opencode/artifacts/ses/retrieval/r/hits.json", sha256: "b" },
      { kind: "random-kind", path: "x", sha256: "c" },
    ]

    //#when
    const picked = selectBaseEvidenceEntries(entries)

    //#then
    expect(picked.map((x) => x.kind)).toEqual(["orchestrator-plan", "retrieval-hits"])
  })

  test("renderBaseEvidenceIndex produces stable markdown", () => {
    //#given
    const md = renderBaseEvidenceIndex({
      sessionId: "ses_123",
      planName: "demo",
      manifestPath: ".opencode/evidence/ses_123/manifest.json",
      entries: [
        {
          kind: "orchestrator-plan",
          path: ".opencode/artifacts/ses_123/orchestrator/01/orchestrator.plan.json",
          sha256: "dead",
        },
      ],
    })

    //#then
    expect(md).toContain("opencode-base-evidence")
    expect(md).toContain("orchestrator-plan")
    expect(md).toContain("dead")
  })

  test("readBaseEvidenceManifest reads manifest entries from disk", () => {
    //#given
    const baseDir = mkdtempSync(join(tmpdir(), "omo-base-evidence-"))
    const sessionId = "ses_123"
    const manifestPath = join(baseDir, ".opencode", "evidence", sessionId, "manifest.json")
    mkdirSync(dirname(manifestPath), { recursive: true })
    writeFileSync(
      manifestPath,
      JSON.stringify({
        specVersion: "evidence-manifest/1.0",
        entries: [
          {
            kind: "orchestrator-plan",
            path: ".opencode/artifacts/ses_123/orchestrator/01/orchestrator.plan.json",
            sha256: "dead",
            extra: "ignored",
          },
        ],
        extra_root: "ignored",
      }),
      "utf8",
    )

    //#when
    const parsed = readBaseEvidenceManifest({ baseDir, sessionId })

    //#then
    expect(parsed?.entries).toEqual([
      {
        kind: "orchestrator-plan",
        path: ".opencode/artifacts/ses_123/orchestrator/01/orchestrator.plan.json",
        sha256: "dead",
      },
    ])
  })

  test("readBaseEvidenceManifest rejects unsupported specVersion", () => {
    //#given
    const baseDir = mkdtempSync(join(tmpdir(), "omo-base-evidence-"))
    const sessionId = "ses_123"
    const manifestPath = join(baseDir, ".opencode", "evidence", sessionId, "manifest.json")
    mkdirSync(dirname(manifestPath), { recursive: true })
    writeFileSync(
      manifestPath,
      JSON.stringify({
        specVersion: "evidence-manifest/2.0",
        entries: [],
      }),
      "utf8",
    )

    //#when
    const parsed = readBaseEvidenceManifest({ baseDir, sessionId })

    //#then
    expect(parsed).toBeUndefined()
  })

  test("selectBaseEvidenceEntries rejects unsafe paths", () => {
    //#given
    const entries = [
      {
        kind: "orchestrator-plan",
        path: "../secrets.txt",
        sha256: "a",
      },
      {
        kind: "orchestrator-plan",
        path: ".opencode/artifacts/ses/orchestrator/x/orchestrator.plan.json",
        sha256: "b",
      },
    ]

    //#when
    const picked = selectBaseEvidenceEntries(entries)

    //#then
    expect(picked).toEqual([
      {
        kind: "orchestrator-plan",
        path: ".opencode/artifacts/ses/orchestrator/x/orchestrator.plan.json",
        sha256: "b",
      },
    ])
  })
})
