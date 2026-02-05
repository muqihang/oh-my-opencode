# Oh-My × OpenCode Full Compat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 在不破坏默认行为的前提下，为 oh-my-opencode 增加一个“可选自动化”的兼容模式：当用户选择 Oh-My 作为派工拥有者（macro-orchestrator）时，可显式 opt-in 让插件在启动时把基座 `OPENCODE_ORCHESTRATOR_FORK_STRATEGY` 缺省值引导/强制为 `suggest`，从而避免双重派工；并补齐文档与测试。

**Architecture:** 扩展 `experimental.opencode_orchestrator_compat` 配置：在现有 `enabled` 的基础上新增 `mode`。将兼容决策封装为纯函数（输入 env + mode → 输出 action），`src/index.ts` 只负责执行 action（warn / enforce-suggest）。

**Tech Stack:** Bun、Zod schema、OpenCode Plugin hooks（`src/index.ts`）、纯函数测试（Bun test）。

**Important Dependency (Base Flag Semantics):**
当前 OpenCode 基座实现里，`Flag.OPENCODE_ORCHESTRATOR_FORK_STRATEGY` 可能在模块加载时读取 env 并缓存为常量。若基座没有把该 flag 做成动态 getter，那么插件在运行时设置 `process.env.OPENCODE_ORCHESTRATOR_FORK_STRATEGY` **可能不会生效**。

因此：
- 本计划的 `mode="warn"` 永远有效（只输出提示）。
- 本计划的 `mode="enforce_suggest"` 只有在 **基座具备动态读取**（或其它稳定契约）时，才能保证生效；否则请要求用户在启动 OpenCode 前设置 env。

**Side Effect Boundary:**
`process.env` 是进程级全局。即便 Oh-My 的 compat 配置是“项目级”，一旦启用 `enforce_suggest` 并写入 env，会影响同一 OpenCode 进程内的其它 session/项目。该模式必须明确标注为“显式 opt-in”。

---

## Task 1: Extend Config Schema（compat.mode）

**Files:**
- Modify: `src/config/schema.ts`
- Test: `src/config/schema.test.ts`

**Step 1: Write failing tests**

In `src/config/schema.test.ts`, add a new `describe` block that asserts:
- `experimental.opencode_orchestrator_compat.enabled` 默认仍是 `false`
- `experimental.opencode_orchestrator_compat.mode`：
  - 缺省时为 `"warn"`（或 `undefined`，但计划推荐设为默认值，便于行为可预测）
  - 允许值：`"warn"`、`"enforce_suggest"`
  - 传入非法值会 parse 失败

**Step 2: Run test to verify it fails**

Run: `bun test src/config/schema.test.ts`  
Expected: FAIL（因为 schema 还没有 mode 字段/默认值）

**Step 3: Implement minimal schema**

In `src/config/schema.ts`:
- Extend `ExperimentalConfigSchema.opencode_orchestrator_compat`:
  - `enabled: z.boolean().default(false)`（保持）
  - `mode: z.enum(["warn", "enforce_suggest"]).default("warn")`（新增）

**Step 4: Run test to verify it passes**

Run: `bun test src/config/schema.test.ts`  
Expected: PASS

**Step 5: Commit**

Commit: `feat(config): add opencode orchestrator compat mode`

---

## Task 2: Make Compat Decision Pure（env → action）

**Files:**
- Modify: `src/shared/orchestrator-compat.ts`
- Test: `src/shared/orchestrator-compat.test.ts`

**Step 1: Write failing tests**

In `src/shared/orchestrator-compat.test.ts`, add cases for `mode`:
- When base orchestrator is OFF (`OPENCODE_EXPERIMENTAL_ORCHESTRATOR!=1`): always `none`
- When base orchestrator is ON and forkStrategy is `suggest`/`off`: `none`
- When base orchestrator is ON and forkStrategy missing/`auto`:
  - `mode="warn"` → returns action `{ kind:"warn", message }`
  - `mode="enforce_suggest"` → returns action `{ kind:"enforce_suggest", message, nextForkStrategy:"suggest" }`

**Step 2: Run test to verify it fails**

Run: `bun test src/shared/orchestrator-compat.test.ts`  
Expected: FAIL（还没有 action resolver）

**Step 3: Implement minimal pure resolver**

In `src/shared/orchestrator-compat.ts`:
- Keep the existing `getOrchestratorForkStrategyCompatWarning(env)` for backward-compat if needed, but prefer:
  - Add `resolveOrchestratorForkStrategyCompat(env, mode)` that returns a discriminated union action:
    - `none`
    - `warn`
    - `enforce_suggest`
- Ensure message text is stable for tests（不要依赖时间/路径）

**Step 4: Run test to verify it passes**

Run: `bun test src/shared/orchestrator-compat.test.ts`  
Expected: PASS

**Step 5: Commit**

Commit: `feat(shared): resolve forkStrategy compat action`

---

## Task 3: Apply Action in Plugin Entry（once-per-process）

**Files:**
- Modify: `src/index.ts`
- Test: (prefer unit test at shared level only; keep index.ts changes minimal)

**Step 1: Add minimal wiring**

In `src/index.ts`:
- Read plugin config:
  - `pluginConfig.experimental?.opencode_orchestrator_compat?.enabled`
  - `pluginConfig.experimental?.opencode_orchestrator_compat?.mode` (default `"warn"`)
- If compat enabled:
  - Call `resolveOrchestratorForkStrategyCompat(process.env, mode)`
  - If `warn`: `console.warn(message)`（保持“一次性”语义）
  - If `enforce_suggest`:
    - Only set `process.env.OPENCODE_ORCHESTRATOR_FORK_STRATEGY="suggest"` when it is missing/auto (never override explicit user setting)
    - Also print one-time warning that includes “已自动设为 suggest（opt-in）”

**Step 2: Smoke verification**

Run: `bun test`  
Expected: PASS

**Step 3: Commit**

Commit: `feat: add optional enforce_suggest compat mode`

---

## Task 4: Update Docs（user-facing）

**Files:**
- Modify: `docs/orchestration-guide.md`

**Step 1: Document new mode**
- Explain the difference between:
  - `enabled=true + mode=warn`（只提示）
  - `enabled=true + mode=enforce_suggest`（显式 opt-in 自动设置缺省 forkStrategy）
- Provide copy/paste config snippet

**Step 2: Verify**

Run: `bun test` (optional, docs-only change)  
Expected: PASS

**Step 3: Commit**

Commit: `docs: document compat enforce_suggest mode`

---

## Task 5 (Optional): Add “Doctor” Command for Compatibility

**Why optional:** 这会增加一个面向用户的入口（更好用），但涉及到更多 UX/命令体系；可延后。

**Idea:** 新增一个轻量命令或 tool 输出当前 env + 推荐配置。
