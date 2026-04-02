import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { fetchConversations, fetchConversation, searchConversations, exportConversation } from "./api"
import type { ConversationGroup, Conversation, Message } from "./types"
import { cn, formatRelativeTime, formatTimestamp } from "./lib/utils"
import {
  Search, ChevronRight, ChevronDown, User, Bot, Wrench, Clock,
  Folder, MessageSquare, Download, X, Terminal, Loader2, Menu, ArrowLeft,
  ChevronsUpDown, ArrowUp, Sun, Moon, Monitor
} from "lucide-react"
import { useTheme } from "./hooks/useTheme"
import { ScrollArea } from "./components/ui/scroll-area"
import { Button } from "./components/ui/button"
import { Input } from "./components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs"
import { JsonViewerModal, JsonFormatButton } from "./components/JsonViewer"

const MAX_COLLAPSED_LINES = 8
const MAX_COLLAPSED_CHARS = 500

function CollapsibleText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const needsCollapse = useMemo(() => {
    return text.length > MAX_COLLAPSED_CHARS || text.split("\n").length > MAX_COLLAPSED_LINES
  }, [text])

  const displayText = useMemo(() => {
    if (!needsCollapse || expanded) return text
    const lines = text.split("\n")
    if (lines.length > MAX_COLLAPSED_LINES) {
      return lines.slice(0, MAX_COLLAPSED_LINES).join("\n")
    }
    return text.slice(0, MAX_COLLAPSED_CHARS)
  }, [text, needsCollapse, expanded])

  return (
    <div className="relative">
      <pre className={cn("whitespace-pre-wrap break-words overflow-x-auto max-w-full", className)}>
        {displayText}
        {needsCollapse && !expanded && "…"}
      </pre>
      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <ChevronsUpDown className="w-3 h-3" />
          {expanded ? "收起" : `展开全部 (${text.split("\n").length} 行)`}
        </button>
      )}
    </div>
  )
}

function App() {
  const [groups, setGroups] = useState<ConversationGroup[]>([])
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Conversation[]>([])
  const [searching, setSearching] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState("conversations")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const desktopViewportRef = useRef<HTMLDivElement>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [jsonModal, setJsonModal] = useState<{ data: unknown; title: string } | null>(null)
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    const order: Array<"system" | "light" | "dark"> = ["system", "light", "dark"]
    setTheme(order[(order.indexOf(theme) + 1) % 3])
  }

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    loadConversations()
  }, [])

  // Show/hide scroll-to-top button based on scroll position
  useEffect(() => {
    const scrollEl = isMobile ? mobileScrollRef.current : desktopViewportRef.current
    if (!scrollEl) { setShowScrollTop(false); return }
    const onScroll = () => setShowScrollTop(scrollEl.scrollTop > 300)
    scrollEl.addEventListener("scroll", onScroll, { passive: true })
    return () => scrollEl.removeEventListener("scroll", onScroll)
  }, [isMobile, selectedConv])

  const scrollToTop = () => {
    const scrollEl = isMobile ? mobileScrollRef.current : desktopViewportRef.current
    scrollEl?.scrollTo({ top: 0, behavior: "smooth" })
  }

  const loadConversations = async () => {
    setLoading(true)
    try {
      const data = await fetchConversations()
      setGroups(data)
      if (data.length > 0) {
        setExpandedGroups(new Set([data[0].key]))
      }
      // Restore selected conversation from URL
      const convId = new URLSearchParams(window.location.search).get("conv")
      if (convId) {
        const match = data.flatMap(g => g.conversations).find(c => c.conversation_id === convId)
        if (match) {
          const full = await fetchConversation(convId)
          setSelectedConv(full)
          // Expand the group containing this conversation
          const group = data.find(g => g.conversations.some(c => c.conversation_id === convId))
          if (group) setExpandedGroups(prev => new Set(prev).add(group.key))
        }
      }
    } catch (e) {
      console.error("Failed to load conversations:", e)
    } finally {
      setLoading(false)
    }
  }

  const selectConversation = useCallback(async (conv: Conversation) => {
    try {
      const full = await fetchConversation(conv.conversation_id)
      setSelectedConv(full)
      setSidebarOpen(false)
      const url = new URL(window.location.href)
      url.searchParams.set("conv", conv.conversation_id)
      window.history.replaceState(null, "", url.toString())
    } catch (e) {
      console.error("Failed to load conversation:", e)
    }
  }, [])

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q)
    if (!q.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const results = await searchConversations(q)
      setSearchResults(results)
    } catch (e) {
      console.error("Search failed:", e)
    } finally {
      setSearching(false)
    }
  }, [])

  const handleExport = async (id: string) => {
    try {
      const markdown = await exportConversation(id)
      const blob = new Blob([markdown], { type: "text/markdown" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `conversation-${id.slice(0, 8)}.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error("Export failed:", e)
    }
  }

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const getDirName = (path: string) => {
    const parts = path.split("/")
    return parts[parts.length - 1] || path
  }

  const renderMessage = (msg: Message, idx: number) => {
    const isUser = msg.role === "user"
    const isTool = msg.role === "tool"
    const isAssistant = msg.role === "assistant"

    let content = msg.content || ""
    let parsedCalls = msg.tool_calls

    let thinkingBlock: string | null = null
    if (isAssistant && content.includes("<thinking>")) {
      const match = content.match(/<thinking>([\s\S]*?)<\/thinking>/)
      if (match) thinkingBlock = match[1].trim()
      content = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim()
    }

    const msgId = `msg-${idx}`

    return (
      <div key={msgId} className="flex flex-col gap-2">
        {thinkingBlock && (
          <div className="bg-muted rounded-lg p-3 text-sm border-l-2 border-primary">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Bot className="w-3 h-3" /> AI 思考中...
            </div>
            <pre className="whitespace-pre-wrap break-words overflow-x-auto text-xs text-muted-foreground max-w-full">{thinkingBlock}</pre>
          </div>
        )}

        {(!isAssistant || content) && (
          <div className={cn("flex gap-3 min-w-0", isUser && "flex-row-reverse")}>
            <div className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
              isUser && "bg-primary text-primary-foreground",
              isAssistant && "bg-secondary text-secondary-foreground",
              isTool && "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300"
            )}>
              {isUser ? <User className="w-4 h-4" /> : isTool ? <Wrench className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={cn("flex flex-col gap-1 min-w-0 overflow-hidden", isUser ? "items-end max-w-[85%]" : "max-w-[85%] sm:max-w-[90%]")}>
              <div className={cn(
                "rounded-2xl px-4 py-2.5 text-sm min-w-0",
                isUser && "bg-primary text-primary-foreground rounded-tr-sm",
                isAssistant && "bg-muted rounded-tl-sm",
                isTool && "bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-tl-sm"
              )}>
                {isTool && (
                  <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400 mb-1.5">
                    <Terminal className="w-3 h-3" />
                    <span className="font-medium">{msg.name || "tool"}</span>
                    {(() => {
                      try {
                        const parsed = JSON.parse(content)
                        if (typeof parsed === "object" && parsed !== null) {
                          return <JsonFormatButton onClick={() => setJsonModal({ data: parsed, title: msg.name || "tool result" })} />
                        }
                      } catch { /* not JSON */ }
                      return null
                    })()}
                  </div>
                )}
                {content && (
                  <CollapsibleText text={content} className="overflow-y-hidden font-sans" />
                )}
              </div>
            </div>
          </div>
        )}

        {parsedCalls && parsedCalls.length > 0 && (
          <div className="ml-2 sm:ml-11 flex flex-col gap-2 min-w-0 overflow-hidden">
            {parsedCalls.map((call) => {
              let args: string
              let parsedArgs: unknown = null
              try {
                parsedArgs = JSON.parse(call.function.arguments)
                args = JSON.stringify(parsedArgs, null, 2)
              } catch {
                args = call.function.arguments
              }
              return (
                <div key={call.id} className="bg-muted/50 rounded-lg border p-3 text-xs min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Wrench className="w-3 h-3 flex-shrink-0" />
                    <span className="font-medium text-foreground truncate">{call.function.name}</span>
                    {parsedArgs !== null && (
                      <JsonFormatButton onClick={() => setJsonModal({ data: parsedArgs, title: call.function.name })} />
                    )}
                  </div>
                  <CollapsibleText text={args} className="text-muted-foreground" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Sidebar content (shared between drawer and fixed sidebar)
  const sidebarContent = (
    <>
      <div className="p-3 border-b space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary flex-shrink-0" />
          <h1 className="font-semibold text-sm truncate">Kiro Chat</h1>
          <button
            onClick={cycleTheme}
            className="ml-auto p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
            title={theme === "system" ? "跟随系统" : theme === "light" ? "浅色模式" : "深色模式"}
          >
            {theme === "system" ? <Monitor className="w-4 h-4" /> : theme === "light" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start rounded-none border-b px-2 h-10 bg-transparent">
          <TabsTrigger value="conversations" className="text-xs">会话</TabsTrigger>
          <TabsTrigger value="directories" className="text-xs">目录</TabsTrigger>
        </TabsList>

        <TabsContent value="conversations" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-2">
              {searchQuery ? (
                <div className="space-y-1">
                  {searching ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      <span className="text-sm">搜索中...</span>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">未找到相关对话</div>
                  ) : (
                    searchResults.map((conv) => (
                      <button
                        key={conv.conversation_id}
                        onClick={() => selectConversation(conv)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2",
                          selectedConv?.conversation_id === conv.conversation_id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        )}
                      >
                        <MessageSquare className="w-4 h-4 flex-shrink-0" />
                        <div className="flex-1 overflow-hidden">
                          <div className="font-medium truncate">{conv.cwd || "无标题"}</div>
                          <div className="text-xs text-muted-foreground truncate">{formatRelativeTime(conv.created_at)}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {groups.map((group) => {
                    const isExpanded = expandedGroups.has(group.key)
                    return (
                      <div key={group.key}>
                        <button
                          onClick={() => toggleGroup(group.key)}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted text-sm font-medium"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                          <Folder className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="truncate">{getDirName(group.key)}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{group.conversations.length}</span>
                        </button>
                        {isExpanded && (
                          <div className="ml-4 mt-1 space-y-0.5">
                            {group.conversations.map((conv) => (
                              <button
                                key={conv.conversation_id}
                                onClick={() => selectConversation(conv)}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                                  selectedConv?.conversation_id === conv.conversation_id
                                    ? "bg-primary/10 text-primary"
                                    : "hover:bg-muted"
                                )}
                              >
                                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                                <div className="flex-1 overflow-hidden">
                                  <div className="truncate text-xs">{formatRelativeTime(conv.created_at)}</div>
                                </div>
                                <span className="text-[10px] text-muted-foreground">{conv.message_count || 0}条</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {groups.length === 0 && !loading && (
                    <div className="text-center py-8 text-muted-foreground text-sm">暂无会话记录</div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="directories" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {groups.map((group) => (
                <button
                  key={group.key}
                  onClick={() => {
                    setExpandedGroups(prev => { const n = new Set(prev); n.add(group.key); return n })
                    setActiveTab("conversations")
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <Folder className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 overflow-hidden">
                    <div className="truncate font-medium">{getDirName(group.key)}</div>
                    <div className="text-xs text-muted-foreground truncate">{group.key}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{group.conversations.length} 会话</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      {/* JSON Viewer Modal */}
      {jsonModal && (
        <JsonViewerModal
          data={jsonModal.data}
          title={jsonModal.title}
          onClose={() => setJsonModal(null)}
        />
      )}
      {/* Mobile sidebar overlay */}
      <div className={cn(
        "fixed inset-0 z-50 flex md:hidden",
        sidebarOpen ? "visible" : "invisible"
      )}>
        {/* Backdrop */}
        <div
          className={cn("absolute inset-0 bg-black/50 transition-opacity", sidebarOpen ? "opacity-100" : "opacity-0")}
          onClick={() => setSidebarOpen(false)}
        />
        {/* Drawer */}
        <div className={cn(
          "relative w-72 max-w-[85vw] h-full bg-card flex flex-col shadow-xl transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute top-3 right-3 p-1 rounded hover:bg-muted"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
          {sidebarContent}
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="w-72 xl:w-80 border-r bg-card flex-col hidden md:flex">
        {sidebarContent}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col bg-background min-w-0">
        {selectedConv ? (
          <>
            {/* Chat header */}
            <div className="h-14 border-b px-3 sm:px-4 flex items-center justify-between bg-card gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {/* Mobile back button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 md:hidden"
                  onClick={() => setSelectedConv(null)}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                {/* Mobile menu button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 hidden md:hidden"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="w-4 h-4" />
                </Button>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{getDirName(selectedConv.cwd || selectedConv.key)}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{formatTimestamp(selectedConv.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleExport(selectedConv.conversation_id)}
                  className="hidden sm:flex"
                >
                  <Download className="w-4 h-4 mr-1" />
                  导出
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="sm:hidden"
                  onClick={() => handleExport(selectedConv.conversation_id)}
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedConv(null)}
                  className="hidden sm:flex"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            {isMobile ? (
              <div className="relative flex-1 flex flex-col min-h-0">
                <div ref={mobileScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 group">
                  <div className="space-y-4">
                    {selectedConv.history?.map((msg, idx) => renderMessage(msg, idx))}
                    {(!selectedConv.history || selectedConv.history.length === 0) && (
                      <div className="text-center py-12 text-muted-foreground">暂无消息记录</div>
                    )}
                  </div>
                </div>
                {showScrollTop && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute bottom-4 right-4 z-10 rounded-full shadow-lg opacity-80 hover:opacity-100 transition-opacity"
                    onClick={scrollToTop}
                    aria-label="回到顶部"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="relative flex-1 flex flex-col min-h-0">
                <ScrollArea className="flex-1 p-3 sm:p-4 group" viewportRef={desktopViewportRef}>
                  <div className="space-y-4 sm:space-y-6">
                    {selectedConv.history?.map((msg, idx) => renderMessage(msg, idx))}
                    {(!selectedConv.history || selectedConv.history.length === 0) && (
                      <div className="text-center py-12 text-muted-foreground">暂无消息记录</div>
                    )}
                  </div>
                </ScrollArea>
                {showScrollTop && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute bottom-4 right-4 z-10 rounded-full shadow-lg opacity-80 hover:opacity-100 transition-opacity"
                    onClick={scrollToTop}
                    aria-label="回到顶部"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2 px-4">
              <MessageSquare className="w-10 h-10 mx-auto opacity-20" />
              <p className="text-sm">选择一个会话查看详情</p>
              <Button
                variant="outline"
                size="sm"
                className="md:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-4 h-4 mr-1" />
                打开会话列表
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
