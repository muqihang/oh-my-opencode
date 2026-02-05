# Oh-My-OpenCode × OpenCode 基座产物桥接（Artifacts Bridge）设计稿

**日期**：2026-02-05  
**目标读者**：产品经理 / 维护者 / 未来要复制插件做“法律/金融/其它领域编排”的同学  

---

## 0) 用一句人话讲清楚（给产品经理）

> 我们要做的是：**把 OpenCode 基座已经自动生成的“资料包”（证据/检索结果/计划指针）整理成一份“索引清单”，放到 Oh-My 的 `.sisyphus` 执行流程里**。  
> 这样 Atlas 派出去的子会话就能直接复用这些资料，而不是每个子会话都重复检索一遍。

这件事的边界也很清楚：  
- **不改变** Oh-My 现有机制（Prometheus → `.sisyphus` → `/start-work` → Atlas 自动续跑、勾 TODO）。  
- **不替代** Prometheus/Atlas 的规划与派工。  
- 只是“把基座产物递过去”，让团队协作更省钱、更稳、更可审计。

---

## 1) 背景：两套系统的强项 + 现在缺的那一环

### 1.1 OpenCode 基座的强项
- 单会话里可以“快拆问题 + 补证据缺口”（single-session orchestrator）
- 并且会把结构化产物写到磁盘（可追溯）：
  - `.opencode/evidence/<sessionId>/manifest.json`：这次会话写出了哪些证据产物（带 kind/path/sha256）
  - `.opencode/artifacts/<sessionId>/**`：真实产物（如 retrieval hits/spec、grep hits、orchestrator plan/features）

### 1.2 Oh-My 插件的强项
- Prometheus：规划 → `.sisyphus/drafts/*.md` / `.sisyphus/plans/*.md`
- `/start-work`：选 plan + 写 `boulder.json`（支持断点续跑）
- Atlas：按 checkbox 派工 `delegate_task`，并自动续跑直到勾完

### 1.3 现状缺口（为什么要桥接）
基座已经有“资料”，但 Oh-My 的执行链路里没有一个“官方入口”把这些资料交给子会话执行工程师，导致：
- 子会话重复检索/重复扫描（浪费时间与成本）
- 子会话拿到的证据不一致（验收更难）
- 很难回答“你当时依据什么做决策？”（审计链断裂）

---

## 2) 目标与非目标（DoD）

### 2.1 目标（DoD）
- **默认不变**：桥接功能默认关闭，只有显式打开才生效（商用可控）。
- **不抢方向盘**：不自动派工，不改 plan 勾选机制，不影响 Prometheus 产出流程。
- **只读基座产物**：只读取 `.opencode/evidence/<sessionId>/manifest.json`，不修改 `.opencode` 里基座生成的任何文件。
- **把桥接结果放进 `.sisyphus`**：生成一个“基座证据索引”文件，位置固定，团队都找得到。
- **失败不阻断**：读取失败/解析失败必须降级（只 log，不阻断 `/start-work`）。

### 2.2 非目标（本阶段不做）
- 不把基座的自然语言输出“硬解析”成 `.sisyphus/plans`（不稳定、不可测）。
- 不在运行时修改 `process.env` 或自动写 OpenCode 配置文件（副作用大、商用风险高）。

---

## 3) 方案：Artifacts Bridge v0（最小风险，可共存）

### 3.1 触发时机（推荐）
在用户进入执行态的瞬间触发一次即可：`/start-work`。

原因：
- `/start-work` 已经确定“当前 plan 是哪一个”，并写入 `boulder.json`
- 这时生成证据索引最自然：和计划绑定、可断点续跑、不会干扰 plan checkbox 解析

### 3.2 输入（来自 OpenCode 基座）
唯一依赖：`.opencode/evidence/<sessionId>/manifest.json`

manifest entry（最小字段）：
- `kind`：产物类型（例如 `orchestrator-plan` / `retrieval-hits` / `grep-hits`）
- `path`：产物路径（通常是 `.opencode/...` 相对路径）
- `sha256`：hash（用于审计/校验）

### 3.3 输出（写入 Oh-My 的工作流）
生成一个 Markdown 文件（只读索引，不影响 plan）：

- `.sisyphus/notepads/<plan-name>/opencode-base-evidence.md`

文件内容包含：
- 基座 evidence manifest 的位置（便于追溯）
- allowlist 后的关键产物清单（kind + path + sha256）
- “先读什么/怎么复用”的提示（给子会话执行工程师）

> 为什么放 notepads：  
> notepads 本来就是 Oh-My 的“团队共享知识库”，而且不影响 checkbox 进度统计。

### 3.4 开关（默认关闭）
Oh-My 配置新增：

```jsonc
{
  "experimental": {
    "opencode_base_artifacts_bridge": { "enabled": true }
  }
}
```

默认 `false`（缺省不生效），确保不打扰老用户。

### 3.5 allowlist（v0 最小集合）
**v0 实现的 allowlist（已落地）**：我们先只桥接 2 类最关键、最稳定且不易膨胀的产物：
- `orchestrator-plan`（让子会话知道“基座怎么想的”）
- `retrieval-hits`（让子会话复用已命中的检索结果指针）

为什么 v0 只做这么少？
- 这是一个“低风险上生产”的桥：先保证稳定、可测、默认不影响老用户。
- 某些 kinds（尤其是 `retrieval-snippet`）可能出现大量 entries，直接索引会导致 notepad 过长，反而污染上下文/影响体验。

**后续可扩展的候选（V1/V2 再纳入）**：
- `orchestrator-features`
- `orchestrator-worker-role-pack`（偏审计）
- `retrieval-spec` / `retrieval-dedupe`
- `grep-hits`
- `event-log`（用于定位失败原因）

### 3.6 失败与降级（必须满足商用）
- manifest 不存在：不生成索引，不提示（静默）
- manifest 解析失败：不生成索引，只 log
- `.sisyphus/notepads/` 写入失败：不阻断 `/start-work`

---

## 4) 测试策略（必须可验证）

### 4.1 纯函数单测（推荐）
对“manifest 解析 / allowlist 过滤 / markdown 渲染”做纯函数测试：
- 输入一个最小 manifest fixture
- 断言输出 markdown 包含期望的 kind/path/sha256

### 4.2 start-work 集成测试（关键）
在 `start-work` hook 现有测试框架下新增用例：
- 预置：`.opencode/evidence/<sessionId>/manifest.json` + `.sisyphus/plans/*.md`
- 触发：模拟 `/start-work`（带 `<session-context>`）
- 断言：生成 `.sisyphus/notepads/<plan-name>/opencode-base-evidence.md`

---

## 5) 风险与开放问题（实施前定案）

1) **索引文件是“覆盖”还是“追加”？**  
**决策：追加（append）**。如果文件已存在，追加一个新段落（带 timestamp），避免覆盖导致信息丢失，也避免覆盖掉人工在 notepads 里补充的内容。

2) **是否要把索引路径回写到 Atlas 的提示里？**  
**决策：回写到 `/start-work` 的输出里**。  
理由：这是“用户显式开启的能力”，开启后应该立即告诉用户/Atlas 索引文件在哪；同时它只发生在 `/start-work`（低频），不会污染每次工具调用的上下文。

3) **是否要把索引也做成 pointer（.opencode/context-capsules）？**  
v0 不需要：索引本身很短；优先让子会话 `Read` notepad 索引文件，而不是把大段内容塞进 prompt。  
如果未来确实需要 pointerize（例如必须注入 prompt，但索引/工作集过长），**桥接能力必须坚持不写 `.opencode/**`**：指针/胶囊文件建议写到 `.sisyphus/**`（例如 `.sisyphus/notepads/<plan>/capsules/`），避免“插件往基座地盘落文件”造成边界混乱。

---

## 6) 后续增强路线图（V1 / V2，先记下来避免忘）

> 目标：在 **不破坏 Oh-My 原有工作流** 的前提下，让“基座产物”不仅能被看到，还能被 **子会话自动优先复用**，进一步省钱、省时间、让证据链更稳定。

### 6.1 先对齐一个“现实契约”（避免 V1/V2 做得很漂亮但悄悄失效）

- `.opencode/evidence/<sessionId>/manifest.json` 不是“纯口头约定”，它是 OpenCode 基座 evidence 系统的一部分（有 `specVersion`）。  
- 但从插件角度，我们仍然要当它是 **外部输入**：可能不存在、可能旧版本、可能字段增减。  
- 所以 V1/V2 的底线仍然是：**best-effort 解析 + 失败降级 + 不阻断 Oh-My 主流程**。

**定案（版本门控 + 可观测性）**：
- manifest 的版本门控：**只支持 `evidence-manifest/1.0`**（读取到其它 `specVersion` → 不阻断 `/start-work`，但必须留下清晰日志；可选输出一条简短提示，见下方 verbose 开关）。  
- 失败可观测性：默认失败只 log（不污染输出）；但允许加一个可选开关（例如 `experimental.opencode_base_artifacts_bridge.verbose`）：
  - 默认关闭：保持 V0 的“失败不阻断、只 log”
  - 开启后：在 `/start-work` 输出里追加一句“桥接失败原因摘要”，避免“开了开关但啥也没发生”的困惑（仍不阻断主流程）。

**定案（安全校验）**：
- manifest entry 的 `path` 做最小安全校验（插件侧也要防御）：必须是相对路径、禁止 `..`，并建议限制必须以 `.opencode/` 开头（否则跳过该 entry 并 log）。  
- 目标是防止“清单里出现跑到项目外面去的路径”，以及减少未来协议字段变化带来的安全/可用性风险。

**团队规则（避免信息源不一致导致误判）**：
- 本方案基于 `opencode-zh-build/opencode_src` 这一份基座实现与协议（包含 `evidence-manifest/1.0` 的格式定义与落盘 writer）。

### V1：子会话自动“先读索引再动手”（Working Set 注入）

**一句话**：当 `delegate_task` 派出子会话时，自动在 prompt 最前面加一段短指令：
1) 先读 `.sisyphus/notepads/<plan-name>/opencode-base-evidence.md`  
2) 优先复用里面的 pointers/产物路径  
3) 只有确实不够时才再跑新的检索/扫描

**实现形态（建议，仍然 gated，默认关闭）**：
- 不再“新增一个注入点就再加一个粗判断”。V1 先把 `delegate_task` 的 prompt 注入做得 **确定、可预测、可测试**。
- 做法（推荐落地形态）：
  - 在 `atlas` hook 里实现一个小的“prompt 组合器（composer）”：按固定顺序拼接多段 prepend（单任务约束 / notepad 指令 / base evidence 指令）。
  - 每一段都用自己的 marker 做幂等（idempotent），不要再用 `SYSTEM_DIRECTIVE_PREFIX` 这种全局粗判断来决定“注入过没注入过”。

这样做的原因（很现实）：
- 目前项目里已经有多个 hook 会 prepend `delegate_task` prompt（例如 Atlas 的单任务约束、Sisyphus Junior 的 notepad 指令）。
- 如果继续靠“全局前缀”做粗判断，会出现“谁先跑谁赢”的顺序依赖，后续加第三段（base evidence）会更难稳定。

**需要新增的开关（示例）**：
```jsonc
{
  "experimental": {
    "opencode_base_artifacts_bridge": {
      "enabled": true,
      "inject_to_delegate_task": true
    }
  }
}
```

**测试（必须有）**：
- atlas hook 的 `tool.execute.before`：
  - 当索引文件存在时，断言 `delegate_task` prompt 被 prepend；
  - 不存在时不改 prompt；
  - **重复调用不重复注入**（幂等测试）。

### V2：把索引升级为“机器可读工作集”（更稳定、更自动）

**一句话**：在 V1 的基础上，让索引不只是 Markdown，而是同时产出一个稳定的 JSON（机器可读）。  
pointerize 属于“最后不得已才用”的增强项：优先让子会话去 `Read` 索引文件，而不是把大段内容塞进 prompt。

**建议输出**：
- `.sisyphus/notepads/<plan-name>/opencode-base-evidence.json`
  - 作为“最新状态快照”（便于机器读取、覆盖写）
- `.sisyphus/notepads/<plan-name>/opencode-base-evidence.history.jsonl`
  - 作为“历史审计流”（append-only，每次生成追加一行快照事件）
- Markdown 继续保留（给人看）

**建议 JSON 合约字段（作为 V2 文档与测试的定案）**：
- `schemaVersion`：你们自己的 schema 版本（区分于基座 `specVersion`）
- `generatedAtUtc`：本次生成时间
- `source`：至少包含 `manifestPath`、`specVersion`，可选包含 `packId`、基座 `generatedAtUtc`
- `planName`
- `allowlist`：把当时使用的 allowlist 固化进去（否则无法解释“为什么没收录某 kind”）
- `entries`：稳定排序 + 去重后的 `{ kind, path, sha256 }[]`

**行为优化（建议纳入 V2 DoD）**：
- 变化检测：如果本次 picked entries 与上次完全一致，Markdown 不要每次追加一大段（最多追加一句“无变化 + 时间”）。

**可选增强**：
- 当确实需要把内容“注入到 prompt”但又太长时，再做 pointerize：
  - **建议写到 `.sisyphus/...` 下**（例如 `.sisyphus/notepads/<plan>/capsules/`），不要写到 `.opencode/`，避免边界混乱。

**测试（必须有）**：
- JSON shape 合约测试（包含 schemaVersion/generatedAtUtc/source/allowlist/entries，稳定排序+去重）
- history.jsonl 追加行为测试（不覆盖）
-（可选）当 entries 很多时，验证 pointerize 生效（只注入指针而非全文）
