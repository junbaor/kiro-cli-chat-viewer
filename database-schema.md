# Kiro 本地数据库结构文档

## 基本信息

| 项目 | 说明 |
|------|------|
| 数据库类型 | SQLite3 |
| 文件路径 | `~/.local/share/kiro-cli/data.sqlite3` |
| 访问模式 | 只读 (`?mode=ro`) |

---

## 表结构

### `conversations_v2`

Kiro 的核心对话存储表，保存所有聊天会话数据。

| 列名 | 类型 | 说明 |
|------|------|------|
| `key` | TEXT | 会话分组键，通常为工作区路径（如 `/Users/xxx/project`），用于按项目分组 |
| `conversation_id` | TEXT | 会话唯一标识符，用作主键查询 |
| `created_at` | INTEGER | 创建时间，Unix 毫秒时间戳 |
| `updated_at` | INTEGER | 更新时间，Unix 毫秒时间戳 |
| `value` | TEXT | 会话完整数据，JSON 格式字符串 |

---

## `value` 字段 JSON 结构

`value` 列存储了会话的全部内容，结构如下：

```json
{
  "env_context": {
    "env_state": {
      "current_working_directory": "/path/to/project"
    }
  },
  "history": [
    // 对话轮次数组
  ]
}
```

### `env_context` — 环境上下文

| 字段路径 | 类型 | 说明 |
|----------|------|------|
| `env_context.env_state.current_working_directory` | string | 会话发起时的工作目录 |

### `history[]` — 对话历史

每个元素代表一轮对话，包含 `user` 和/或 `assistant` 字段：

```json
{
  "user": {
    "content": "用户消息内容"
  },
  "assistant": {
    "ToolUse": {
      "content": "助手文本回复",
      "tool_uses": [
        {
          "id": "工具调用ID",
          "name": "工具名称",
          "orig_name": "原始工具名称",
          "args": { }
        }
      ]
    }
  }
}
```

#### `user.content` 的可能类型

`content` 字段支持多种格式：

| 格式 | 示例 | 说明 |
|------|------|------|
| 纯字符串 | `"hello"` | 简单文本消息 |
| 数组 | `[{"Text": "..."}, {"image_url": "..."}]` | 多模态内容（文本 + 图片） |
| Prompt 对象 | `{"Prompt": {"prompt": "..."}}` | 提示词格式 |
| ToolUseResults 对象 | `{"ToolUseResults": {"tool_use_results": [...]}}` | 工具执行结果 |

#### `assistant.ToolUse` 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | string | 助手的文本回复内容 |
| `tool_uses` | array | 工具调用列表 |
| `tool_uses[].id` | string | 工具调用唯一 ID |
| `tool_uses[].name` | string | 工具名称 |
| `tool_uses[].orig_name` | string | 原始工具名称（备选） |
| `tool_uses[].args` | object | 工具调用参数 |

---

## 查询示例

### 列出所有会话（按创建时间倒序）

```sql
SELECT key, conversation_id, created_at, updated_at, value
FROM conversations_v2
ORDER BY created_at DESC;
```

### 根据 conversation_id 查询单个会话

```sql
SELECT key, conversation_id, created_at, updated_at, value
FROM conversations_v2
WHERE conversation_id = ?;
```

### 全文搜索（在 value 中模糊匹配）

```sql
SELECT key, conversation_id, created_at, updated_at, value
FROM conversations_v2
WHERE LOWER(value) LIKE '%关键词%'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 数据关系图

```
conversations_v2
├── key (分组键 / 工作区路径)
├── conversation_id (唯一标识)
├── created_at (创建时间戳)
├── updated_at (更新时间戳)
└── value (JSON)
    ├── env_context
    │   └── env_state
    │       └── current_working_directory
    └── history[] (对话轮次)
        ├── user
        │   └── content (string | array | object)
        └── assistant
            └── ToolUse
                ├── content (文本回复)
                └── tool_uses[]
                    ├── id
                    ├── name
                    ├── orig_name
                    └── args
```
