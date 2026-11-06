"use client"

import { useTheme } from "next-themes"
import { useEffect } from "react"
import { useI18n } from "@/lib/i18n"

export function ThemeProviderWrapper({ children }: { children: React.ReactNode }) {
  const { setTheme, theme } = useTheme()
  const { lang } = useI18n()

  // Sync saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem("egx-theme")
    if (saved === "light" || saved === "dark" || saved === "system") {
      setTheme(saved)
    }
  }, [setTheme])

  return <>{children}</>
}

export function withThemeDetection(Component: React.ComponentType) {
  return Component
}
