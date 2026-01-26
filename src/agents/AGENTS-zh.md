# 代理知识库

## 概览

用于多模型编排的 10 个 AI 代理。Sisyphus（主）、oracle、librarian、explore、frontend、document-writer、multimodal-looker、Prometheus、Metis、Momus。

## 结构

```
agents/
├── orchestrator-sisyphus.ts    # 编排器 (1531 行) - 7 阶段委托
├── sisyphus.ts                 # 主提示词 (640 行)
├── sisyphus-junior.ts          # 受托任务执行者
├── sisyphus-prompt-builder.ts  # 动态提示词生成
├── oracle.ts                   # 战略顾问 (GPT-5.2)
├── librarian.ts                # 多仓库调研 (GLM-4.7-free)
├── explore.ts                  # 快速 grep (Grok Code)
├── frontend-ui-ux-engineer.ts  # UI 专家 (Gemini 3 Pro)
├── document-writer.ts          # 技术文档撰写者 (Gemini 3 Flash)
├── multimodal-looker.ts        # 媒体分析器 (Gemini 3 Flash)
├── prometheus-prompt.ts        # 规划 (1196 行) - 访谈模式
├── metis.ts                    # 计划顾问 - 规划前分析
├── momus.ts                    # 计划审查者 - 验证
├── types.ts                    # AgentModelConfig 接口
├── utils.ts                    # createBuiltinAgents(), getAgentName()
└── index.ts                    # builtinAgents 导出
```

## 代理模型

| 代理 | 模型 | 温度 | 用途 |
|-------|-------|-------------|---------|
| Sisyphus | anthropic/claude-opus-4-5 | 0.1 | 主编排器，待办事项驱动 |
| oracle | openai/gpt-5.2 | 0.1 | 只读咨询，调试 |
| librarian | opencode/glm-4.7-free | 0.1 | 文档，GitHub 搜索，开源示例 |
| explore | opencode/grok-code | 0.1 | 快速上下文 grep |
| frontend-ui-ux-engineer | google/gemini-3-pro-preview | 0.7 | UI 生成，视觉设计 |
| document-writer | google/gemini-3-flash | 0.3 | 技术文档 |
| multimodal-looker | google/gemini-3-flash | 0.1 | PDF/图像分析 |
| Prometheus | anthropic/claude-opus-4-5 | 0.1 | 战略规划，访谈模式 |
| Metis | anthropic/claude-sonnet-4-5 | 0.1 | 规划前差距分析 |
| Momus | anthropic/claude-sonnet-4-5 | 0.1 | 计划验证 |

## 如何添加

1. 创建导出 `AgentConfig` 的 `src/agents/my-agent.ts`
2. 添加到 `src/agents/index.ts` 中的 `builtinAgents`
3. 更新 `src/config/schema.ts` 中的 `AgentNameSchema`
4. 在 `src/index.ts` 初始化中注册

## 工具限制

| 代理 | 禁用的工具 |
|-------|-------------|
| oracle | write, edit, task, delegate_task |
| librarian | write, edit, task, delegate_task, call_omo_agent |
| explore | write, edit, task, delegate_task, call_omo_agent |
| multimodal-looker | 白名单: read, glob, grep |

## 关键模式

- **工厂**: `createXXXAgent(model?: string): AgentConfig`
- **元数据**: `XXX_PROMPT_METADATA: AgentPromptMetadata`
- **工具限制**: `permission: { edit: "deny", bash: "ask" }`
- **思考**: Sisyphus, Oracle, Prometheus 有 32k 预算 token

## 反模式

- **信任报告**: 绝不信任子代理的“我完成了” - 验证输出
- **高温**: 代码代理不要使用 >0.3
- **顺序调用**: 使用带有 `run_in_background` 的 `delegate_task`
