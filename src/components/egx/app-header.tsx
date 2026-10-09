"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useQuery } from "@tanstack/react-query"
import { Activity, Briefcase, Building2, CalendarDays, FileCheck2, Gauge, Languages, Moon, ScanSearch, Scale, Search, ShieldCheck, Sun, Wand2, Crown, Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import type { ViewKey } from "@/lib/view-keys"
import { UserMenu } from "@/components/user-menu"
import { api, getUserToken, clearUserToken } from "@/lib/client/api"

import { MarketTicker } from "./market-ticker"

// Header search — debounced company autocomplete with keyboard shortcut support (Ctrl+K / ⌘K)
function HeaderSearch() {
  const { lang, t } = useI18n()
  const router = useRouter()
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ar = lang === "ar"

  // Quick jump suggestions when input is empty/focused
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

  // Global Ctrl+K / ⌘K keyboard shortcut
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

  const { data } = useQuery({
    queryKey: ["header-search", debounced],
    queryFn: () => api.companies({ search: debounced, pageSize: 6 }),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  })
  const results = debounced.length >= 2 ? data?.companies ?? [] : []

  function go(id: string) {
    setOpen(false)
    setQ("")
    router.push(`/company/${id}`)
  }

  const itemsToShow = debounced.length >= 2 ? results : open ? popularTickers : []

  return (
    <div ref={boxRef} className="relative ms-1">
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
        <div className="absolute end-0 top-full z-50 mt-2 w-76 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/10 backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-100">
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
}: {
  view?: ViewKey
  companyOpen?: boolean
  onViewChange?: (v: ViewKey) => void
}) {
  const { t, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [methodologyOpen, setMethodologyOpen] = useState(false)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // session probe — headers include the session token (localStorage OR sessionStorage)
  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () =>
      fetch("/api/v1/auth/me", { headers: { "x-session-token": getUserToken() ?? "" } }).then((r) => {
        if (r.status === 401) clearUserToken()
        return r.ok ? r.json() : null
      }),
    staleTime: 60_000,
    retry: false,
  })
  const loggedIn = !!me?.user
  const meName: string | null = me?.user?.name ?? me?.user?.email ?? null

  const tabs: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
    { key: "dashboard", label: t("nav.dashboard"), icon: <Gauge className="h-4 w-4" /> },
    { key: "scanners", label: t("nav.scanners"), icon: <ScanSearch className="h-4 w-4" /> },
    { key: "custom", label: t("nav.customScanner"), icon: <Wand2 className="h-4 w-4" /> },
    { key: "companies", label: t("nav.companies"), icon: <Building2 className="h-4 w-4" /> },
    { key: "dividends", label: t("nav.dividends"), icon: <CalendarDays className="h-4 w-4" /> },
  ]

  const activeKey: ViewKey = (companyOpen ? "companies" : view) ?? "dashboard"

  const handleNav = (targetKey: ViewKey) => {
    // If we're not currently on the dashboard page, push to /dashboard#/${targetKey}
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
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 shadow-xs">
      <MarketTicker />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-3">
          <button
            onClick={() => handleNav("dashboard")}
            className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="EGX Financial Scanner — home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
              <Activity className="h-4.5 w-4.5" />
            </span>
            <span className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-sm font-bold tracking-tight">EGX Scanner</span>
              <span className="text-[10px] text-muted-foreground">{t("dash.title")}</span>
            </span>
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
              {t("co.trustBadge")}
            </Badge>
          </button>

          <nav className="hidden lg:flex items-center gap-0.5" aria-label="Primary">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleNav(tab.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all duration-150 ${
                  activeKey === tab.key
                    ? "bg-primary/10 font-semibold text-primary shadow-xs"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
                aria-current={activeKey === tab.key ? "page" : undefined}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => router.push("/rankings")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-all duration-150 hover:bg-muted/60 hover:text-foreground"
            >
              <Trophy className="h-4 w-4" />
              {lang === "ar" ? "الترتيب" : "Rankings"}
            </button>
            <button
              onClick={() => router.push("/compare")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-all duration-150 hover:bg-muted/60 hover:text-foreground"
            >
              <Scale className="h-4 w-4" />
              {lang === "ar" ? "مقارنة" : "Compare"}
            </button>
            <button
              onClick={() => router.push("/portfolio")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-all duration-150 hover:bg-muted/60 hover:text-foreground"
            >
              <Briefcase className="h-4 w-4" />
              {lang === "ar" ? "محفظتي" : "Portfolio"}
            </button>
            <HeaderSearch />
          </nav>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setPremiumOpen(true)} title="Premium">
              <Crown className="h-4 w-4 text-amber-500" />
              <span className="hidden md:inline text-xs font-semibold">Premium</span>
            </Button>
            <div className="relative">
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
                  <div className="absolute end-0 top-full z-50 mt-2">
                    <UserMenu />
                  </div>
                </>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
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
        <nav className="lg:hidden -mx-1 flex gap-1 overflow-x-auto pb-2 pt-1 scrollbar-thin" aria-label="Primary mobile">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleNav(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all duration-150 ${
                activeKey === tab.key
                  ? "bg-primary text-primary-foreground font-medium shadow-sm shadow-primary/15"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => router.push("/rankings")}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Trophy className="h-3.5 w-3.5" />
            {lang === "ar" ? "الترتيب" : "Rankings"}
          </button>
          <button
            onClick={() => router.push("/compare")}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Scale className="h-3.5 w-3.5" />
            {lang === "ar" ? "مقارنة" : "Compare"}
          </button>
          <button
            onClick={() => router.push("/portfolio")}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Briefcase className="h-3.5 w-3.5" />
            {lang === "ar" ? "محفظتي" : "Portfolio"}
          </button>
        </nav>
      </div>

      {methodologyOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setMethodologyOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("md.title")}
        >
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
    </header>
  )
}
