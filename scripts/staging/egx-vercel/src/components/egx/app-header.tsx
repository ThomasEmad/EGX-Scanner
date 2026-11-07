"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  Activity,
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  FileCheck2,
  Gauge,
  Languages,
  Moon,
  ScanSearch,
  Scale,
  Search,
  ShieldCheck,
  Sun,
  Wand2,
  Crown,
  Trophy,
  X,
  Menu,
  ChevronRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import type { ViewKey } from "@/lib/view-keys"
import { UserMenu } from "@/components/user-menu"
import { api, getUserToken, clearUserToken } from "@/lib/client/api"
import { MarketTicker } from "./market-ticker"

interface AppHeaderProps {
  view?: ViewKey
  companyOpen?: boolean
  onViewChange?: (v: ViewKey) => void
  onMenuToggle?: () => void
  sidebarCollapsed?: boolean
}

function HeaderSearch() {
  const { lang } = useI18n()
  const router = useRouter()
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ar = lang === "ar"

  const popularTickers = [
    { ticker: "COMI", nameEn: "Commercial International Bank", nameAr: "البنك التجاري الدولي", sector: "Banks" },
    { ticker: "ETEL", nameEn: "Telecom Egypt", nameAr: "المصرية للاتصالات", sector: "Telecom" },
    { ticker: "ABUK", nameEn: "Abu Qir Fertilizers", nameAr: "أبو قير للأسمدة", sector: "Basic Materials" },
    { ticker: "TMGH", nameEn: "Talaat Moustafa Group", nameAr: "مجموعة طلعت مصطفى", sector: "Real Estate" },
    { ticker: "EAST", nameEn: "Eastern Company", nameAr: "الشرقية للدخان", sector: "Consumer" },
  ]

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 200)
    return () => clearTimeout(id)
  }, [q])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  // Dedicated tiny search endpoint (indexed ticker/name match, 60s per-query
  // cache) — the companies list endpoint pulls metrics + prices per row and is
  // far too heavy for keystroke autocomplete at scale.
  const { data } = useQuery({
    queryKey: ["header-search", debounced],
    queryFn: async () => {
      const r = await fetch(`/api/v1/search?q=${encodeURIComponent(debounced)}`)
      return r.ok ? r.json() : { results: [] }
    },
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  })
  const results = debounced.length >= 2 ? data?.results ?? [] : []

  function go(id: string) {
    setOpen(false)
    setQ("")
    router.push(`/company/${id}`)
  }

  const itemsToShow = debounced.length >= 2 ? results : open ? popularTickers : []

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 transition-all duration-150 focus-within:border-primary/60 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/20">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setCursor(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setCursor((c) => Math.min(c + 1, itemsToShow.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setCursor((c) => Math.max(c - 1, 0))
            } else if (e.key === "Enter" && itemsToShow[cursor]) {
              e.preventDefault()
              go((itemsToShow[cursor] as { id?: string; ticker: string }).id ?? itemsToShow[cursor].ticker)
            } else if (e.key === "Escape") {
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
          placeholder={ar ? "ابحث عن شركة… (⌘K)" : "Search companies… (⌘K)"}
          className="w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70 lg:w-48"
          aria-label={ar ? "بحث الشركات" : "Company search"}
        />
        <kbd className="hidden lg:inline-flex items-center rounded border border-border/60 bg-muted/80 px-1 py-0.5 text-[9px] font-mono text-muted-foreground select-none">
          ⌘K
        </kbd>
      </div>

      {open && itemsToShow.length > 0 ? (
        <div className="absolute -right-1 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/10 backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="px-3 py-1.5 border-b border-border/40 text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
            <span>{debounced.length >= 2 ? (ar ? "الشركات المطابقة" : "Matching companies") : (ar ? "شركات شائعة" : "Popular companies")}</span>
            <span className="text-[9px]">{ar ? "اختر للفتح" : "Select to open"}</span>
          </div>
          <div className="max-h-72 overflow-y-auto scrollbar-thin py-1">
            {itemsToShow.map((c, i) => (
              <button
                key={(c as { id?: string; ticker: string }).id ?? c.ticker}
                onClick={() => go((c as { id?: string; ticker: string }).id ?? c.ticker)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-start transition-colors ${
                  i === cursor ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                }`}
              >
                <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-bold text-primary tabular">
                  {c.ticker}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {lang === "ar" ? c.nameAr || c.nameEn : c.nameEn}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">{c.sector}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AppHeader({
  view,
  companyOpen,
  onViewChange,
  onMenuToggle,
  sidebarCollapsed,
}: AppHeaderProps) {
  const { t, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [methodologyOpen, setMethodologyOpen] = useState(false)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Hydration-safe mount gate: theme (from next-themes/localStorage) differs
  // between server and first client render. Render nothing until mounted so
  // server HTML and initial client output match, then reveal the correct icon.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const token = mounted ? getUserToken() : null
  const { data: me } = useQuery({
    queryKey: ["auth-me", token],
    queryFn: () =>
      token
        ? fetch("/api/v1/auth/me", { headers: { "x-session-token": token } }).then((r) => {
            if (r.status === 401) clearUserToken()
            return r.ok ? r.json() : null
          })
        : Promise.resolve(null),
    enabled: mounted,
    staleTime: 60_000,
    retry: false,
  })
  const loggedIn = !!me?.user
  const meName: string | null = me?.user?.name ?? me?.user?.email ?? null

  const isDark = mounted && theme === "dark"

  const ar = lang === "ar"

  const handleNav = (targetKey: ViewKey) => {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/dashboard")) {
      router.push(`/dashboard#/${targetKey}`)
      return
    }
    if (onViewChange) {
      onViewChange(targetKey)
    } else {
      router.push(`/dashboard#/${targetKey}`)
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-3">
          {/* Brand + menu toggle */}
          <div className="flex items-center gap-3">
            {onMenuToggle && (
              <button
                onClick={onMenuToggle}
                className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors lg:hidden"
                aria-label={ar ? "القائمة" : "Menu"}
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <Link
              href="/"
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="Meza — home"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
                <Activity className="h-4 w-4" />
              </span>
              <span className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-sm font-bold tracking-tight">Meza</span>
                <span className="text-[10px] text-muted-foreground">{t("dash.title")}</span>
              </span>
            </Link>
          </div>

          {/* Market ticker — fixed width, never shrinks (a crowded header row
              would otherwise squeeze the marquee down to nothing) */}
          <div className="hidden lg:block w-[300px] xl:w-[440px] shrink-0 overflow-hidden">
            <MarketTicker />
          </div>

          {/* Desktop nav (only visible when sidebar is collapsed) */}
          <nav className={`hidden lg:flex items-center gap-0.5 ${sidebarCollapsed ? "" : "hidden"}`} aria-label="Primary">
            <Link
              href="/rankings"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground"
            >
              <Trophy className="h-4 w-4" />
              {lang === "ar" ? "الترتيب" : "Rankings"}
            </Link>
            <Link
              href="/sectors"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground"
            >
              <Building2 className="h-4 w-4" />
              {lang === "ar" ? "القطاعات" : "Sectors"}
            </Link>
            <Link
              href="/compare"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground"
            >
              <Scale className="h-4 w-4" />
              {lang === "ar" ? "مقارنة" : "Compare"}
            </Link>
            <Link
              href="/portfolio"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground"
            >
              <Briefcase className="h-4 w-4" />
              {lang === "ar" ? "محفظتي" : "Portfolio"}
            </Link>
            <HeaderSearch />
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 hidden sm:flex"
              onClick={() => setPremiumOpen(true)}
              title="Premium"
            >
              <Crown className="h-4 w-4 text-amber-500" />
              <span className="hidden md:inline text-xs font-semibold">Premium</span>
            </Button>

            <div className="relative hidden sm:block">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => {
                  if (loggedIn) setMenuOpen((o) => !o)
                  else router.push("/login")
                }}
                title="Account"
              >
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="hidden md:inline text-xs max-w-28 truncate">
                  {loggedIn ? (meName || (lang === "ar" ? "حسابي" : "My account")) : (lang === "ar" ? "تسجيل الدخول" : "Sign in")}
                </span>
              </Button>
              {menuOpen && loggedIn ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full z-50 mt-2">
                    <UserMenu />
                  </div>
                </>
              ) : null}
            </div>

            <Link
              href="/data-quality"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title={lang === "ar" ? "جودة البيانات والاعتماد" : "Data quality & certification"}
            >
              <BadgeCheck className="h-4 w-4 text-emerald-500" />
              <span className="hidden xl:inline">{lang === "ar" ? "جودة البيانات" : "Data quality"}</span>
            </Link>

            <div className="relative hidden sm:block">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setNotificationOpen((o) => !o)}
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
              </Button>
              {notificationOpen ? (
                <div className="fixed inset-0 z-40" onClick={() => setNotificationOpen(false)} aria-hidden />
              ) : null}
              {notificationOpen ? (
                <div className="fixed inset-0 z-50 flex items-start justify-end p-4" onClick={() => setNotificationOpen(false)}>
                  <div className="w-full max-w-xs mt-4 rounded-xl border border-border/70 bg-card shadow-xl shadow-black/10" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between border-b border-border/70 p-4">
                      <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        {lang === "ar" ? "التنبيهات الأخيرة" : "Recent alerts"}
                      </h2>
                      <Button variant="ghost" size="sm" onClick={() => setNotificationOpen(false)}>{lang === "ar" ? "إغلاق" : "Close"}</Button>
                    </div>
                    <div className="p-3 space-y-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{lang === "ar" ? "الأحداث المالية" : "Financial events"}</p>
                      <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
                        <p className="mb-1 font-medium text-foreground">
                          {lang === "ar" ? "لا توجد تنبيهات معروضة" : "No alerts to show"}
                        </p>
                        <p>
                          {lang === "ar"
                            ? "التنبيهات المالية تُبنى على أحداث مكتشفة من القوائم الموثقة، وتظهر لمشتركي Premium بعد تسجيل الدخول. لا نعرض تنبيهات تجريبية."
                            : "Financial alerts are generated from events detected in verified statements and are shown to signed-in Premium subscribers. We do not display sample alerts."}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                        <Link href="/premium" className="text-xs font-semibold text-primary hover:underline">
                          {lang === "ar" ? "باقات Premium" : "Premium plans"}
                        </Link>
                        <Link href="/data-quality" className="text-xs text-muted-foreground hover:underline">
                          {lang === "ar" ? "جودة البيانات" : "Data quality"}
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 hidden sm:flex"
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              aria-label="Toggle language"
            >
              <Languages className="h-4 w-4" />
              <span className="text-xs font-semibold">{lang === "en" ? "AR" : "EN"}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0 hidden sm:flex"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle dark mode"
            >
              {mounted && (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />)}
            </Button>

            {/* Mobile actions */}
            <div className="flex items-center gap-1 sm:hidden">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setLang(lang === "en" ? "ar" : "en")}
                aria-label="Toggle language"
              >
                <Languages className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Toggle dark mode"
              >
                {mounted && (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />)}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile nav tabs */}
        <nav className="lg:hidden -mx-1 flex gap-1 overflow-x-auto pb-2 pt-1 scrollbar-thin border-b border-border" aria-label="Primary mobile">
          <button
            onClick={() => handleNav("dashboard")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all duration-150 ${
              (view ?? "dashboard") === "dashboard"
                ? "bg-primary text-primary-foreground font-medium shadow-sm shadow-primary/15"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Gauge className="h-4 w-4" />
            {t("nav.dashboard")}
          </button>
          <button
            onClick={() => handleNav("scanners")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all duration-150 ${
              view === "scanners"
                ? "bg-primary text-primary-foreground font-medium shadow-sm shadow-primary/15"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            <ScanSearch className="h-4 w-4" />
            {t("nav.scanners")}
          </button>
          <button
            onClick={() => handleNav("custom")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all duration-150 ${
              view === "custom"
                ? "bg-primary text-primary-foreground font-medium shadow-sm shadow-primary/15"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wand2 className="h-4 w-4" />
            {t("nav.customScanner")}
          </button>
          <button
            onClick={() => handleNav("companies")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all duration-150 ${
              view === "companies" || companyOpen
                ? "bg-primary text-primary-foreground font-medium shadow-sm shadow-primary/15"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="h-4 w-4" />
            {t("nav.companies")}
          </button>
          <button
            onClick={() => handleNav("dividends")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all duration-150 ${
              view === "dividends"
                ? "bg-primary text-primary-foreground font-medium shadow-sm shadow-primary/15"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            {t("nav.dividends")}
          </button>
          <Link
            href="/rankings"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Trophy className="h-3.5 w-3.5" />
            {lang === "ar" ? "الترتيب" : "Rankings"}
          </Link>
          <Link
            href="/sectors"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Building2 className="h-3.5 w-3.5" />
            {lang === "ar" ? "القطاعات" : "Sectors"}
          </Link>
          <Link
            href="/compare"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Scale className="h-3.5 w-3.5" />
            {lang === "ar" ? "مقارنة" : "Compare"}
          </Link>
        </nav>

        {/* Methodology modal */}
        {methodologyOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setMethodologyOpen(false)} role="dialog" aria-modal="true" aria-label={t("md.title")}>
            <div className="w-full max-w-lg rounded-xl border border-border/70 bg-card p-6 shadow-xl shadow-black/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold tracking-tight">{t("md.title")}</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{t("md.body")}</p>
              <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px]">/api/v1</Badge>
                  <span>REST API — public read-only, admin-gated mutations</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px]">SHA-256</Badge>
                  <span>Data pipeline & validation</span>
                </div>
              </div>
              <Button className="mt-5 w-full" onClick={() => setMethodologyOpen(false)}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Premium modal */}
        {premiumOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setPremiumOpen(false)}>
            <div className="w-full max-w-md rounded-xl border border-border/70 bg-card shadow-xl shadow-black/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border/70 p-4">
                <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                  <Crown className="h-5 w-5 text-amber-500" />
                  {lang === "ar" ? "بريميوم" : "Premium"}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setPremiumOpen(false)}>{lang === "ar" ? "إغلاق" : "Close"}</Button>
              </div>
              <div className="p-4 space-y-3 text-xs">
                <p className="font-medium">{lang === "ar" ? "التحليل المالي المتقدم متاح فقط للمشتركين." : "Advanced financial analysis is available to subscribers only."}</p>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li>• {lang === "ar" ? "تحليل مالي متعمق بالذكاء الاصطناعي" : "In-depth AI-powered financial analysis"}</li>
                  <li>• {lang === "ar" ? "مقارنات فورية بين الشركات" : "Instant cross-company comparisons"}</li>
                  <li>• {lang === "ar" ? "ماسح ضوئي مخصص للشروط المالية" : "Custom financial-condition scanner"}</li>
                  <li>• {lang === "ar" ? "بدون إعلانات" : "No ads"}</li>
                </ul>
                <Button className="w-full" onClick={() => { setPremiumOpen(false); router.push("/premium") }}>
                  {lang === "ar" ? "عرض الباقات" : "View plans"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}
