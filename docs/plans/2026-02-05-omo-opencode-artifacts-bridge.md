# OpenCode Base Artifacts Bridge Implementation Plan (Oh-My-OpenCode)

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 在不改变 Oh-My 默认行为的前提下，新增一个可选（默认关闭）的“基座产物桥接”能力：当用户 `/start-work` 进入执行态时，自动把 OpenCode 基座 `.opencode/evidence/<sessionId>/manifest.json` 里的关键产物整理成一份 Markdown 索引，写入 `.sisyphus/notepads/<plan-name>/opencode-base-evidence.md`，供 Atlas/子会话复用与审计。

**Architecture:**  
- Config gating：`experimental.opencode_base_artifacts_bridge.enabled`（默认 false）。  
- 数据源：仅读取基座 manifest（结构化、可测），不解析自然语言。  
- 输出：只写 notepads，不改 plan，不改 env，不阻断 `/start-work`。  

**Tech Stack:** Bun、TypeScript、Zod、Bun test（BDD 注释 `//#given/#when/#then`）。

---

## Task 1: 增加 config schema（只加字段，不改行为）

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/schema.test.ts`

**Step 1: 写 failing 测试（RED）**

在 `src/config/schema.test.ts` 新增用例：

```ts
//#given - config with base artifacts bridge enabled
const input = {
  experimental: { opencode_base_artifacts_bridge: { enabled: true } },
}

//#when - parse schema
const parsed = OhMyOpenCodeConfigSchema.safeParse(input)

//#then - should succeed and keep enabled=true
expect(parsed.success).toBe(true)
if (parsed.success) {
  expect(parsed.data.experimental?.opencode_base_artifacts_bridge?.enabled).toBe(true)
}
```

**Step 2: 运行测试确认失败（RED evidence）**

Run: `bun test src/config/schema.test.ts`  
Expected: FAIL（schema 未包含该字段）

**Step 3: 最小实现（GREEN）**

在 `ExperimentalConfigSchema` 增加：

```ts
opencode_base_artifacts_bridge: z.object({
  enabled: z.boolean().default(false),
}).optional(),
```

**Step 4: 运行测试确认通过（GREEN evidence）**

Run: `bun test src/config/schema.test.ts`  
Expected: PASS

**Step 5: Commit**

`git add src/config/schema.ts src/config/schema.test.ts && git commit -m "feat(config): add opencode base artifacts bridge flag"`

---

## Task 2: 增加 manifest 读取 + allowlist 过滤 + markdown 渲染（纯函数模块）

**Files:**
- Add: `src/shared/opencode-base-evidence-bridge.ts`
- Add: `src/shared/opencode-base-evidence-bridge.test.ts`
- Modify: `src/shared/index.ts`（导出函数）

**Step 1: 写 failing 测试（RED）**

`src/shared/opencode-base-evidence-bridge.test.ts`：

```ts
import { describe, test, expect } from "bun:test"
import { selectBaseEvidenceEntries, renderBaseEvidenceIndex } from "./opencode-base-evidence-bridge"

describe("opencode base evidence bridge", () => {
  test("selectBaseEvidenceEntries filters allowlisted kinds", () => {
    //#given - a minimal manifest entries list
    const entries = [
      { kind: "orchestrator-plan", path: ".opencode/artifacts/ses/orchestrator/x/orchestrator.plan.json", sha256: "a" },
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
        { kind: "orchestrator-plan", path: ".opencode/artifacts/ses_123/orchestrator/01/orchestrator.plan.json", sha256: "dead" },
      ],
    })

    //#then
    expect(md).toContain("opencode-base-evidence")
    expect(md).toContain("orchestrator-plan")
    expect(md).toContain("dead")
  })
})
```

**Step 2: 运行测试确认失败（RED evidence）**

Run: `bun test src/shared/opencode-base-evidence-bridge.test.ts`  
Expected: FAIL（模块不存在）

**Step 3: 最小实现（GREEN）**

在 `src/shared/opencode-base-evidence-bridge.ts` 实现：
- `readBaseEvidenceManifest({ baseDir, sessionId })`：读取并 parse manifest（best-effort，失败返回 undefined）
- `selectBaseEvidenceEntries(entries)`：按 allowlist 过滤、稳定排序
- `renderBaseEvidenceIndex({ sessionId, planName, manifestPath, entries })`：输出 markdown

建议 Zod schema（只保留必要字段）：
- manifest：`entries: Array<{ kind, path, sha256 }>`

**Step 4: 运行测试确认通过（GREEN evidence）**

Run: `bun test src/shared/opencode-base-evidence-bridge.test.ts`  
Expected: PASS

**Step 5: Commit**

`git add src/shared/opencode-base-evidence-bridge* src/shared/index.ts && git commit -m "feat(shared): add base evidence bridge helpers"`

---

## Task 3: 在 /start-work 里写入 notepads 索引（集成，best-effort）

**Files:**
- Modify: `src/index.ts`（把 experimental config 传给 start-work hook）
- Modify: `src/hooks/start-work/index.ts`
- Modify: `src/hooks/start-work/index.test.ts`

**Step 1: 写 failing 集成测试（RED）**

在 `src/hooks/start-work/index.test.ts` 新增用例（用现有 tmpdir 结构）：
- 预置：
  - `.sisyphus/plans/demo.md`（含至少一个未完成 checkbox）
  - `.opencode/evidence/<sessionId>/manifest.json`（含 allowlisted entry）
- 触发：模拟 `/start-work` 输出包含 `<session-context>`
- 断言：
  - `.sisyphus/notepads/demo/opencode-base-evidence.md` 存在
  - 内容包含 `orchestrator-plan` / `sha256`
  - `/start-work` 输出文本里包含索引路径（例如 `opencode-base-evidence.md`）

再加一个用例（覆盖 append 行为）：
- 预置：先写入一段旧内容到 `.sisyphus/notepads/demo/opencode-base-evidence.md`
- 触发：再次 `/start-work`
- 断言：文件仍包含旧内容 + 新段落（不覆盖）

**Step 2: 运行测试确认失败（RED evidence）**

Run: `bun test src/hooks/start-work/index.test.ts`  
Expected: FAIL（文件未生成）

**Step 3: 最小实现（GREEN）**

实现策略：
1) 修改 `createStartWorkHook(ctx)` 签名为：
   - `createStartWorkHook(ctx, options?: { experimental?: ExperimentalConfig })`
2) `src/index.ts` 调用变更：
   - `createStartWorkHook(ctx, { experimental: pluginConfig.experimental })`
3) 在 start-work hook 内：
   - 当确定了 plan（新建 boulder 或恢复）后，如果 `experimental.opencode_base_artifacts_bridge.enabled === true`：
     - 读取 `.opencode/evidence/<sessionId>/manifest.json`
     - 渲染 markdown
     - 写入 `.sisyphus/notepads/<plan-name>/opencode-base-evidence.md`（目录不存在就 mkdir）
       - **如果文件已存在：追加（append）一个新段落**，带 timestamp（避免覆盖掉人工记录/旧索引）
     - 把索引文件路径回写到 `/start-work` 的输出文本里（让用户/Atlas 立刻看到在哪里）
   - 所有桥接失败都 catch 并 log（不得阻断）

**Step 4: 运行测试确认通过（GREEN evidence）**

Run: `bun test src/hooks/start-work/index.test.ts`  
Expected: PASS

**Step 5: Commit**

`git add src/index.ts src/hooks/start-work/* && git commit -m "feat(start-work): bridge opencode base evidence into notepads"`

---

## Task 4: 文档补充（用户能看懂的用法）

**Files:**
- Modify: `docs/orchestration-guide.md`

**Step 1: 增加一节说明**
- 说明“这是什么 / 解决什么问题 / 默认关闭 / 如何开启”
- 明确产物路径：`.sisyphus/notepads/<plan-name>/opencode-base-evidence.md`

**Step 2: 验证**

Run: `bun test`  
Expected: PASS

**Step 3: Commit**

`git add docs/orchestration-guide.md && git commit -m "docs: document base evidence bridge"`

---

## Final Verification (Required)

Run:
- `bun test`
- `bun run typecheck`

Expected:
- exit code 0
- `git status --porcelain` empty

---

## Follow-ups（V1 / V2，执行完 V0 立刻推进）

> 这两项 **不包含在本次 V0 的实现里**，但我们把它们写在这里，确保 V0 合并后不丢节奏。

### V1 前置（必须）：先修 delegate_task 注入机制（prompt 组合器 / composer）

> 用白话说：现在有多个 hook 都想往 `delegate_task` prompt 前面塞提示，但用同一个“全局标记”判断是否注入过，导致谁先跑谁赢。  
> V1 要再加“先读工作集索引”，会把这种不确定性放大，所以必须先把注入机制修成**确定、可预测、可测试**。

- 在 `atlas` hook 内实现一个小的“prompt 组合器（composer）”：
  - 所有对 `delegate_task` 的 prepend 都集中在一个地方按固定顺序拼接（例如：单任务约束 / notepad 指令 / base evidence 指令）。
  - 每一段提示用自己的 marker 做幂等（idempotent），不要再用 `SYSTEM_DIRECTIVE_PREFIX` 这种全局粗判断来决定“注入过没注入过”。
- 测试至少覆盖 3 件事（否则别进入 V1）：
  1) 有索引 / 没索引时行为正确  
  2) 同一任务重复 `delegate_task` 不会重复塞一堆提示（幂等）  
  3) 原 prompt 不会被吞掉/覆盖（只做 prepend）

### V1：子会话自动优先复用索引（Working Set 注入）

- 在 `atlas` hook 的 `tool.execute.before` 针对 `delegate_task`：
  - 当 boulder 存在且 `.sisyphus/notepads/<plan>/opencode-base-evidence.md` 存在时，prepend 一句非常短的硬指令：
    - “先读这个 notepad 索引，再决定要不要检索/扫描；优先复用索引里的路径/指针。”
- 新增 gated 配置：`experimental.opencode_base_artifacts_bridge.inject_to_delegate_task`（默认 false）
- 防御性增强（建议并入 V1，一次性把“悄悄失效”的风险降到最低）：
  - 版本门控：只支持 `evidence-manifest/1.0`；遇到其它 `specVersion` 不阻断，但必须 log（可选输出一条简短提示，见 verbose 开关）
  - 可观测性：增加可选开关（例如 `experimental.opencode_base_artifacts_bridge.verbose`），开启后在 `/start-work` 输出里附一句失败原因摘要（默认关闭，保持“不阻断只 log”）
  - entry path 最小安全校验：相对路径、禁止 `..`，并建议限制必须以 `.opencode/` 开头（不合法则跳过并 log）
- 测试：
  - atlas hook 单测（有索引 / 无索引 / 重复调用幂等）
  -（可选）specVersion 不支持时走降级分支（不阻断）

### V2：机器可读工作集（JSON 最新态 + 历史审计）+ 变化检测 + allowlist 配置化

- 在写入 Markdown 的同时，写入两份 JSON（更产品化、更好解释）：
  - `.sisyphus/notepads/<plan>/opencode-base-evidence.json`：保存“最新合并态”（覆盖写，机器读取最方便）
  - `.sisyphus/notepads/<plan>/opencode-base-evidence.history.jsonl`：保存“历史审计流”（append-only，每次生成追加一行快照事件）
- JSON 合约字段建议写死并测出来（避免未来每个人各搞一套）：
  - `schemaVersion`（你们自己的 schema version，区分于基座 `specVersion`）
  - `generatedAtUtc`
  - `source`（至少包含 `manifestPath` / `specVersion`，可选 `packId` / 基座 `generatedAtUtc`）
  - `planName`
  - `allowlist`（固化当次 allowlist）
  - `entries`（稳定排序+去重的 `{ kind, path, sha256 }[]`）
- 变化检测（强烈建议纳入 DoD）：picked entries 与上次完全一致时，Markdown 不要每次追加一大段（最多追加一句“无变化 + 时间”）
- allowlist 配置化：
  - allowlist 有默认值，但允许通过配置扩展/收敛（避免每次新增 kind 都要改代码发版）
- pointerize（后置增强，非 V2 必做）：
  - 如果未来确实需要 pointerize（必须注入 prompt 且内容很长），**桥接能力坚持不写 `.opencode/**`**：capsule 写到 `.sisyphus/**`（例如 `.sisyphus/notepads/<plan>/capsules/`）
  - 现实上对子会话通常优先“去 Read 索引文件”，pointerize 优先级可后置，但路线要写清楚避免遗忘
- 测试：
  - JSON 合约测试（字段/排序/去重）
  - history.jsonl 追加行为测试（不覆盖）
  - 变化检测测试（无变化不追加大段）

### 额外定案：信息源一致（避免误判/扯皮）

- 本方案（含 V1/V2）基于 `opencode-zh-build/opencode_src` 这一份基座实现与协议（包含 `evidence-manifest/1.0` 的格式定义与落盘 writer）。
