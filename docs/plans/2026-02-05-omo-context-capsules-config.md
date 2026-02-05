# Context Capsules Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add config-gated support for (1) configurable context capsule directory and (2) preserving full tool output when truncation happens, without changing default behavior.

**Architecture:** Extend `ExperimentalConfigSchema` with `experimental.context_capsules` (defaults preserve current `.opencode/context-capsules`, and preserve feature is opt-in). Wire that config into:
- `tool-output-truncator` (optional "write full raw output to disk + append pointer" when truncation occurs)
- `context-injector` pointerization path (configurable directory; default unchanged)

**Tech Stack:** Bun, TypeScript, Zod, Node `crypto` + `fs` + `path`.

---

### Task 1: Add `experimental.context_capsules` to config schema

**Files:**
- Modify: `src/config/schema.ts`
- Test: `src/config/schema.test.ts`

**Step 1: Write failing test**
- Add a new `describe("OhMyOpenCodeConfigSchema - experimental.context_capsules", ...)` block.
- Assert:
  - `dir` defaults to `.opencode/context-capsules`
  - `preserve_truncated_tool_output` defaults to `false`
  - Custom values are accepted

**Step 2: Run test to verify it fails**

Run: `bun test src/config/schema.test.ts`
Expected: FAIL because the schema does not yet accept `experimental.context_capsules`.

**Step 3: Minimal implementation**
- Add `context_capsules` to `ExperimentalConfigSchema`:
  - `dir: z.string().default(".opencode/context-capsules")`
  - `preserve_truncated_tool_output: z.boolean().default(false)`
- Keep config optional so default behavior remains unchanged.

**Step 4: Run test to verify it passes**

Run: `bun test src/config/schema.test.ts`
Expected: PASS.

---

### Task 2: Preserve full tool output when truncation occurs (opt-in)

**Files:**
- Modify: `src/hooks/tool-output-truncator.ts`
- Test: `src/hooks/tool-output-truncator.test.ts`

**Step 1: Write failing tests**
- Add tests:
  - Feature flag OFF: no file written, no `<context_pointer>` appended.
  - Feature flag ON + truncator returns `{ truncated: true }`:
    - Raw output written to `<ctx.directory>/<experimental.context_capsules.dir>/<sha256>.md`
    - Truncated output ends with `<context_pointer>` including relative path + sha256

**Step 2: Verify RED**

Run: `bun test src/hooks/tool-output-truncator.test.ts`
Expected: FAIL (feature not implemented yet).

**Step 3: Minimal implementation**
- In `tool.execute.after`:
  - Save `raw = output.output` before truncation.
  - After truncation, when `truncated === true` and flag enabled:
    - Write raw file (best-effort, non-blocking)
    - Append pointer to `output.output`

**Step 4: Verify GREEN**

Run: `bun test src/hooks/tool-output-truncator.test.ts`
Expected: PASS.

---

### Task 3: Make pointerize capsule dir configurable (recommended)

**Files:**
- Modify: `src/features/context-injector/pointerize.ts`
- Modify: `src/features/context-injector/injector.ts`
- Modify: `src/index.ts`
- Test: `src/features/context-injector/injector.test.ts`

**Step 1: Write failing test**
- Update the "spills large pending context..." test to:
  - Use `dir: ".sisyphus/context-capsules"`
  - Assert injected pointer contains the `.sisyphus/context-capsules` path
  - Assert the file actually exists

**Step 2: Verify RED**

Run: `bun test src/features/context-injector/injector.test.ts`
Expected: FAIL (dir not configurable / file not in expected path).

**Step 3: Minimal implementation**
- `pointerize`:
  - Add optional `dir?: string` (default `.opencode/context-capsules`)
  - Write file to `resolve(baseDir, dir, `${sha256}.md`)`
- `createContextInjectorMessagesTransformHook`:
  - Accept `{ experimental }` options
  - Pass `dir = experimental?.context_capsules?.dir`
- `src/index.ts`:
  - Pass `pluginConfig.experimental` into the hook.

**Step 4: Verify GREEN**

Run: `bun test src/features/context-injector/injector.test.ts`
Expected: PASS.

---

### Task 4: Docs update

**Files:**
- Modify: `docs/orchestration-guide.md`

**Step 1: Add a short section**
- Document:
  - `experimental.context_capsules.dir` default `.opencode/context-capsules`
  - recommended `.sisyphus/context-capsules`
  - `experimental.context_capsules.preserve_truncated_tool_output` default `false`, how to enable

---

### Task 5: Verification

**Must-run commands (capture output + exit code):**
- `bun test src/hooks/tool-output-truncator.test.ts`
- `bun test src/features/context-injector/injector.test.ts`
- `bun test && bun run typecheck`

