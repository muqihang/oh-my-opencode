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
v0 不需要：索引本身很短；后续如果索引变长，可复用 pointerize。

---

## 6) 后续增强路线图（V1 / V2，先记下来避免忘）

> 目标：在 **不破坏 Oh-My 原有工作流** 的前提下，让“基座产物”不仅能被看到，还能被 **子会话自动优先复用**，进一步省钱、省时间、让证据链更稳定。

### V1：子会话自动“先读索引再动手”（Working Set 注入）

**一句话**：当 `delegate_task` 派出子会话时，自动在 prompt 最前面加一段短指令：
1) 先读 `.sisyphus/notepads/<plan-name>/opencode-base-evidence.md`  
2) 优先复用里面的 pointers/产物路径  
3) 只有确实不够时才再跑新的检索/扫描

**实现形态（建议，仍然 gated，默认关闭）**：
- 在 `atlas` hook 的 `tool.execute.before` 里，检测 `tool === "delegate_task"`：
  - 如果 boulder 有 active plan 且存在索引文件，则把一段“先读索引”指令 prepend 到 `output.args.prompt`
- 这种方式的好处是：
  - **不改** Prometheus / `/start-work` / boulder 的机制
  - 只影响 `delegate_task` 的 prompt（且可用开关控制）
  - 子会话如果不需要，也可以忽略（软约束，风险低）

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
- atlas hook 的 `tool.execute.before`：当索引文件存在时，断言 `delegate_task` prompt 被 prepend；不存在时不改 prompt。

### V2：把索引升级为“机器可读工作集”（更稳定、更自动）

**一句话**：在 V1 的基础上，让索引不只是 Markdown，而是同时产出一个稳定的 JSON（机器可读），并且可选做 pointerize（避免超长上下文）。

**建议输出**：
- `.sisyphus/notepads/<plan-name>/opencode-base-evidence.json`
  - 只包含 allowlist 后的 `{ kind, path, sha256 }[]`（稳定字段，容易做合约测试）
- Markdown 继续保留（给人看）

**可选增强**：
- 当索引过长时，复用 Oh-My 现有 `pointerize()` 机制，把“注入到 prompt 的文本”变成 `<context_pointer>`（不占上下文）。

**测试（必须有）**：
- JSON shape 合约测试（最小字段 + 稳定排序）
- 当 entries 很多时，验证 pointerize 生效（只注入指针而非全文）
