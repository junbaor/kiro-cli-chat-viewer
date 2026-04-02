import { useState, useEffect, useCallback } from "react"

type Theme = "system" | "light" | "dark"

const STORAGE_KEY = "theme"

function getSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyTheme(theme: Theme) {
  const isDark = theme === "dark" || (theme === "system" && getSystemDark())
  document.documentElement.classList.toggle("dark", isDark)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Theme) || "system"
  })

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem(STORAGE_KEY, t)
    applyTheme(t)
  }, [])

  // Apply on mount
  useEffect(() => {
    applyTheme(theme)
  }, [])

  // Listen for system preference changes
  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme("system")
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  const isDark = theme === "dark" || (theme === "system" && getSystemDark())

  return { theme, setTheme, isDark }
}
