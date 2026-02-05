# OMO Artifacts Bridge JSON-First + Verbose Paths Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Without changing default behavior, make Atlas `delegate_task` prompts prefer the machine-readable OpenCode working-set JSON when available, and make `/start-work` verbose output clearly show the bridge result paths.

**Architecture:** `/start-work` (src/hooks/start-work/index.ts) already writes base evidence artifacts into `.sisyphus/notepads/<plan>/` (markdown index + optional JSON snapshot/history) behind the `experimental.opencode_base_artifacts_bridge.*` gates. Atlas' `delegate_task` prelude injection (src/hooks/atlas/index.ts) should resolve which artifact exists (JSON preferred), and only inject the directive when at least one exists, preserving marker-based idempotency.

**Tech Stack:** TypeScript, Bun test runner, Node fs/path utilities.

---

### Task 1: Atlas delegate_task prompt prefers JSON base evidence

**Files:**
- Modify: `src/hooks/atlas/index.ts`
- Test: `src/hooks/atlas/index.test.ts`

**Step 1: Write the failing test**

Add a new test case:
- Create `.sisyphus/notepads/<plan>/opencode-base-evidence.json` (do NOT create the `.md`)
- Enable `experimental.opencode_base_artifacts_bridge.enabled=true` and `inject_to_delegate_task=true`
- Assert injected prompt includes `opencode-base-evidence.json` and does NOT include `opencode-base-evidence.md`

**Step 2: Run test to verify it fails**

Run: `bun test src/hooks/atlas/index.test.ts`
Expected: FAIL because the hook only checks for the `.md` index today.

**Step 3: Write minimal implementation**

Update Atlas hook to resolve the base evidence artifact path:
- Prefer `.sisyphus/notepads/<plan>/opencode-base-evidence.json` if it exists
- Else fall back to `.sisyphus/notepads/<plan>/opencode-base-evidence.md` if it exists
- Else do not inject the base evidence directive

**Step 4: Run test to verify it passes**

Run: `bun test src/hooks/atlas/index.test.ts`
Expected: PASS.

---

### Task 2: /start-work verbose output shows bridge result paths

**Files:**
- Modify: `src/hooks/start-work/index.ts`
- Test: `src/hooks/start-work/index.test.ts`

**Step 1: Write the failing test**

Add a new test case:
- Enable `experimental.opencode_base_artifacts_bridge.enabled=true`, `write_json=true`, `verbose=true`
- Create a valid `.opencode/evidence/<session>/manifest.json` with allowlisted entries
- Assert `output.parts[0].text` contains:
  - `opencode-base-evidence.md`
  - `opencode-base-evidence.json`
  - `opencode-base-evidence.history.jsonl`

**Step 2: Run test to verify it fails**

Run: `bun test src/hooks/start-work/index.test.ts`
Expected: FAIL because verbose output currently does not include JSON/history paths.

**Step 3: Write minimal implementation**

When `verbose=true` and a manifest is present:
- Always print a bridge summary including:
  - allowlist kinds (or picked count)
  - index path (md)
  - snapshot path (json) + history path (jsonl) if `write_json=true`
- If no changes detected, explicitly print "No changes ..." but still show paths.
- Keep behavior best-effort (any failures should not block /start-work).

**Step 4: Run test to verify it passes**

Run: `bun test src/hooks/start-work/index.test.ts`
Expected: PASS.

---

### Task 3: Verification

Run the required verification commands:
- `bun test src/hooks/atlas/index.test.ts`
- `bun test src/hooks/start-work/index.test.ts`
- `bun test && bun run typecheck`

