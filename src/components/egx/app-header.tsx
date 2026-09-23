"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { useQuery } from "@tanstack/react-query"
import { Activity, Building2, CalendarDays, FileCheck2, Gauge, Languages, Moon, ScanSearch, ShieldCheck, Sun, Wand2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import type { ViewKey } from "@/app/page"

export function AppHeader({
  view,
  companyOpen,
  onViewChange,
}: {
  view: ViewKey
  companyOpen: boolean
  onViewChange: (v: ViewKey) => void
}) {
  const { t, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const [methodologyOpen, setMethodologyOpen] = useState(false)

  const { data: reviewData } = useQuery({
    queryKey: ["review-count"],
    queryFn: () => fetch("/api/v1/dashboard").then((r) => r.json()) as Promise<{ stats: { pendingReview: number } }>,
    staleTime: 60_000,
  })
  const pendingReview = reviewData?.stats.pendingReview ?? 0

  const tabs: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
    { key: "dashboard", label: t("nav.dashboard"), icon: <Gauge className="h-4 w-4" /> },
    { key: "scanners", label: t("nav.scanners"), icon: <ScanSearch className="h-4 w-4" /> },
    { key: "custom", label: t("nav.customScanner"), icon: <Wand2 className="h-4 w-4" /> },
    { key: "companies", label: t("nav.companies"), icon: <Building2 className="h-4 w-4" /> },
    { key: "dividends", label: t("nav.dividends"), icon: <CalendarDays className="h-4 w-4" /> },
    { key: "reports", label: t("nav.reports"), icon: <FileCheck2 className="h-4 w-4" /> },
  ]

  const activeKey: ViewKey = companyOpen ? "companies" : view

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-3">
          <button
            onClick={() => onViewChange("dashboard")}
            className="flex items-center gap-2 rounded-md px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="EGX Financial Scanner — home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-4.5 w-4.5" />
            </span>
            <span className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-sm font-bold tracking-tight">EGX Scanner</span>
              <span className="text-[10px] text-muted-foreground">{t("dash.title")}</span>
            </span>
            <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
              {t("co.trustBadge")}
            </Badge>
          </button>

          <nav className="hidden lg:flex items-center gap-1" aria-label="Primary">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onViewChange(tab.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  activeKey === tab.key
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                aria-current={activeKey === tab.key ? "page" : undefined}
              >
                {tab.icon}
                {tab.label}
                {tab.key === "reports" && pendingReview > 0 ? (
                  <span className="ms-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                    {pendingReview}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setMethodologyOpen(true)} title={t("nav.methodology")}>
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden md:inline text-xs">{t("nav.methodology")}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1"
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              aria-label="Toggle language"
            >
              <Languages className="h-4 w-4" />
              <span className="text-xs font-semibold">{lang === "en" ? "AR" : "EN"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle dark mode"
            >
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="hidden h-4 w-4 dark:block" />
            </Button>
          </div>
        </div>

        {/* mobile nav */}
        <nav className="lg:hidden -mx-1 flex gap-1 overflow-x-auto pb-2 scrollbar-thin" aria-label="Primary mobile">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onViewChange(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
                activeKey === tab.key
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.key === "reports" && pendingReview > 0 ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                  {pendingReview}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {methodologyOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setMethodologyOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("md.title")}
        >
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{t("md.title")}</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("md.body")}</p>
            <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[10px]">/api/v1</Badge>
                <span>REST API — public read-only, admin-gated mutations</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[10px]">SHA-256</Badge>
                <span>Upload deduplication & source traceability</span>
              </div>
            </div>
            <Button className="mt-5 w-full" onClick={() => setMethodologyOpen(false)}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  )
}
