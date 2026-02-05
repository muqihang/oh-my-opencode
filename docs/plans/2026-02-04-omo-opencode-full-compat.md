# Oh-My × OpenCode Full Compat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 在不破坏默认行为的前提下，让 OpenCode 基座 orchestrator（micro）与 Oh-My 插件编排（macro）稳定共存：
- 永不双派工（避免重复子会话 / 重复任务）
- 优先走“产品化配置”（减少用户去配 env 的心智负担）
- 为后续“计划/证据桥接”与“复制成律师插件”留出稳定接口

**Architecture (recommended):**
- **Config-first handshake**：优先用 OpenCode `product.mode` / `product.forkStrategy` 作为“谁派工”的单一真相源。
- **Oh-My compat = 检测 + 提示**：只做 best-effort 检测与一次性警告，不在运行时修改 `process.env`（避免进程级副作用与“不生效”风险）。
- **Future (opt-in)**：提供 `doctor` 检查命令；再考虑基座产物（plan/evidence pointers）到 Oh-My `.sisyphus` 的桥接。

**Tech Stack:** Bun、TypeScript、Zod、OpenCode Plugin hooks（`src/index.ts`）、纯函数测试（Bun test）。

**Status (2026-02-05):**
Milestone 1 已落地：compat warning 现在会优先读取 OpenCode `product` 配置（若可获取）来避免误报，并更新了用户文档。

---

## Milestone 1: Product-aware compat warning (Required)

> 目标：当用户已经设置 `product.mode=programming` / `product.forkStrategy=suggest` 时，不要误报警；只有基座解析结果确实是 `auto` 才提示“可能双派工”。

**Files (implemented):**
- Modify: `src/shared/orchestrator-compat.ts`
- Test: `src/shared/orchestrator-compat.test.ts`
- Modify: `src/index.ts` (best-effort fetch OpenCode config via `ctx.client.config.get()`)
- Modify: `docs/orchestration-guide.md`
- Update design/plan docs:
  - `docs/plans/2026-02-04-omo-orchestrator-compat-design.md`
  - `docs/plans/2026-02-04-omo-orchestrator-compat.md`

**Verification:**
- `bun test src/shared/orchestrator-compat.test.ts`
- `bun test`
- `bun run typecheck`

---

## Milestone 2 (Optional): Add “Doctor” check (Compatibility)

> 目标：给用户一个“一键诊断”入口，告诉他当前配置是否会双派工，并输出可复制的修复片段（不自动写配置）。

**Files:**
- Add: `src/cli/checks/orchestrator-compat.ts` (or similar, keep it small)
- Modify: `src/cli/index.ts` / existing doctor registry (hook it in)
- Test: `src/cli/checks/orchestrator-compat.test.ts` (pure, no network)
- Docs: `docs/orchestration-guide.md` (add “doctor” usage)

**Rules:**
- 输出必须明确区分：
  - “已安全（suggest/off）”
  - “有风险（auto）”
  - “无法判定（读取 config 失败）→ 给出兜底建议”
- 不要自动写 `opencode.json`，只输出建议片段：
  - `{ "product": { "mode": "programming" } }`
  - `{ "product": { "forkStrategy": "suggest" } }`

---

## Milestone 3 (Optional): Bridge base signals → Oh-My hints (Prompt-only)

> 目标：当基座在 fork 场景给出“建议派工”时，Oh-My 可以用极短提示引导用户走 `/start-work` / `delegate_task`，但不自动派工。

**Guardrails:**
- 只在明确能拿到稳定信号（events/artifacts）时启用；拿不到就不做（不要解析自然语言大段输出）。
- 默认关闭，显式 opt-in。
