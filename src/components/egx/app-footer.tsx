"use client"

import { ShieldCheck } from "lucide-react"
// ShieldCheck kept for potential future use
import { useI18n } from "@/lib/i18n"

export function AppFooter() {
  const { t, lang } = useI18n()
  return (
    <footer className="mt-auto border-t border-border/60 bg-muted/30 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-xs text-muted-foreground">

          <nav className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">

            <a href="/about" className="underline-offset-2 hover:underline">{lang === "ar" ? "من نحن" : "About"}</a>

            <a href="/disclaimer" className="underline-offset-2 hover:underline">{lang === "ar" ? "إخلاء المسؤولية" : "Disclaimer"}</a>

            <a href="/terms" className="underline-offset-2 hover:underline">{lang === "ar" ? "الشروط" : "Terms"}</a>

          </nav>

          <p className="leading-relaxed">{t("ft.disclaimer")}</p>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">{t("ft.demoNotice")}</p>
      </div>
    </footer>
  )
}
