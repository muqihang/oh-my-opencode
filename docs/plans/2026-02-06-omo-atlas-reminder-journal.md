# Atlas Reminder Denoise + Journal (atlas_journal) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an opt-in (config-gated) “atlas journal” feature that reduces main-session context bloat after `delegate_task` by (1) appending the *full* long reminder + file-change summary to an append-only journal file under `.sisyphus/`, and (2) optionally replacing the in-chat long reminder with a fixed 7-sentence short reminder + journal pointer, while preserving the subagent report body in chat.

**Architecture:** Extend `ExperimentalConfigSchema` with `experimental.atlas_journal` (disabled by default). In `src/hooks/atlas/index.ts` `tool.execute.after` for `delegate_task`, compute the existing (legacy) output first, then (when enabled) best-effort append a journal entry. If journal write succeeds and `short_reminder=true`, swap to a short 7-sentence reminder + pointer; if journal write fails, fall back to legacy output (never blocking the tool call).

**Tech Stack:** Bun, TypeScript, Zod, Node `fs` + `path` + `crypto`.

---

### Task 1: Add `experimental.atlas_journal` config schema (defaults preserve current behavior)

**Files:**
- Modify: `src/config/schema.ts`
- Test: `src/config/schema.test.ts`

**Step 1: Write failing tests**

Add a new schema test block:
- Accepts:
  - `experimental.atlas_journal.enabled: true`
  - `experimental.atlas_journal.short_reminder: false`
  - `experimental.atlas_journal.path_mode: "plan-notepad" | "global"`
  - `experimental.atlas_journal.verbose: true`
- Defaults:
  - `enabled` defaults to `false`
  - `short_reminder` defaults to `true`
  - `path_mode` defaults to `"plan-notepad"`
  - `verbose` defaults to `false`

**Step 2: Verify RED**

Run: `bun test src/config/schema.test.ts`  
Expected: FAIL because `atlas_journal` is not yet in the schema.

**Step 3: Minimal implementation**

In `ExperimentalConfigSchema`, add:
- `atlas_journal: { enabled, short_reminder, path_mode, verbose }` (all defaults as above)

**Step 4: Verify GREEN**

Run: `bun test src/config/schema.test.ts`  
Expected: PASS.

---

### Task 2: v0 (safety net) — journal append-only logging without changing chat output

**Files:**
- Modify: `src/hooks/atlas/index.ts`
- Test: `src/hooks/atlas/index.test.ts`

**Step 1: Write failing test (boulder present)**

Add a test:
- Given:
  - Caller is Atlas
  - Boulder state exists (`plan_name="demo"`)
  - `experimental.atlas_journal.enabled=true`
  - `experimental.atlas_journal.short_reminder=false`
- When:
  - `tool.execute.after` runs for `delegate_task`
- Then:
  - Output still contains legacy long reminder markers
  - Journal file exists at `.sisyphus/notepads/demo/atlas-journal.md`
  - Journal content contains timestamp/session/fileChanges/fullReminder metadata

**Step 2: Verify RED**

Run: `bun test src/hooks/atlas/index.test.ts`  
Expected: FAIL before implementation.

**Step 3: Minimal implementation**

In `delegate_task` after-hook:
- Build existing legacy output first
- If `experimental.atlas_journal.enabled === true`:
  - Resolve journal path
  - Best-effort append entry
  - Never throw

**Step 4: Verify GREEN**

Run: `bun test src/hooks/atlas/index.test.ts`  
Expected: PASS.

---

### Task 3: v1 (value) — replace long reminder with fixed 7-sentence short reminder when write succeeds

**Files:**
- Modify: `src/hooks/atlas/index.ts`
- Test: `src/hooks/atlas/index.test.ts`

**Step 1: Write failing tests**

Add tests:
1) Enabled + boulder:
- Output includes Subagent Response body
- Output includes 7-line short reminder key phrases
- Output includes journal pointer path
- Output excludes `[FILE CHANGES SUMMARY]`

2) Enabled + no boulder:
- Journal path falls back to `.sisyphus/notepads/_global/atlas-journal.md`
- Output includes standalone short reminder with todowrite wording

**Step 2: Verify RED**

Run: `bun test src/hooks/atlas/index.test.ts`  
Expected: FAIL before implementation.

**Step 3: Minimal implementation**

- Add short reminder builder with fixed 7 lines
- If journal write succeeds and `short_reminder=true`, output short reminder
- Else keep legacy output

**Step 4: Verify GREEN**

Run: `bun test src/hooks/atlas/index.test.ts`  
Expected: PASS.

---

### Task 4: v1 (must-have) — write failure fallback to legacy output

**Files:**
- Modify: `src/hooks/atlas/index.ts`
- Test: `src/hooks/atlas/index.test.ts`

**Step 1: Write failing test**

Force write failure and assert:
- Output remains legacy long reminder + fileChanges
- No short reminder emitted

**Step 2: Verify RED**

Run: `bun test src/hooks/atlas/index.test.ts`  
Expected: FAIL before fix.

**Step 3: Minimal implementation**

- Attempt journal append first
- Only switch to short reminder on successful append
- On append failure, keep legacy output

**Step 4: Verify GREEN**

Run: `bun test src/hooks/atlas/index.test.ts`  
Expected: PASS.

---

### Task 5: v1.1 (quality) — idempotency for same `delegate_task` call

**Files:**
- Modify: `src/hooks/atlas/index.ts`
- Test: `src/hooks/atlas/index.test.ts`

**Step 1: Write failing test**

Invoke after-hook twice with same `callID` and assert one journal entry only.

**Step 2: Verify RED**

Run: `bun test src/hooks/atlas/index.test.ts`  
Expected: FAIL before dedupe.

**Step 3: Minimal implementation**

- Use `callID` (or hash fallback) as entry id marker
- Skip append if marker already exists

**Step 4: Verify GREEN**

Run: `bun test src/hooks/atlas/index.test.ts`  
Expected: PASS.

---

### Task 6: v1.2 docs

**Files:**
- Modify: `docs/orchestration-guide.md`

**Step 1: Add section**

Document:
- Config keys and defaults
- Output behavior when enabled/disabled
- Journal paths
- Failure fallback behavior
- Why this reduces context bloat without hiding Subagent Response

---

### Task 7: Final verification

Run:
- `bun test src/hooks/atlas/index.test.ts`
- `bun test && bun run typecheck`

Expected:
- Exit code 0 for both commands.
