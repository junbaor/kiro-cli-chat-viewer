export interface Conversation {
  id: string
  key: string
  conversation_id: string
  created_at: number
  updated_at: number
  history: Message[]
  cwd: string
  message_count?: number
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool"
  content: string
  additional_context?: Record<string, unknown>
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export interface ConversationGroup {
  key: string
  path: string
  conversations: Conversation[]
}
