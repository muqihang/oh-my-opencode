# Oh-My-OpenCode × OpenCode Base Orchestrator（Full Compat）设计稿

**日期**：2026-02-04  
**目标读者**：维护者 / 未来要复制插件做“法律/金融/其它领域编排”的工程与产品同学  

---

## 1. 背景与现状（我们已经有什么）

### 1.1 OpenCode 基座（Base）
OpenCode 基座新增了 **single-session orchestrator**（实验功能），可以在**同一个聊天窗口**里：
- 快速拆解意图、补齐证据缺口、生成可执行计划（内部 workers / tool broker）
- 当判断需要真正动手（写文件/跑测试/高风险操作）时进入 `orchestratorMode=fork`，通过 `tool:task` 派发子会话执行

基座新增了一个关键的“派工策略”开关：
- `OPENCODE_ORCHESTRATOR_FORK_STRATEGY=auto|suggest|off`
  - `auto`：基座可自动 `tool:task` 派工（最容易与插件冲突）
  - `suggest`：基座只给出“建议派工”，不自动创建子会话（更适合与插件共存）
  - `off`：基座不做 fork 派工（最保守，但会损失自动化）

同时，基座新增了一个更“产品化/商用”的配置入口（优先推荐）：
- `product.mode=base|programming|legal`
  - 当 `mode != base` 时，基座默认会把 fork 派工策略视为 `suggest`（除非你显式覆盖）
- `product.forkStrategy=auto|suggest|off`（显式覆盖）

> 这套 `product.*` 是为“多插件/多领域切换”准备的：比 env 更不容易漏配，也避免进程级全局副作用。

### 1.2 Oh-My-OpenCode 插件（Plugin）
Oh-My-OpenCode 已经是一个**多会话编排插件**，核心能力是：
- Prometheus 产出 plan（`.sisyphus/plans/*.md`）
- `/start-work` 写入 `boulder.json` 并启动执行
- Atlas/Sisyphus 通过 `delegate_task` 把任务派到子会话执行，并持续验收与推进

### 1.3 已落地的最小兼容（当前仓库已有）
为了避免“方向盘冲突”，我们已经落地了一层 **最小风险兼容提示**：
- 配置开关（默认关闭）：`experimental.opencode_orchestrator_compat.enabled`
- 当检测到 `OPENCODE_EXPERIMENTAL_ORCHESTRATOR=1` 且基座 forkStrategy 解析结果为 `auto` 时，启动时 warn 一次，建议设为 `suggest`
  - **优先使用基座 `product` 配置（若可读取）以避免误报**（例如 `product.mode=programming` 时基座已默认安全）
  - 读取失败时再退回 env 判定
- 不修改 env（避免 surprise）

相关文档与实现：
- `docs/orchestration-guide.md`（兼容章节）
- `src/shared/orchestrator-compat.ts`
- `src/index.ts`（启动时一次性提示）
- `src/config/schema.ts`（schema）
- `docs/plans/2026-02-04-omo-orchestrator-compat-design.md`（已完成的最小方案设计）

---

## 2. 问题陈述（为什么“最小提示”还不够）

你提出的产品目标是：
1) **OpenCode 是通用基座**（任何领域都能用）  
2) **Oh-My 是专业编排插件**（当前偏编程领域），未来会复制成“律师/法律”等其他领域插件  
3) 只要“oh-my + opencode 一起用”，就要**完全兼容**，且可长期演进  

仅有 warn 的问题：
- 兼容性依赖用户手工设置 env/配置；易遗漏（尤其是 env）
- 基座 orchestrator 的“计划/证据”产物（artifacts/events）目前没有被插件消费，协作空间没用起来
- 未来多插件（编程/法律）切换时，需要更清晰的“谁负责派工”的职责边界与稳定契约

---

## 3. 目标与非目标

### 3.1 目标（DoD）
- **不双重派工**：同一意图下，只能有一个“派工拥有者”（dispatch owner）
- **职责分层清晰**：基座做“单会话内快拆/证据补齐/给计划”；插件做“多会话派工+验收+持续推进”
- **默认行为不破坏老用户**：任何自动化更改都必须 gated（默认 off）
- **可复用/可复制**：复制成“律师插件”时，改 prompt/分类/技能即可，编排引擎尽量不改
- **可审计/可回滚**：所有自动决策有明确日志/事件/产物

### 3.2 非目标（避免 scope creep）
- 不把 oh-my 合并进 OpenCode core
- 不要求一次性实现“一个插件内多领域动态切换”（可以有，但不是本阶段硬目标）
- 不在默认模式下修改 `process.env`（只能作为显式 opt-in）

---

## 4. 方案选项（含优缺点）

### 方案 A（推荐）：Macro/Micro Orchestration（分层协作）
**核心思想**：
- 基座 orchestrator = “单会话 micro-orchestrator”（快拆、证据、输出短计划）
- Oh-My 插件 = “多会话 macro-orchestrator”（派工与验收）

**运行时职责**：
- 基座继续运行 orchestrator（尤其是内部 workers / tool broker 的低成本快拆能力）
- fork 派工策略设置为 `suggest`：基座只给“建议派工”，不自动创建子会话
- 插件（可选）消费基座产物（plan/features artifacts、事件）来辅助派工与验收

**优点**：
- 最符合你们已经确定的产品方向：“一个窗口快拆 → 子会话动手”
- 基座能力不会浪费；插件能力不会被抢方向盘
- 未来复制成律师插件依旧成立（macro 层不变，domain 替换即可）

**缺点/风险**：
- 需要定义“稳定契约”（事件名、artifact 形状、指针化规则）来让插件安全消费基座产物
- 需要明确什么时候自动化、什么时候只提示（避免过度自动派工）

### 方案 B：Base Off（插件全权）
把基座 orchestrator 的 fork 派工关掉（甚至整个 orchestrator 关闭），所有东西都由插件负责。

**优点**：实现简单，冲突最少。  
**缺点**：基座 orchestrator 的“内部小脑快拆/证据补齐”能力被浪费，且不利于基座能力沉淀为通用标准。

### 方案 C：Base Auto + 插件 Assist-only
基座负责派工，插件仅做提示/注入/工具增强。

**优点**：基座逻辑更统一。  
**缺点**：与“oh-my 是多会话专业编排插件”的定位冲突，也不利于复制出“法律插件”这种宏编排。

结论：选 **方案 A**。

---

## 5. 推荐方案 A 的详细设计（可分阶段落地）

### 5.1 “派工拥有者”握手（Fork Ownership Handshake）
**契约目标**：同一时刻只能有一个系统做“自动派工”。

**建议约定**：
1) 当用户启用 Oh-My 的多会话编排（或安装/选择该插件为主编排者）时：
   - **推荐 config-first**：在 OpenCode 配置中设定：
     - `product.mode=programming`（推荐）
     - 或 `product.forkStrategy=suggest`（显式）
   - env 仅作为兜底（启动前设置）：`OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest`
2) 当用户不使用 Oh-My（或只做轻量增强）时：
   - 可以保持基座 `auto`（由基座全自动派工）

**插件侧兼容机制（建议，默认 off）**：
- 配置：`experimental.opencode_orchestrator_compat.enabled`（已有，默认 `false`）
- 判定逻辑：
  - **优先读取 OpenCode base 配置**（`product.mode` / `product.forkStrategy`）以避免误报
  - 读取失败再退回 env 判定
- 约束：不在运行时修改 `process.env`（进程级副作用 + 基座可能在模块加载时缓存 env，导致不生效）

> 注：这一步的定位是“把兼容从文档建议升级成可选的自动检测 + 明确提示”，而不是“偷偷改系统行为”。

### 5.2 事件/产物级协作（不靠解析纯文本）
**为什么**：解析模型输出的自然语言文本不稳定、不可测试、易碎。

**优先使用的协作信号**（来自基座）：
- 基座已经会产出 pointer 化 artifacts（`.opencode/artifacts/<sessionId>/...`），并可能发出 `orchestrator.*` 事件（例如 planned / degraded）

**插件侧可做的协作能力（分级，默认 off）**：
1) **观察**：在 plugin `"event"` hook 中监听 `orchestrator.planned` / `orchestrator.degraded`（若基座对外透出）
2) **提示式桥接**：当检测到“基座建议 fork”或“基座 degraded(stage=fork_task)”时：
   - 插件输出一条非常短的系统提示：下一步应该由 Oh-My 来派工（例如引导 `/start-work` 或 `delegate_task`）
3) **自动桥接（可选）**：读取基座 plan artifact，并生成 `.sisyphus/plans/opencode-{timestamp}.md`：
   - 让用户直接走 Oh-My 的 boulder 执行链路
   - 这一步要非常谨慎：只在配置显式打开时执行，且生成的 plan 必须可读、可验证、可回滚

### 5.3 产物互通（pointer 规则统一）
Oh-My 已有 pointerize 机制（`.opencode/context-capsules/*`）。

建议“跨层互通”的统一原则：
- **大内容永远指针化**，主会话注入只允许小摘要 + 指针
- 指针必须带 `path + sha256`
- 插件消费基座 artifacts 时，只读 allowlist 目录（例如 `.opencode/artifacts/.../orchestrator/*`）

### 5.4 “领域插件模板化”（为律师插件做准备）
目标不是“一次性做多领域切换”，而是把“领域差异”聚焦到几类可替换资产：
- agent prompts（Prometheus/Atlas/Sisyphus/Junior + 专家）
- delegate_task categories（taxonomy + prompt append + 默认模型）
- 默认 skills 建议（律师：法规检索、引用格式、隐私红线；编程：git-master、playwright 等）
- 工具权限策略（律师：可能禁用 write/edit/exec，只做检索与引用）

建议新增一个明确的内部结构约定（不一定要立刻 refactor）：
- `src/domain/<domain>/prompts/*`
- `src/domain/<domain>/categories.ts`
- `src/domain/<domain>/skills.ts`
- 插件“核心引擎”只依赖一个 `DomainPack` 接口

复制插件时：替换 `<domain>` 目录即可。

---

## 6. 风险与开放问题（实施前必须定案）

1) **插件是否需要提供“一键修复/自动写入 OpenCode 配置”？**
   - 建议：不自动写入。先提供 `doctor`/提示（copy-paste 配置片段）满足商用“可控 + 可审计”。
   - 原因：自动改用户配置属于持久化副作用，容易引发误解；且不同团队对默认策略的偏好可能不同。

2) **“自动桥接”是否默认关闭？**
   - 建议：默认关闭。先做提示式桥接 + 手动命令触发生成 `.sisyphus` plan，稳定后再自动化。

3) **基座对外事件是否稳定可依赖？**
   - 建议：先以“存在则消费、缺失则跳过”的方式实现；并用合约测试锁定最小字段（path/sha256/mode）。

4) **兼容判断所依赖的数据结构是否稳定？**
   - 风险：OpenCode SDK 的 `Config` 类型可能滞后于基座实际返回字段（例如新加的 `product`）。
   - 建议：插件侧只解析 `product.mode` / `product.forkStrategy` 这两个最小字段，并且“解析失败就降级”为 env-only 行为。

---

## 7. 下一步建议（落地路线图）

### Milestone 1：兼容从“提示”升级到“可选自动化”
- 扩展配置：`experimental.opencode_orchestrator_compat.mode`
- 新增 `doctor`/检查命令（可选）：打印当前 env 组合与推荐

### Milestone 2：提示式桥接（基座 → 插件）
- 监听基座 orchestrator 事件（若可见）
- 输出最短的“下一步建议”，不自动派工

### Milestone 3：计划桥接（plan artifact → .sisyphus plan）
- 把基座 plan JSON 转成 Oh-My plan Markdown（checkbox 列表）
- 生成后引导 `/start-work`
- 全过程可回滚：生成新文件，不覆盖旧文件

### Milestone 4：领域包接口（为“律师插件”复制做准备）
- 提供 `DomainPack` 的最小接口
- 把编程领域的 categories/skills/prompt append 移到 domain 目录
