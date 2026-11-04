"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  Search,
  User,
  Menu,
  X,
  Sun,
  Moon,
  Crown,
  ShieldCheck,
  Building2,
  Shield,
  Scale,
  Briefcase,
  CalendarDays,
  Activity,
  ChevronDown,
  LayoutDashboard,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { api, authHeaders, clearUserToken, getUserToken } from "@/lib/client/api"
import { SECTORS, sectorLabel } from "@/lib/sectors"

const NAV_TABS = [
  { href: "/dashboard", label: "Dashboard", labelAr: "لوحة القيادة", icon: LayoutDashboard, exact: true },
  { href: "/rankings", label: "Companies", labelAr: "الشركات", icon: Building2 },
  { href: "/sectors", label: "Sectors", labelAr: "القطاعات", icon: Shield },
  { href: "/compare", label: "Compare", labelAr: "المقارنة", icon: Scale },
  { href: "/portfolio", label: "Portfolio", labelAr: "المحفظة", icon: Briefcase },
  { href: "/dividends", label: "Dividends", labelAr: "التوزيعات", icon: CalendarDays },
  { href: "/watchlist", label: "Watchlist", labelAr: "قائمة المتابعة", icon: ShieldCheck },
] as const

type NavTab = typeof NAV_TABS[number]

interface TopHeaderProps {
  className?: string
}

export function TopHeader({ className }: TopHeaderProps = {}) {
  const { lang, setLang } = useI18n()
  const { setTheme, theme } = useTheme()
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const ar = lang === "ar"
  // next-themes resolves the theme on the client only. Rendering the sun/moon
  // icon from `theme` on the server caused a hydration mismatch; gate it on
  // mount instead.
  const isDark = mounted && theme === "dark"

  // Real session state. The old header rendered a hard-coded "Thomas Emad"
  // and a fake "3" notification badge for every visitor.
  const token = mounted ? getUserToken() : null
  const { data: me } = useQuery({
    queryKey: ["auth-me", token],
    queryFn: () =>
      token
        ? fetch("/api/v1/auth/me", { headers: { "x-session-token": token } }).then((r) => {
            if (r.status === 401) {
              clearUserToken()
              return null
            }
            return r.ok ? r.json() : null
          })
        : Promise.resolve(null),
    enabled: mounted,
    staleTime: 60_000,
    retry: false,
  })
  const { data: subscription } = useQuery({
    queryKey: ["subscription-me", token],
    queryFn: () =>
      fetch("/api/v1/subscription/me", { headers: { "x-session-token": token ?? "" } }).then((r) =>
        r.ok ? r.json() : null,
      ),
    enabled: mounted && !!token,
    staleTime: 60_000,
    retry: false,
  })

  const loggedIn = !!me?.user
  const meName: string | null = me?.user?.name ?? me?.user?.email ?? null
  const isPremium = !!subscription?.isPremium

  const normalizedQuery = debouncedQuery.trim().toLowerCase()
  const { data: companySearch, isFetching: companySearching } = useQuery({
    queryKey: ["header-company-search", debouncedQuery],
    queryFn: () =>
      fetch(`/api/v1/companies?search=${encodeURIComponent(debouncedQuery)}&pageSize=6`).then(async (r) => {
        if (!r.ok) return { companies: [] as { id: string; ticker: string; nameEn: string; nameAr: string | null; sector: string }[] }
        const json = (await r.json()) as { companies?: { id: string; ticker: string; nameEn: string; nameAr: string | null; sector: string }[] }
        return { companies: json.companies ?? [] }
      }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
    retry: false,
  })

  const matchedSectors = useMemo(() => {
    if (normalizedQuery.length < 2) return []
    return SECTORS.filter(
      (sector) =>
        sector.toLowerCase().includes(normalizedQuery) ||
        sectorLabel(sector, lang).toLowerCase().includes(normalizedQuery),
    ).slice(0, 4)
  }, [normalizedQuery, lang])

  const matchedTabs = useMemo(() => {
    if (normalizedQuery.length < 2) return []
    return NAV_TABS.filter(
      (tab) =>
        tab.href !== "/dashboard" &&
        ((ar ? tab.labelAr : tab.label).toLowerCase().includes(normalizedQuery) ||
          tab.label.toLowerCase().includes(normalizedQuery)),
    ).slice(0, 4)
  }, [normalizedQuery, ar])

  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"))
  }

  const isActive = useMemo(() => (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/"
    return pathname === href || pathname.startsWith(`${href}/`)
  }, [pathname])

  const handleLogout = async () => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      })
    } finally {
      clearUserToken()
      queryClient.clear()
      router.push("/login")
    }
  }

  const handleProfileClick = () => {
    if (loggedIn) setProfileOpen((open) => !open)
    else router.push("/login")
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault()
      searchInputRef.current?.focus()
      setShowSearchResults(true)
    }
  }

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 200)
    return () => clearTimeout(id)
  }, [searchQuery])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (resultsRef.current && !resultsRef.current.contains(e.target as Node)) setShowSearchResults(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const go = (href: string) => {
    setShowSearchResults(false)
    setSearchQuery("")
    router.push(href)
  }

  return (
    <header
      dir={ar ? "rtl" : "ltr"}
      className={cn(
        "sticky top-0 z-40 h-16 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/90 shadow-sm transition-colors",
        className,
      )}
    >
      <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: Brand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="EGX Financial Scanner — Home"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Activity className="h-4.5 w-4.5" />
            </div>
            <span className="hidden sm:inline font-bold tracking-tight text-foreground text-base">EGX Scanner</span>
          </Link>
        </div>

        {/* Center: Nav tabs + Search (unified bar on desktop) */}
        <div className="hidden lg:flex lg:items-center lg:gap-4 lg:flex-1 lg:max-w-[900px]">
          {/* Nav tabs - clean underline style */}
          <nav className="flex items-center gap-1" aria-label="Main navigation" role="navigation">
            {NAV_TABS.map((tab) => {
              const active = isActive(tab.href)
              const Icon = tab.icon
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors duration-200 rounded-lg",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                  <span>{ar ? tab.labelAr : tab.label}</span>
                  {active && (
                    <motion.div
                      layout
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                      initial={false}
                    />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Divider */}
          <div className="hidden lg:block w-px h-6 bg-border/40" aria-hidden="true" />

          {/* Global Search - prominent */}
          <div className="relative flex-1 max-w-xl" ref={resultsRef}>
            <label htmlFor="global-search" className="sr-only">
              {ar ? "البحث في الشركات والقطاعات" : "Search companies and sectors"}
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <Search className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                <kbd className="ml-2 hidden sm:inline-flex items-center gap-0.5 rounded border border-border/60 bg-muted/80 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/70">
                  ⌘K
                </kbd>
              </div>
              <input
                ref={searchInputRef}
                id="global-search"
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowSearchResults(true)
                }}
                onFocus={() => setShowSearchResults(true)}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowSearchResults(false)
                    searchInputRef.current?.blur()
                  }
                }}
                placeholder={ar ? "ابحث عن شركة، قطاع، أو رمز… (⌘K)" : "Search companies, sectors, tickers… (⌘K)"}
                className="w-full h-9 pl-10 pr-10 text-sm rounded-xl border border-border/60 bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                autoComplete="off"
                aria-autocomplete="list"
                aria-controls="search-results"
                
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setShowSearchResults(false); searchInputRef.current?.focus() }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={ar ? "مسح البحث" : "Clear search"}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Search Results Dropdown */}
            <AnimatePresence>
              {showSearchResults && debouncedQuery.length >= 2 && (
                <motion.div
                  id="search-results"
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute top-full left-0 right-0 z-50 mt-2 rounded-xl border border-border/60 bg-background shadow-xl shadow-black/10 overflow-hidden"
                  role="listbox"
                >
                  <div className="max-h-80 overflow-y-auto">
                    <div className="px-3 py-2 border-b border-border/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                      <span>{ar ? "نتائج البحث" : "Search Results"}</span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {ar ? "اضغط Enter للاختيار" : "Press Enter to select"}
                      </span>
                    </div>

                    {companySearching && (
                      <div className="px-3 py-3 text-xs text-muted-foreground">
                        {ar ? "جاري البحث..." : "Searching..."}
                      </div>
                    )}

                    {companySearch?.companies.length ? (
                      <div className="py-1">
                        <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {ar ? "الشركات" : "Companies"}
                        </div>
                        {companySearch.companies.map((company) => (
                          <Link
                            key={company.id}
                            href={`/company/${company.ticker}`}
                            onClick={() => go(`/company/${company.ticker}`)}
                            className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors hover:bg-muted/50"
                            role="option"
                          >
                            <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">
                              {company.ticker}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">
                                {ar ? (company.nameAr ?? company.nameEn) : company.nameEn}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {sectorLabel(company.sector, lang)}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : null}

                    {matchedSectors.length ? (
                      <div className="py-1 border-t border-border/40">
                        <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {ar ? "القطاعات" : "Sectors"}
                        </div>
                        {matchedSectors.map((sector) => (
                          <Link
                            key={sector}
                            href={`/sectors/${encodeURIComponent(sector)}`}
                            onClick={() => go(`/sectors/${encodeURIComponent(sector)}`)}
                            className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors hover:bg-muted/50"
                            role="option"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Shield className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                              {sectorLabel(sector, lang)}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {ar ? "قطاع" : "Sector"}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : null}

                    {matchedTabs.length ? (
                      <div className="py-1 border-t border-border/40">
                        <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {ar ? "الصفحات" : "Pages"}
                        </div>
                        {matchedTabs.map((tab) => (
                          <Link
                            key={tab.href}
                            href={tab.href}
                            onClick={() => go(tab.href)}
                            className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors hover:bg-muted/50"
                            role="option"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <tab.icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                              {ar ? tab.labelAr : tab.label}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : null}

                    {!companySearching &&
                    !(companySearch?.companies.length) &&
                    matchedSectors.length === 0 &&
                    matchedTabs.length === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                        {ar ? "لا توجد نتائج مطابقة" : "No matching results"}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={toggleTheme}
            aria-label={ar ? "تبديل المظهر" : "Toggle theme"}
            title={ar ? "تبديل المظهر" : "Toggle theme"}
          >
            <AnimatePresence mode="wait">
              {isDark ? (
                <motion.div key="sun" initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} exit={{ rotate: 90, scale: 0 }} transition={{ duration: 0.2 }}>
                  <Sun className="h-5 w-5 text-amber-400" />
                </motion.div>
              ) : (
                <motion.div key="moon" initial={{ rotate: 90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} exit={{ rotate: -90, scale: 0 }} transition={{ duration: 0.2 }}>
                  <Moon className="h-5 w-5 text-muted-foreground" />
                </motion.div>
              )}
            </AnimatePresence>
          </Button>

          {/* Profile / Account Menu */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={handleProfileClick}
              className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-1.5 transition-all duration-200 hover:bg-accent/30 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              aria-label={loggedIn ? (ar ? "حسابي" : "My account") : (ar ? "تسجيل الدخول" : "Sign in")}
              aria-expanded={loggedIn ? profileOpen : undefined}
              aria-haspopup={loggedIn ? "true" : undefined}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden sm:flex flex-col items-end leading-tight text-right">
                <span className="text-sm font-semibold text-foreground truncate max-w-[140px]">
                  {loggedIn ? (meName ?? (ar ? "حسابي" : "My account")) : (ar ? "تسجيل الدخول" : "Sign in")}
                </span>
                <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                  {loggedIn
                    ? (isPremium ? (ar ? "بريميوم" : "Premium") : (ar ? "مجاني" : "Free"))
                    : (ar ? "للوصول الكامل" : "For full access")}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground/70 transition-transform duration-200" style={{ transform: profileOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
            </button>

            {loggedIn && profileOpen && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border/60 bg-background shadow-xl shadow-black/10 overflow-hidden"
                  role="menu"
                >
                  <div className="p-2 space-y-1">
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-semibold text-foreground">{meName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{me?.user?.email}</p>
                    </div>
                    <hr className="border-border/40 my-1" />
                    <button
                      onClick={() => { setProfileOpen(false); router.push("/premium") }}
                      className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted/50", "text-right")}
                      role="menuitem"
                    >
                      <Crown className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{ar ? "الاشتراك" : "Subscription"}</span>
                    </button>
                    <button
                      onClick={() => { setProfileOpen(false); router.push("/data-quality") }}
                      className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted/50", "text-right")}
                      role="menuitem"
                    >
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{ar ? "جودة البيانات" : "Data quality"}</span>
                    </button>
                    <hr className="border-border/40 my-1" />
                    <button
                      onClick={handleLogout}
                      className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-destructive/10 hover:text-destructive", "text-right")}
                      role="menuitem"
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="font-medium">{ar ? "تسجيل الخروج" : "Sign out"}</span>
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Premium badge / upgrade link — never shown as account status to non-premium users */}
          {isPremium ? (
            <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1">
              <Crown className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-primary tracking-tight">{ar ? "بريميوم" : "Premium"}</span>
            </div>
          ) : (
            <Link
              href="/premium"
              className="hidden lg:flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-xs font-bold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Crown className="h-3.5 w-3.5" />
              {ar ? "ترقية" : "Upgrade"}
            </Link>
          )}

          {/* Language Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-3 rounded-xl border border-border/60 bg-card transition-colors hover:bg-accent/50"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            aria-label={ar ? "تغيير اللغة" : "Change language"}
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            <span className="text-xs font-semibold uppercase tracking-wider">{lang === "en" ? "AR" : "EN"}</span>
          </Button>
        </div>

        {/* Mobile: compact actions */}
        <div className="lg:hidden flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            aria-label="Change language"
          >
            <span className="text-xs font-bold uppercase">{lang === "en" ? "AR" : "EN"}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={() => router.push(loggedIn ? "/premium" : "/login")}
            aria-label={loggedIn ? (ar ? "حسابي" : "My account") : (ar ? "تسجيل الدخول" : "Sign in")}
          >
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile Nav Tabs (below header on small screens) */}
      <div className="lg:hidden border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/100">
        <nav className="flex overflow-x-auto px-3 py-2 gap-1 scrollbar-hide -mx-3" aria-label="Mobile navigation" role="navigation">
          {NAV_TABS.map((tab) => {
            const active = isActive(tab.href)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{ar ? tab.labelAr : tab.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}