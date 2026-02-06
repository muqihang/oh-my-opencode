# Oh-My-OpenCode Atlas delegate_task 降噪提醒 + 台账（atlas_journal）设计稿

**日期**：2026-02-06  
**目标读者**：Oh-My-OpenCode 维护者 / 商用集成方 / 需要“稳定 + 可审计 + 少上下文膨胀”的编排用户

---

## 0) 用一句人话讲清楚

> 在不破坏 Prometheus → /start-work → Atlas → delegate_task 工作流前提下，新增默认关闭能力：将 delegate_task 完成后的长提醒与变更清单写入 `.sisyphus` 台账，主会话可只保留固定 7 句短提醒 + 路径指针，减少上下文膨胀并保留审计链。

---

## 1) 问题背景

当前 `src/hooks/atlas/index.ts` 在 delegate_task 收尾时会把以下内容直接拼到主会话输出：
- `fileChanges`（可能较长）
- `Subagent Response` 正文
- `<system-reminder>` 长模板（boulder/standalone）

长模板每次重复注入，容易导致主会话上下文膨胀。与此同时，这段内容又承载了关键质量约束（验证、失败回修、进度更新），不能直接删。

---

## 2) 目标与边界

### 2.1 目标
- 不破坏原工作流
- 默认行为不变（feature 默认关闭）
- 所有新行为 config gated
- 写失败不阻断，自动降级为旧输出
- 仅写 `.sisyphus/**`，不写 `.opencode/**`
- Subagent Response 正文继续保留在主会话输出
- 台账 append-only，保留可审计证据

### 2.2 非目标
- 不删除 `buildOrchestratorReminder` / `buildStandaloneVerificationReminder`
- 不改变 `/start-work`、boulder、delegate_task 的核心机制
- 不把子会话正文隐藏进文件

---

## 3) 配置设计

新增 `experimental.atlas_journal`：

```jsonc
{
  "experimental": {
    "atlas_journal": {
      "enabled": false,
      "short_reminder": true,
      "path_mode": "plan-notepad",
      "verbose": false
    }
  }
}
```

字段语义：
- `enabled`：主开关，默认 `false`
- `short_reminder`：开启后是否使用 7 句短版（默认 `true`）
- `path_mode`：`plan-notepad` 或 `global`
- `verbose`：输出短状态提示（落盘成功/失败）

---

## 4) 台账落盘规则

路径规则：
- 有 planName 且 `path_mode=plan-notepad`：`.sisyphus/notepads/<plan>/atlas-journal.md`
- 无 planName 或 `path_mode=global`：`.sisyphus/notepads/_global/atlas-journal.md`

内容规则（append-only）：
- 每次 delegate_task 成功收尾追加一个分段
- 记录 ISO 时间戳与会话信息
- 含 `fileChanges` 完整文本
- 含 `fullReminder`（长提醒模板完整文本）
- 带 `callID`/hash marker，防止同一次调用重复写入

失败规则：
- 任意写入失败都 catch 并记录 log
- 主会话输出退回 legacy 长版
- 不中断 delegate_task

---

## 5) 主会话短版（固定 7 句）

当 `enabled=true` 且 `short_reminder=true` 且台账写入成功时：
- 主会话保留 Subagent Response 正文
- 用固定 7 句短版替代长提醒 + fileChanges
- 第 7 句给出台账路径指针

boulder 与 standalone 都保持 7 句，但：
- 有 plan 时句 2 指向 `.sisyphus/tasks/<plan>.yaml`
- 无 plan 时句 2 指向 `todowrite`
- 有 plan 时句 6 显示 `x/y（剩余 z） + .sisyphus/boulder.json`
- 无 plan 时句 6 显示 standalone 进度说明

---

## 6) 验收标准

1. 默认不开开关：输出与旧行为一致（含 `SUBAGENT WORK COMPLETED`、`[FILE CHANGES SUMMARY]`、长 `<system-reminder>`）
2. 开启开关 + 有 plan：
   - 输出含 7 句短版
   - 仍保留 Subagent Response 正文
   - 输出含 journal 路径指针
   - 实际写入 `.sisyphus/notepads/<plan>/atlas-journal.md`
3. 开启开关 + 无 plan：
   - 使用 `_global` 路径
   - 输出仍为 7 句，且句 2 使用 todowrite 文案
4. 开启开关但写入失败：
   - 自动降级为 legacy 输出，不阻断
5. 同一 `callID` 重复进入 after-hook：
   - journal 只写一次（幂等）

