# Oh-My-OpenCode Repo Map（给 AI / 工程师）

> **目的**：这份文档是一个“代码地图 + 运行时心智模型”。当你要改 oh-my-opencode（新增 hook / tool / agent / 配置、排查奇怪行为、做 OpenCode 基座兼容）时，优先看这里，而不是从全仓库盲读开始。
>
> **更新时间**：2026-02-04  
> **读者**：AI coding agent、维护者、需要快速定位入口的人  
> **仓库定位**：OpenCode 的一个插件（Plugin），提供多智能体编排、Claude Code 兼容、后台任务、tmux 可视化等。

---

## 0. 你要找什么？（Quick Index）

### 插件入口与事件顺序（最重要）
- 插件入口：`src/index.ts`
  - 注册 tools：`return { tool: { ... } }`
  - 注册 hooks：`"chat.message" / "event" / "tool.execute.before" / "tool.execute.after" / "experimental.chat.messages.transform" / "config"`
  - **Hook 执行顺序**也在这里串起来（这是“为什么注入/拦截发生在这里”的根因）。

### 编排主链路（Planning → Execution → Delegation）
- `/start-work` 触发 + boulder 状态：`src/hooks/start-work/index.ts` + `src/features/boulder-state/storage.ts`
- Atlas 编排钩子（持续推进、反直改、delegate_task 输出包装）：`src/hooks/atlas/index.ts`
- 子任务派发（sync/background、会话创建、轮询稳定性检测、session_id 延续）：`src/tools/delegate-task/tools.ts`
- 后台任务生命周期/并发控制/通知：`src/features/background-agent/manager.ts`
- 背景任务输出/取消工具：`src/tools/background-task/*`

### 状态与注入（让“不中断继续做”成为可能）
- boulder 状态文件：`.sisyphus/boulder.json`（由 boulder-state 写入）
- 计划与笔记：`.sisyphus/plans/*.md`、`.sisyphus/notepads/{plan}/*.md`（由 prompts / 约束与流程驱动）
- Hook 合成消息存储（用于识别 agent/model、注入续跑 prompt 等）：`src/features/hook-message-injector/injector.ts` + `src/shared/session-utils.ts`
- 上下文注入（把“待注入上下文”插进最后一条 user message；超长时落盘为 pointer）：`src/features/context-injector/*`
  - pointer 落盘目录：`.opencode/context-capsules/*`（见 `src/features/context-injector/pointerize.ts`）

### 配置（路径、schema、合并规则）
- Zod schema：`src/config/schema.ts`
- 配置加载与合并：`src/plugin-config.ts`
  - 用户配置：`~/.config/opencode/oh-my-opencode.json(c)`
  - 项目配置：`<project>/.opencode/oh-my-opencode.json(c)`
  - 合并：用户为 base，项目覆盖；`agents/categories/claude_code` 做 deepMerge，`disabled_*` 做去重 union

### 与 OpenCode 基座（single-session orchestrator）的兼容面
- compat 检测（纯函数）：`src/shared/orchestrator-compat.ts`
- compat 开关：`experimental.opencode_orchestrator_compat.enabled`（见 `src/config/schema.ts`）
- 启动时一次性提示：`src/index.ts`（只在 compat enabled 时生效）
- 用户文档：`docs/orchestration-guide.md`（含 fork strategy 说明）

---

## 1. 插件是怎么“接管生命周期”的？

Oh-My-OpenCode 是一个 OpenCode 插件：它不是改 OpenCode core 代码，而是通过插件 API 提供：

1) 一组 **tools**（例如 `delegate_task`、`grep`、`lsp_diagnostics` 等）  
2) 一组 **hook handlers**（在特定时机拦截/增强）：
- `"chat.message"`：消息输出阶段（可改 output.parts，做注入/路由/变体选择等）
- `"experimental.chat.messages.transform"`：对消息列表做变换（常用于“把上下文注入到最后一条 user message 的 synthetic part”）
- `"event"`：监听 session lifecycle（created/deleted/idle/error/...）
- `"tool.execute.before"`：工具执行前校验/改 args/提示（**注意：重逻辑不要放这里，避免全局慢**）
- `"tool.execute.after"`：工具执行后截断/恢复/审计/包装输出等
- `"config"`：配置相关 handler（UI/命令层使用）

这些串联的“真相”在 `src/index.ts`：排查任何“为什么某个提示/注入/限制出现”时，从这里向下追。

---

## 2. “Prometheus → Atlas → Junior”在代码里对应什么？

这套编排系统的核心不是“一个大 prompt”，而是 **prompt + 工具 + hooks + 状态文件** 的组合。

### 2.1 Planning（Prometheus）
- Prometheus 的系统提示词：`src/agents/prometheus-prompt.ts`（非常长，包含访谈、写 plan、Momus loop 等规则）
- 产物：
  - plan：`.sisyphus/plans/{name}.md`
  - draft：`.sisyphus/drafts/{name}.md`（访谈过程记录）

### 2.2 Execution（Atlas）
Atlas 的执行不是“直接写代码”，而是：
- 读取 plan（Markdown checkbox）
- 用 `delegate_task()` 把每个 checkbox 拆成一个原子任务派给子 agent
- 对子 agent 的产出做验证、继续推进

关键实现：
- Atlas agent prompt：`src/agents/atlas.ts`
- Atlas hook（运行时约束与自动续跑）：`src/hooks/atlas/index.ts`

Atlas hook 做了三件事（非常关键）：
1) **反直改**：如果 Atlas 直接 `Write/Edit` 非 `.sisyphus/*` 文件，会被强提醒（PreToolUse 先警告，PostToolUse 再提醒）。
2) **delegate_task 单任务强制**：调用 `delegate_task` 时把 “single-task-only” 指令注入到 prompt，防止一次派发多个任务导致质量滑坡。
3) **boulder 续跑**：监听 `session.idle`，若当前 session 属于 boulder 且 plan 未完成，则自动 prompt “继续做剩余任务”。

### 2.3 Worker（Sisyphus-Junior / 专家 agents）
子 agent 的执行入口在 OpenCode 的 session 体系里（每个 task 是一个子会话），由 `delegate_task` 创建并 prompt。
- `delegate_task`：`src/tools/delegate-task/tools.ts`
- 后台任务（parallel 探索）：`src/features/background-agent/manager.ts`

---

## 3. boulder 状态：为什么能“断了也能续”？

### 3.1 boulder.json（计划级状态）
文件：`.sisyphus/boulder.json`  
读写：`src/features/boulder-state/storage.ts`

内容（简化）：
- `active_plan`: 绝对路径（指向 `.sisyphus/plans/*.md`）
- `session_ids`: 所有参与过这个 plan 的 session 列表（用于把续跑注入到正确 session）
- `started_at` / `plan_name`

### 3.2 /start-work 如何选 plan？
- 触发点：`src/hooks/start-work/index.ts`（在 `"chat.message"` 里检测是否是“真正执行的命令输出”）
- 策略：
  - 如果用户显式写了 plan 名：优先匹配对应 plan（支持 partial match）
  - 如果已有 boulder 且未完成：append 当前 session id，继续
  - 如果没有 boulder：扫描 `.sisyphus/plans/`，根据“未完成数量”自动选或提示选择

这就是 “/start-work 不是一个静态 prompt，而是一个 hook 驱动的状态机”。

---

## 4. delegate_task：它到底做了什么？（以及为什么要 session_id）

### 4.1 delegate_task 的职责边界
实现：`src/tools/delegate-task/tools.ts`

delegate_task 是 oh-my 的“派工 API”，它本质上做：
- 选择 agent（直接 subagent_type，或 category→Sisyphus-Junior）
- 可选加载 skills（`load_skills` 作为 prompt prepend）
- 创建子 session（`client.session.create`）
- `client.session.prompt` 发送 prompt
- 轮询 session 状态与 messages 稳定性，最终提取最后一条 assistant 输出
- 返回一个包含 `Session ID: ...` 的文本（供继续）

### 4.2 session_id 的意义（非常关键）
在输出末尾会提示：`To continue this session: session_id="..."`。

继续同一子会话（session_id）能带来：
- 任务修复更快：子 agent 保留全部上下文，不需要重讲
- 质量更稳定：延续前文约束、进度、已发现问题
- 省 tokens：避免重复注入与重复检索

### 4.3 run_in_background 的真实含义
- `run_in_background=true`：立即返回 `task_id`，后续用 `background_output` 拉结果
- `run_in_background=false`：同步等待结果（带稳定性检测）

注意：某些被标记为不稳定的 model/类别，会在实现里把 sync 强制转 background 并监督（见 delegate_task 内相关分支），这是为了“可靠性优先”。

---

## 5. context-injector：为什么有时会出现 pointer？

实现：`src/features/context-injector/injector.ts` + `pointerize.ts`

当一些 hook/feature 想把“上下文材料”塞进模型输入，但又怕太长，会：
- 优先尝试 inline 注入（预算默认 4000 chars）
- 超出预算则落盘到：`.opencode/context-capsules/{sha256}.md`
- 注入 `<context_pointer> path: ... sha256: ... </context_pointer>` 形式

这套 pointer 机制与 OpenCode 基座的 `.opencode/artifacts/...` 并不冲突（目录不同），但在未来“与基座 orchestrator 的 artifact 互通”时可以复用同类思路：**小文本注入 + 大内容指针化**。

---

## 6. 与 OpenCode 基座 orchestrator 的兼容：冲突点在哪里？

### 6.1 冲突根因：谁来派工？
- OpenCode 基座（single-session orchestrator）在某些 intent 下会进入 `orchestratorMode=fork`，并可能 **自动** `tool:task` 派发子会话。
- Oh-My-OpenCode 也提供派工（`delegate_task`、boulder 续跑、tmux panes 等）。

如果两边都“自动派工”，会出现：
- 双重派工（重复子会话 / 重复任务）
- “方向盘冲突”（两个 orchestrator 都以为自己是唯一编排者）

### 6.2 现有最小兼容层（已实现）
- 兼容提示（纯函数）：`src/shared/orchestrator-compat.ts`
- 启动一次性 warn（可选开启）：`experimental.opencode_orchestrator_compat.enabled`
- 推荐：当你希望 **oh-my 负责派工** 时，设置：
  - `OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest`

用户文档：`docs/orchestration-guide.md`（已包含）

工程注意：
- OpenCode 基座侧的 `Flag.OPENCODE_ORCHESTRATOR_FORK_STRATEGY` 可能在模块加载时读取 env 并缓存为常量；因此“运行时修改 env”不一定可靠。
- 最稳妥做法：在启动 OpenCode 之前就把 `OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest` 设置好。
- 若要在插件侧实现“可选自动化 enforce”，需要基座把该 flag 改为动态 getter（或提供其它稳定配置入口）。
- 另外：`process.env` 是进程级全局——如果未来做 `enforce_suggest`，它会影响同一进程内的其它项目/session，需要在行为与文档里明确。

> 进一步的“完全兼容 + 自动协作”方案（例如：基座输出 plan/artifacts，oh-my 消费并转成 boulder plan）属于下一阶段设计（见本仓库后续 design doc）。

---

## 7. 扩展点清单（改哪里最划算？）

### 7.1 新增/修改 Agent
- agent 定义：`src/agents/*.ts`
- 注册与 model 解析：`src/agents/utils.ts`
- schema 允许的 agent name：`src/config/schema.ts`

### 7.2 新增/修改 Tool
- 目录结构约定：`src/tools/<tool-name>/{index.ts,tools.ts,types.ts,constants.ts}`
- 注册入口：`src/tools/index.ts` + `src/index.ts` 的 `tool: { ... }`

### 7.3 新增/修改 Hook
- 聚合入口：`src/hooks/index.ts`
- 注册顺序与启用/禁用逻辑：`src/index.ts`
- hook 名字 schema：`src/config/schema.ts`（`HookNameSchema`）

### 7.4 新增/修改 Skill / Command
- 内置 skills：`src/features/builtin-skills/skills.ts`
- 内置 commands：`src/features/builtin-commands/*`
- 技能发现/加载：`src/features/opencode-skill-loader/*`

---

## 8. 测试与验证（避免“看起来能用但实际炸了”）

- 运行测试：`bun test`
- 类型检查：`bun run typecheck`
- 约定：
  - TDD（red→green→refactor）是强约束（见根 `AGENTS.md`）
  - 测试注释风格：`//#given` / `//#when` / `//#then`
  - 不要相信 agent self-report：任何“完成/通过”都要自己跑命令验证

---

## 9. 常见排查入口（Debug Playbook）

1) “为什么某个提示/限制出现？”  
   - 先看 `src/index.ts` 里对应事件的 hook 链路顺序
   - 再看具体 hook（例如 `src/hooks/atlas/index.ts`）

2) “为什么续跑/不停继续？”  
   - 看 `src/hooks/atlas/index.ts` 对 `session.idle` 的注入条件
   - 看 `.sisyphus/boulder.json` 是否指向一个未完成 plan

3) “为什么派工卡住/同步等待太久？”  
   - 看 `src/tools/delegate-task/tools.ts` 的轮询与稳定性检测参数
   - 看 provider/model 是否可用（delegate_task 会尝试解析 model 与 fallback）

4) “为什么上下文变成 pointer？”  
   - 看 `src/features/context-injector/pointerize.ts`
   - 检查 `.opencode/context-capsules/*` 是否被写入
