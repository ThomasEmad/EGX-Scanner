"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import {
  Activity,
  Building2,
  ScanSearch,
  Scale,
  CalendarDays,
  Briefcase,
  ShieldCheck,
  Sun,
  Moon,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings,
  Crown,
  Bell,
  BarChart3,
  Shield,
  Filter,
  Sparkles,
  Gauge,
  Search,
  ChevronDown,
  Clock,
  Star,
  Home,
  LayoutDashboard,
  TrendingUp,
  Users,
  Bookmark,
  Bell as BellIcon,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { useWatchlist } from "@/lib/client/watchlist"
import { authHeaders, getUserToken } from "@/lib/client/api"
import { AnimatePresence } from "framer-motion"
import { useSubscriptionGate } from "@/lib/client/subscription-gate"

interface NavItem {
  href: string
  label: string
  labelAr: string
  icon: React.ReactNode
  badge?: number
  external?: boolean
}

interface NavGroup {
  label: string
  labelAr: string
  items: NavItem[]
  icon?: React.ReactNode
  collapsible?: boolean
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "الرئيسية",
    labelAr: "الرئيسية",
    icon: <Home className="h-4 w-4" />,
    collapsible: true,
    items: [
      { href: "/", label: "الرئيسية", labelAr: "الرئيسية", icon: <Home className="h-4 w-4" /> },
      { href: "/dashboard", label: "لوحة القيادة", labelAr: "لوحة القيادة", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/undervalued", label: "استكشاف السوق", labelAr: "استكشاف السوق", icon: <TrendingUp className="h-4 w-4" /> },
      { href: "/companies", label: "الشركات", labelAr: "الشركات", icon: <Building2 className="h-4 w-4" /> },
      { href: "/sectors", label: "القطاعات", labelAr: "القطاعات", icon: <Shield className="h-4 w-4" /> },
      { href: "/rankings", label: "الترتيب", labelAr: "الترتيب", icon: <Sparkles className="h-4 w-4" /> },
    ],
  },
  {
    label: "أدوات التحليل",
    labelAr: "أدوات التحليل",
    icon: <BarChart3 className="h-4 w-4" />,
    collapsible: true,
    items: [
      { href: "/dashboard#/custom", label: "الماسح المخصص", labelAr: "الماسح المخصص", icon: <Scale className="h-4 w-4" /> },
      { href: "/compare", label: "المقارنات", labelAr: "المقارنات", icon: <Scale className="h-4 w-4" /> },
      { href: "/dividends", label: "التوزيعات", labelAr: "التوزيعات", icon: <CalendarDays className="h-4 w-4" /> },
    ],
  },
  {
    label: "مساحتي",
    labelAr: "مساحتي",
    icon: <Users className="h-4 w-4" />,
    collapsible: true,
    items: [
      { href: "/watchlist", label: "قائمة المتابعة", labelAr: "قائمة المتابعة", icon: <ShieldCheck className="h-4 w-4" />, badge: 0 },
      { href: "/alerts", label: "التنبيهات", labelAr: "التنبيهات", icon: <BellIcon className="h-4 w-4" />, badge: 0 },
      { href: "/dashboard#/scanners", label: "الفلاتر المحفوظة", labelAr: "الفلاتر المحفوظة", icon: <Filter className="h-4 w-4" /> },
    ],
  },
]

export function Sidebar({ collapsed = false, onCollapseChange }: { collapsed?: boolean; onCollapseChange?: (collapsed: boolean) => void }) {
  const { lang, setLang } = useI18n()
  const { setTheme } = useTheme()
  const pathname = usePathname()
  const router = useRouter()
  const { isPremium } = useSubscriptionGate()
  const watchlist = useWatchlist((s) => s.items)
  const ar = lang === "ar"
  const [searchQuery, setSearchQuery] = useState("")
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    NAV_GROUPS.reduce((acc, g) => ({ ...acc, [g.label]: true }), {})
  )
  const [showSearch, setShowSearch] = useState(false)
  const [recentItems, setRecentItems] = useState<string[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const navListRef = useRef<HTMLDivElement>(null)

  const isCollapsed = collapsed

  // Update recent items when navigation occurs
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      setRecentItems((prev) => {
        const filtered = prev.filter((u) => u !== url)
        return [url, ...filtered].slice(0, 5)
      })
    }

    // Listen for route changes
    window.addEventListener("popstate", () => handleRouteChange(window.location.pathname))
    return () => window.removeEventListener("popstate", () => handleRouteChange(window.location.pathname))
  }, [])

  // Load recent items from localStorage after mount (hydration-safe)
  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecentItems(JSON.parse(localStorage.getItem("egx-recent-items") ?? "[]"))
    }
  }, [])

  // Derived search results (declared before use to satisfy React Compiler)
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return NAV_GROUPS

    return NAV_GROUPS.map((group) => {
      const filteredItems = group.items.filter((item) =>
        item.labelAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
      return filteredItems.length > 0 ? { ...group, items: filteredItems } : null
    }).filter(Boolean) as NavGroup[]
  }, [searchQuery])

  const getVisibleItems = useCallback(() => {
    const items: { href: string; label: string; labelAr: string; group: string; icon: React.ReactNode }[] = []
    filteredGroups.forEach((group) => {
      group.items.forEach((item) => {
        items.push({ ...item, group: group.label })
      })
    })
    return items
  }, [filteredGroups])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 0)
        return
      }

      if (!showSearch) return

      const visibleItems = getVisibleItems()
      if (visibleItems.length === 0) return

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setFocusedIndex((prev) => Math.min(prev + 1, visibleItems.length - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          setFocusedIndex((prev) => Math.max(prev - 1, 0))
          break
        case "Enter":
          e.preventDefault()
          if (focusedIndex >= 0 && focusedIndex < visibleItems.length) {
            const item = visibleItems[focusedIndex]
            if (item.href.startsWith("/dashboard#")) {
              router.push(item.href)
            } else {
              router.push(item.href)
            }
            setShowSearch(false)
            setFocusedIndex(-1)
          }
          break
        case "Escape":
          e.preventDefault()
          setShowSearch(false)
          setFocusedIndex(-1)
          searchInputRef.current?.blur()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showSearch, pathname, router, getVisibleItems])

  // Live nav badges: watchlist size comes from the local store; the price-alerts
  // count is fetched from the API for signed-in users (badge stays hidden when
  // signed out — the /alerts page itself handles the login prompt). Refreshed on
  // route change and when the tab regains focus so it never shows stale data.
  const [alertsActiveCount, setAlertsActiveCount] = useState(0)

  useEffect(() => {
    const fetchAlertsCount = () => {
      const token = getUserToken()
      if (!token) {
        setAlertsActiveCount(0)
        return
      }
      fetch("/api/v1/alerts", { headers: authHeaders(token) })
        .then((r) => (r.ok ? r.json() : { alerts: [] }))
        .then((d: { alerts?: { active?: boolean }[] }) => {
          setAlertsActiveCount((d?.alerts ?? []).filter((a) => a.active).length)
        })
        .catch(() => {})
    }
    fetchAlertsCount()
    window.addEventListener("focus", fetchAlertsCount)
    return () => window.removeEventListener("focus", fetchAlertsCount)
  }, [pathname])

  const renderBadge = (item: NavItem) => {
    const live: Record<string, number> = { "/watchlist": watchlist.length, "/alerts": alertsActiveCount }
    const b = live[item.href] ?? item.badge
    if (b === undefined || b <= 0) return null
    return (
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
        {b}
      </span>
    )
  }

  const isActive = useCallback((href: string) => {
    if (href === "/") return pathname === "/" || pathname === "/dashboard"
    if (href === "/dashboard") return pathname === "/" || pathname === "/dashboard"
    return pathname.startsWith(href)
  }, [pathname])

  const toggleTheme = () => {
    setTheme((theme) => (theme === "dark" ? "light" : "dark"))
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  const handleNavigate = (href: string) => {
    if (href.startsWith("/dashboard#")) {
      router.push(href)
    } else {
      router.push(href)
    }
    // Add to recent items
    setRecentItems((prev) => {
      const filtered = prev.filter((u) => u !== href)
      return [href, ...filtered].slice(0, 5)
    })
    localStorage.setItem("egx-recent-items", JSON.stringify([href, ...recentItems.filter((u) => u !== href)].slice(0, 5)))
  }

  const toggleThemeHandler = () => {
    setTheme((theme) => (theme === "dark" ? "light" : "dark"))
  }

  return (
    <aside
      className={`fixed top-0 bottom-0 h-screen z-[60] w-[260px] ${ar ? "right-0 border-l border-border" : "left-0 border-r border-border"} bg-sidebar shadow-2xl overflow-y-auto transition-left duration-300 ease-in-out ${isCollapsed ? (ar ? "-right-[260px]" : "-left-[260px]") : ""}`}
      aria-label="Main navigation"
    >
      <div className="flex h-full flex-col">
        {/* Brand block */}
        <div className={`flex items-center gap-3 h-16 px-4 ${isCollapsed ? "justify-center" : ""}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BarChart3 className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-bold tracking-tight text-foreground">Meza</span>
              <span className="text-[10px] text-muted-foreground tracking-tighter">Analyze • Compare • Invest</span>
            </div>
          )}
        </div>

        {/* Search */}
        {!isCollapsed && (
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="search"
                placeholder="البحث في القائمة... (⌘K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowSearch(true)}
                onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                className="pl-9 h-9 w-full text-sm"
                aria-label="البحث في القائمة"
              />
              {showSearch && searchQuery && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border bg-background shadow-lg p-2 animate-in fade-in-100 duration-100">
                  <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground">
                    {lang === "ar" ? "نتائج البحث" : "Search Results"}
                  </div>
                  <AnimatePresence>
                    {getVisibleItems().length > 0 ? (
                      <div className="max-h-60 overflow-y-auto">
                        {getVisibleItems().map((item, i) => (
                          <button
                            key={`${item.group}::${item.href}`}
                            onClick={() => handleNavigate(item.href)}
                            className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded-lg transition-colors ${
                              i === 0 ? "bg-accent/50" : ""
                            } hover:bg-accent/30`}
                          >
                            {item.icon}
                            <span className="flex-1 text-start">{item.labelAr}</span>
                            <span className="text-[10px] text-muted-foreground">{item.group}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        {lang === "ar" ? "لا توجد نتائج" : "No results found"}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => onCollapseChange?.(!isCollapsed)}
          className="p-1.5 mx-2 mt-2 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={ar ? "طي الشريط الجانبي" : "Collapse sidebar"}
        >
          {ar ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Navigation groups */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto" ref={navListRef}>
          {/* Recent items */}
          {!isCollapsed && recentItems.length > 0 && !searchQuery && (
            <div className="mb-2">
              <div className="px-2 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Clock className="h-3 w-3" />
                {lang === "ar" ? "العناصر الأخيرة" : "Recent"}
              </div>
              <div className="space-y-1">
                {recentItems.slice(0, 3).map((url, i) => {
                  const group = NAV_GROUPS.find((g) => g.items.some((i) => i.href === url))
                  const item = group?.items.find((i) => i.href === url)
                  if (!item) return null
                  return (
                    <Link
                      key={`recent::${url}`}
                      href={url}
                      onClick={() => handleNavigate(url)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                        isActive(url)
                          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      }`}
                    >
                      {item.icon}
                      <span className="flex-1 truncate">{item.labelAr}</span>
                      <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {filteredGroups.map((group) => (
            <div
              key={group.label}
              className="space-y-0.5"
            >
              {group.collapsible ? (
                <>
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className={`flex items-center gap-2 w-full px-2 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors ${
                      expandedGroups[group.label] ? "" : "opacity-70"
                    }`}
                    aria-expanded={expandedGroups[group.label]}
                  >
                    {group.icon}
                    <span className="flex-1 text-start">{group.labelAr}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${expandedGroups[group.label] ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  <AnimatePresence>
                    {expandedGroups[group.label] && (
                      <div
                        className="space-y-0.5"
                      >
                        {group.items.map((item) => (
                          <Link
                            key={`${group.label}::${item.href}`}
                            href={item.href}
                            onClick={() => handleNavigate(item.href)}
                            className={cn(
                              "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150",
                              isActive(item.href)
                                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                            )}
                          >
                            {item.icon}
                            <span className="flex-1 truncate">{item.labelAr}</span>
                            {renderBadge(item)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <>
                  <h2 className="px-2 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.labelAr}
                  </h2>
                  {group.items.map((item) => (
                    <Link
                      key={`${group.label}::${item.href}`}
                      href={item.href}
                      onClick={() => handleNavigate(item.href)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150",
                        isActive(item.href)
                          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      )}
                    >
                      {item.icon}
                      <span className="flex-1">{item.labelAr}</span>
                    </Link>
                  ))}
                </>
              )}
            </div>
          ))}
        </nav>

        {/* Bottom actions + Premium card */}
        <div className="px-3 pb-4 space-y-2 border-t border-border/40">
          <div className="flex items-center gap-2 px-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleThemeHandler}
              className="flex-1 justify-start"
              aria-label={ar ? "تبديل المظهر" : "Toggle theme"}
            >
              {typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="flex-1 justify-start"
              aria-label={ar ? "تغيير اللغة" : "Change language"}
            >
              {lang === "en" ? "AR" : "EN"}
            </Button>
          </div>

          {/* Premium card */}
          <div
            className="px-2 py-3 rounded-xl border border-border/50 bg-sidebar-accent/50"
          >
            <div className="flex items-start gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-gold/10 text-gold">
                <Crown className="h-3 w-3" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-semibold text-foreground leading-tight">
                  {ar ? "انضم إلى بريميوم" : "Upgrade to Premium"}
                </h3>
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                  {ar ? "تحليل متقدم، مقارنات فورية، وماسح مخصص." : "Advanced analysis, instant comparisons, custom scanner."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => router.push("/premium")}
              className="mt-2 w-full py-1.5 text-[11px] font-semibold"
            >
              {ar ? "استكشاف الباقات" : "Explore plans"}
            </Button>
          </div>

          {/* Version label */}
          <p className="px-2 text-[10px] text-muted-foreground/60 leading-none">
            Meza v1.0.0
          </p>

          <Button
            variant="outline"
            size="sm"
            className="w-full py-1.5 text-[11px] font-semibold border-border/60"
            onClick={() => router.push("/login")}
            aria-label={ar ? "تسجيل الدخول" : "Sign in"}
          >
            {ar ? "تسجيل الدخول" : "Sign in"}
          </Button>
        </div>
      </div>
    </aside>
  )
}