import re
p = "/tmp/my-project/src/components/layout/Sidebar.tsx"
s = open(p, encoding="utf-8").read()

# 1. Fix dead nav links (404s) + fake badge
s = s.replace(
    '{ href: "/notifications", label: "التنبيهات", labelAr: "التنبيهات", icon: <BellIcon className="h-4 w-4" />, badge: 3 }',
    '{ href: "/alerts", label: "التنبيهات", labelAr: "التنبيهات", icon: <BellIcon className="h-4 w-4" />, badge: 0 }')
s = s.replace(
    '{ href: "/saved-filters", label: "الفلاتر المحفوظة", labelAr: "الفلاتر المحفوظة", icon: <Filter className="h-4 w-4" /> }',
    '{ href: "/dashboard#/scanners", label: "الفلاتر المحفوظة", labelAr: "الفلاتر المحفوظة", icon: <Filter className="h-4 w-4" /> }')

# 2. Import api client helpers
s = s.replace(
    'import { useWatchlist } from "@/lib/client/watchlist"',
    'import { useWatchlist } from "@/lib/client/watchlist"\nimport { authHeaders, getUserToken } from "@/lib/client/api"')

# 3. Replace dead badge code with live badges
old = '''  // Update watchlist badge count
  const watchlistCount = watchlist.length
  const notificationCount = 3 // TODO: fetch from API
'''
new = '''  // Live nav badges: watchlist size comes from the local store; the price-alerts
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
'''
assert old in s, "dead-code block not found"
s = s.replace(old, new)

# 4. Use renderBadge in the expanded nav loop
old_badge = '''                            {item.badge !== undefined && item.badge > 0 && (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                                {item.badge}
                              </span>
                            )}'''
assert old_badge in s, "badge block not found"
s = s.replace(old_badge, '                            {renderBadge(item)}')

open(p, "w", encoding="utf-8").write(s)
print("PATCHED OK")
