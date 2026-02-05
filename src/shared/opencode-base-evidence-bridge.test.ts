import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createHash } from "node:crypto"
import {
  readBaseEvidenceManifest,
  renderBaseEvidenceIndex,
  selectBaseEvidenceEntries,
} from "./opencode-base-evidence-bridge"
import * as bridge from "./opencode-base-evidence-bridge"

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

  test("selectBaseEvidenceEntries supports allowlist override and dedupes entries", () => {
    //#given - unsorted + duplicated entries and a custom allowlist
    const entries = [
      { kind: "custom-kind", path: ".opencode/artifacts/ses/custom/a.json", sha256: "c" },
      { kind: "custom-kind", path: ".opencode/artifacts/ses/custom/a.json", sha256: "c" }, // duplicate
      { kind: "orchestrator-plan", path: ".opencode/artifacts/ses/orch/x.json", sha256: "a" },
    ]

    //#when
    const picked = selectBaseEvidenceEntries(entries, ["custom-kind"])

    //#then - only custom-kind remains and duplicate is removed
    expect(picked).toEqual([
      { kind: "custom-kind", path: ".opencode/artifacts/ses/custom/a.json", sha256: "c" },
    ])
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

  test("createBaseEvidenceSnapshot normalizes allowlist + entries and produces deterministic hash", () => {
    //#given
    const createBaseEvidenceSnapshot = (bridge as any).createBaseEvidenceSnapshot as
      | undefined
      | ((input: any) => any)

    const generatedAtUtc = "2026-02-05T00:00:00.000Z"
    const allowlistInput = ["retrieval-hits", "orchestrator-plan", "retrieval-hits"]
    const entriesInput = [
      // unsafe path should not be present because caller should pass picked entries, but normalization should handle duplicates/sort
      { kind: "retrieval-hits", path: ".opencode/artifacts/ses/r/hits.json", sha256: "bbb" },
      { kind: "orchestrator-plan", path: ".opencode/artifacts/ses/o/plan.json", sha256: "aaa" },
      { kind: "retrieval-hits", path: ".opencode/artifacts/ses/r/hits.json", sha256: "bbb" }, // duplicate
    ]

    //#when
    expect(typeof createBaseEvidenceSnapshot).toBe("function")

    const snapshot = createBaseEvidenceSnapshot?.({
      generatedAtUtc,
      planName: "demo-plan",
      manifestPath: ".opencode/evidence/ses_123/manifest.json",
      allowlist: allowlistInput,
      entries: entriesInput,
    })

    //#then
    expect(snapshot).toMatchObject({
      schemaVersion: "omo-opencode-base-evidence/1",
      generatedAtUtc,
      plan: { name: "demo-plan" },
      source: {
        manifestPath: ".opencode/evidence/ses_123/manifest.json",
        specVersion: "evidence-manifest/1.0",
      },
      allowlist: ["orchestrator-plan", "retrieval-hits"],
      entries: [
        { kind: "orchestrator-plan", path: ".opencode/artifacts/ses/o/plan.json", sha256: "aaa" },
        { kind: "retrieval-hits", path: ".opencode/artifacts/ses/r/hits.json", sha256: "bbb" },
      ],
    })

    const expectedHash = createHash("sha256")
      .update(
        JSON.stringify({
          allowlist: ["orchestrator-plan", "retrieval-hits"],
          entries: [
            { kind: "orchestrator-plan", path: ".opencode/artifacts/ses/o/plan.json", sha256: "aaa" },
            { kind: "retrieval-hits", path: ".opencode/artifacts/ses/r/hits.json", sha256: "bbb" },
          ],
        }),
      )
      .digest("hex")

    expect(snapshot.hash).toBe(expectedHash)
  })
})
