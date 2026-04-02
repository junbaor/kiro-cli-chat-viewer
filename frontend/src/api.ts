import type { Conversation, ConversationGroup } from "./types"

const API_BASE = "/api"

export async function fetchConversations(): Promise<ConversationGroup[]> {
  const res = await fetch(`${API_BASE}/conversations`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchConversation(id: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations/${id}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function exportConversation(id: string): Promise<string> {
  const res = await fetch(`${API_BASE}/export/${id}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.text()
}
