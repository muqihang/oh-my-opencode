import { join } from "node:path"
import { getOpenCodeStorageDir } from "../../shared/data-path"
import { getClaudeConfigDir } from "../../shared"

export const OPENCODE_STORAGE = getOpenCodeStorageDir()
export const MESSAGE_STORAGE = join(OPENCODE_STORAGE, "message")
export const PART_STORAGE = join(OPENCODE_STORAGE, "part")
export const SESSION_STORAGE = join(OPENCODE_STORAGE, "session")
export const TODO_DIR = join(getClaudeConfigDir(), "todos")
export const TRANSCRIPT_DIR = join(getClaudeConfigDir(), "transcripts")
export const SESSION_LIST_DESCRIPTION = `列出所有 OpenCode 会话（支持可选过滤）。

返回可用的会话 ID 列表，并包含消息数量、时间范围、使用过的代理等元数据。

参数：
- limit（可选）：最多返回的会话数量
- from_date（可选）：从该日期开始过滤会话（ISO 8601 格式）
- to_date（可选）：过滤到该日期为止（ISO 8601 格式）

输出示例：
| 会话 ID | 消息数 | 最早 | 最新 | 代理 |
|---------|--------|------|------|------|
| ses_abc123 | 45 | 2025-12-20 | 2025-12-24 | build, oracle |
| ses_def456 | 12 | 2025-12-19 | 2025-12-19 | build |`

export const SESSION_READ_DESCRIPTION = `读取 OpenCode 会话的消息与历史记录。

返回格式化后的会话消息视图，包含角色、时间戳与内容。可选包含 TODO 与 transcript 数据。

参数：
- session_id（必填）：要读取的会话 ID
- include_todos（可选）：若存在则包含 TODO 列表（默认：false）
- include_transcript（可选）：若存在则包含 transcript 日志（默认：false）
- limit（可选）：最多返回的消息数量（默认：全部）

输出示例：
会话：ses_abc123
消息数：45
时间范围：2025-12-20 到 2025-12-24

[消息 1] user (2025-12-20 10:30:00)
Hello, can you help me with...

[消息 2] assistant (2025-12-20 10:30:15)
Of course! Let me help you with...`

export const SESSION_SEARCH_DESCRIPTION = `在 OpenCode 会话消息中搜索内容。

对会话消息执行全文检索，并返回包含上下文的匹配片段。

参数：
- query（必填）：搜索关键词
- session_id（可选）：仅在指定会话内搜索（默认：所有会话）
- case_sensitive（可选）：是否区分大小写（默认：false）
- limit（可选）：最多返回的结果条数（默认：20）

输出示例：
在 2 个会话中找到 3 条匹配：

[ses_abc123] Message msg_001 (user)
...implement the **session manager** tool...

[ses_abc123] Message msg_005 (assistant)
...I'll create a **session manager** with full search...

[ses_def456] Message msg_012 (user)
...use the **session manager** to find...`

export const SESSION_INFO_DESCRIPTION = `获取 OpenCode 会话的元数据与统计信息。

返回会话的详细信息，包括消息数量、时间范围、使用过的代理，以及可用的数据来源。

参数：
- session_id（必填）：要查看的会话 ID

输出示例：
会话 ID：ses_abc123
消息数：45
时间范围：2025-12-20 10:30:00 到 2025-12-24 15:45:30
耗时：4 天 5 小时
使用的代理：build, oracle, librarian
包含 TODO：是（12 项，其中 8 项已完成）
包含转录：是（234 条）`

export const SESSION_DELETE_DESCRIPTION = `删除 OpenCode 会话及其关联的所有数据。

将移除会话消息、消息片段、TODO 与 transcript。该操作不可撤销。

参数：
- session_id（必填）：要删除的会话 ID
- confirm（必填）：必须为 true 才会执行删除

示例：
session_delete(session_id="ses_abc123", confirm=true)
已成功删除会话 ses_abc123`

export const TOOL_NAME_PREFIX = "session_"
