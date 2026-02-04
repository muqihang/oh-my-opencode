# Orchestrator Compat Warning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an opt-in Oh-My-OpenCode compatibility warning to prevent double-dispatch when OpenCode base orchestrator auto-dispatch is enabled.

**Architecture:**
- Add a small experimental config flag to gate behavior.
- Implement a pure env-checking function returning `{ shouldWarn, message }`.
- Call it once on plugin startup and print a visible warning if needed.

**Tech Stack:** Bun, TypeScript, Zod, `bun:test`

---

### Task 1: Add compat checker tests (RED)

**Files:**
- Create: `src/shared/orchestrator-compat.test.ts`

**Step 1: Write failing tests**
- Cover:
  - orchestrator on + forkStrategy `auto`/`undefined` => `shouldWarn=true`
  - orchestrator on + forkStrategy `suggest`/`off` => `shouldWarn=false`
  - orchestrator off => `shouldWarn=false`

**Step 2: Run test to verify it fails**
Run: `bun test src/shared/orchestrator-compat.test.ts`
Expected: FAIL (module/function not found)

### Task 2: Implement compat checker (GREEN)

**Files:**
- Create: `src/shared/orchestrator-compat.ts`
- Modify: `src/shared/index.ts`

**Step 1: Implement minimal function**
- Export `getOrchestratorForkStrategyCompatWarning(env)`
- Return stable warning message recommending `OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest`

**Step 2: Run test to verify it passes**
Run: `bun test src/shared/orchestrator-compat.test.ts`
Expected: PASS

### Task 3: Add config schema + tests (RED)

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/schema.test.ts`

**Step 1: Write failing schema test**
- Ensure config containing `experimental.opencode_orchestrator_compat.enabled` parses.

**Step 2: Run test to verify it fails**
Run: `bun test src/config/schema.test.ts`
Expected: FAIL (unknown key or missing schema)

### Task 4: Implement config field (GREEN)

**Files:**
- Modify: `src/config/schema.ts`

**Step 1: Add `experimental.opencode_orchestrator_compat` block**
- Keep it optional and default-off.

**Step 2: Run schema tests**
Run: `bun test src/config/schema.test.ts`
Expected: PASS

### Task 5: Wire warning into startup (GREEN)

**Files:**
- Modify: `src/index.ts`

**Step 1: Call compat check once during plugin load**
- Only when config flag enabled.
- Warn only when checker says `shouldWarn`.

**Step 2: Run targeted tests**
Run: `bun test src/index.test.ts`
Expected: PASS

### Task 6: Add user-facing documentation

**Files:**
- Modify: `docs/orchestration-guide.md` (or `README.md`)

**Step 1: Document recommended env combination**
- `OPENCODE_EXPERIMENTAL_ORCHESTRATOR=1`
- `OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest`
- Explain why: base prints suggestions, Oh-My handles actual dispatch.

### Task 7: Full verification

**Step 1: Run full test suite**
Run: `bun test`
Expected: PASS

**Step 2: Run typecheck**
Run: `bun run typecheck`
Expected: PASS

