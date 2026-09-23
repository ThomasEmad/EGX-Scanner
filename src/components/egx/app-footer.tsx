"use client"

import { ShieldAlert } from "lucide-react"
import { useI18n } from "@/lib/i18n"

export function AppFooter() {
  const { t } = useI18n()
  return (
    <footer className="mt-auto border-t bg-muted/40 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 shrink-0">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            <span className="font-medium">{t("common.demoData")}</span>
          </div>
          <p className="leading-relaxed">{t("ft.disclaimer")}</p>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">{t("ft.demoNotice")}</p>
      </div>
    </footer>
  )
}
