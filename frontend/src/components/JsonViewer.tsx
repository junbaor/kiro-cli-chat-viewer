import { useState, useCallback, useEffect } from "react"
import { cn } from "../lib/utils"
import { ChevronRight, ChevronDown, X, Maximize2, Copy, Check } from "lucide-react"

// Recursive JSON tree node
function JsonNode({ name, value, depth = 0, defaultExpanded = true }: {
  name?: string
  value: unknown
  depth?: number
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded && depth < 3)

  const isObject = value !== null && typeof value === "object"
  const isArray = Array.isArray(value)
  const entries = isObject ? Object.entries(value as Record<string, unknown>) : []
  const isEmpty = entries.length === 0

  const renderValue = (val: unknown) => {
    if (val === null) return <span className="text-orange-500 dark:text-orange-400">null</span>
    if (typeof val === "boolean") return <span className="text-purple-600 dark:text-purple-400">{String(val)}</span>
    if (typeof val === "number") return <span className="text-blue-600 dark:text-blue-400">{val}</span>
    if (typeof val === "string") {
      return <span className="text-green-700 dark:text-green-400 break-all">"{val}"</span>
    }
    return <span>{String(val)}</span>
  }

  if (!isObject) {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {name !== undefined && (
          <span className="text-rose-600 dark:text-rose-400 flex-shrink-0">"{name}": </span>
        )}
        {renderValue(value)}
      </div>
    )
  }

  const bracket = isArray ? ["[", "]"] : ["{", "}"]

  return (
    <div>
      <div
        className="flex items-start gap-1 py-0.5 cursor-pointer hover:bg-muted/50 rounded-sm"
        style={{ paddingLeft: depth * 16 }}
        onClick={() => setExpanded(!expanded)}
      >
        {isEmpty ? (
          <span className="w-4" />
        ) : expanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground mt-0.5" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0 text-muted-foreground mt-0.5" />
        )}
        {name !== undefined && (
          <span className="text-rose-600 dark:text-rose-400 flex-shrink-0">"{name}": </span>
        )}
        {isEmpty ? (
          <span className="text-muted-foreground">{bracket[0]}{bracket[1]}</span>
        ) : !expanded ? (
          <span className="text-muted-foreground">
            {bracket[0]} <span className="text-xs opacity-60">{entries.length} {isArray ? "items" : "keys"}</span> {bracket[1]}
          </span>
        ) : (
          <span className="text-muted-foreground">{bracket[0]}</span>
        )}
      </div>
      {expanded && !isEmpty && (
        <>
          {entries.map(([key, val]) => (
            <JsonNode key={key} name={isArray ? undefined : key} value={val} depth={depth + 1} defaultExpanded={defaultExpanded} />
          ))}
          <div style={{ paddingLeft: depth * 16 }} className="text-muted-foreground py-0.5">
            <span className="ml-5">{bracket[1]}</span>
          </div>
        </>
      )}
    </div>
  )
}

// Fullscreen JSON viewer modal
export function JsonViewerModal({ data, title, onClose }: {
  data: unknown
  title: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [data])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-[95vw] h-[90vh] max-w-5xl bg-card border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <Maximize2 className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="font-medium text-sm truncate">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors",
                copied ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "hover:bg-muted text-muted-foreground"
              )}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "已复制" : "复制"}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* JSON Tree */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
          <JsonNode value={data} defaultExpanded={true} />
        </div>
      </div>
    </div>
  )
}

// Small inline button to trigger the modal
export function JsonFormatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      title="格式化查看 JSON"
    >
      <Maximize2 className="w-3 h-3" />
      格式化
    </button>
  )
}
