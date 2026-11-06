"use client"

// Live market ticker strip — EGX indices + top movers, rendered as a smooth
// CSS-marquee above the header on every page. The signature trading-platform
// element. The loop is GPU-composited (transform animation) — no per-frame
// React state updates, so it costs nothing between data refreshes.

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useI18n } from "@/lib/i18n"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"

interface TickerItem {
  name?: string
  ticker?: string
  level?: number
  price?: number
  changePct: number
}

interface TickerData {
  asOf: string
  indices: TickerItem[]
  gainers: TickerItem[]
  losers: TickerItem[]
  breadth: { gainers: number; losers: number }
  delayMinutes?: number | null
}

interface TickerItemRender {
  key: string
  label: string
  value: string
  changePct: number
  ticker?: string
}

function Item({
  label,
  value,
  changePct,
  ticker,
  onNavigate,
}: {
  label: string
  value: string
  changePct: number
  ticker?: string
  onNavigate?: (ticker: string) => void
}) {
  const up = changePct >= 0
  const isClickable = !!ticker && !!onNavigate
  return (
    <button
      type="button"
      onClick={() => isClickable && onNavigate(ticker)}
      disabled={!isClickable}
      className={`inline-flex shrink-0 items-center gap-1.5 border-e border-border/40 px-3 py-1 text-[11px] transition-colors ${
        isClickable ? "cursor-pointer hover:bg-muted/60" : "cursor-default"
      }`}
    >
      <span className="font-semibold text-foreground/90">{label}</span>
      <span className="tabular text-muted-foreground" dir="ltr">
        {value}
      </span>
      <span
        className={`tabular font-bold flex items-center gap-0.5 ${
          up ? "text-positive" : "text-negative"
        }`}
        dir="ltr"
      >
        <span className="text-[9px]">{up ? "▲" : "▼"}</span>
        <span>{Math.abs(changePct).toFixed(2)}%</span>
      </span>
    </button>
  )
}

export function MarketTicker() {
  const { lang } = useI18n()
  const router = useRouter()
  const queryClient = useQueryClient()
  const ar = lang === "ar"
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLive] = useState(false)
  const [sseConnected] = useState(false)
  // Manual refresh spawns a server-side snapshot job — the endpoint is
  // admin-only now, so the button only renders for an authenticated admin.
  const [isAdminUser, setIsAdminUser] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch("/api/v1/admin/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setIsAdminUser(!!d?.isAdmin) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const { data } = useQuery({
    queryKey: ["market-ticker"],
    queryFn: () => fetch("/api/v1/market/ticker?fresh=true").then((r) => (r.ok ? (r.json() as Promise<TickerData>) : null)),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch("/api/v1/market/refresh", { method: "POST" })
      if (res.ok) {
        // Pull the fresh snapshot into the ticker immediately.
        await queryClient.invalidateQueries({ queryKey: ["market-ticker"] })
      }
    } catch (e) {
      console.error("Failed to refresh market data:", e)
    } finally {
      setIsRefreshing(false)
    }
  }

  if (!data || (data.indices.length === 0 && data.gainers.length === 0)) return null

  const items: TickerItemRender[] = [
    ...data.indices.map((i) => ({
      key: `i-${i.name}`,
      label: i.name ?? "",
      value: i.level != null ? i.level.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—",
      changePct: i.changePct,
    })),
    ...data.gainers.map((g) => ({
      key: `g-${g.ticker}`,
      label: g.ticker ?? "",
      value: g.price != null ? g.price.toFixed(2) : "—",
      changePct: g.changePct,
      ticker: g.ticker,
    })),
    ...data.losers.map((l) => ({
      key: `l-${l.ticker}`,
      label: l.ticker ?? "",
      value: l.price != null ? l.price.toFixed(2) : "—",
      changePct: l.changePct,
      ticker: l.ticker,
    })),
  ]

  if (items.length === 0) return null

  const doubled = [...items, ...items]
  const dataDate = data.asOf
    ? `${new Date(data.asOf).toISOString().slice(0, 10)} ${new Date(data.asOf).toISOString().slice(11, 16)}`
    : null

  // Scroll duration scales with the number of items so the perceived speed
  // stays constant regardless of how many symbols are listed.
  const durationSeconds = Math.max(30, Math.min(120, items.length * 3))

  const handleNavigate = (ticker: string) => {
    router.push(`/company/${ticker}`)
  }

  return (
    <div
      className="group relative flex h-8 items-center overflow-hidden border-border/50 select-none"
      dir="ltr"
      role="region"
      aria-label={ar ? "لقطة السوق" : "Market snapshot"}
    >
      <div className="hidden sm:flex shrink-0 items-center gap-1.5 border-e border-border/50 px-2.5 py-1 z-10 bg-background/90 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${isLive ? "bg-positive" : sseConnected ? "bg-warning" : "bg-emerald-500"}`} />
        <span>EGX</span>
        {isLive && <span className="text-[8px] font-medium normal-case tracking-normal text-positive">LIVE</span>}
        {sseConnected && !isLive && <span className="text-[8px] font-medium normal-case tracking-normal text-warning">CONNECTING</span>}
        {data.delayMinutes ? (
          <span className="text-[8px] font-medium normal-case tracking-normal text-muted-foreground/70">
            {ar ? `متأخر ${data.delayMinutes} د` : `${data.delayMinutes}m delayed`}
          </span>
        ) : null}
        {isAdminUser && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="ml-2 p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={ar ? "تحديث البيانات" : "Refresh data"}
            title={ar ? "تحديث البيانات" : "Refresh data"}
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      <div
        className="ticker-track is-animating group-hover:[animation-play-state:paused] py-0.5"
        style={{ willChange: "transform", "--ticker-duration": `${durationSeconds}s` } as React.CSSProperties}
      >
        {doubled.map((it, i) => (
          <Item
            key={`${it.key}-${i}`}
            label={it.label}
            value={it.value}
            changePct={it.changePct}
            ticker={it.ticker}
            onNavigate={handleNavigate}
          />
        ))}
      </div>

      {dataDate ? (
        <span
          className="absolute end-2 top-1/2 z-10 -translate-y-1/2 rounded bg-background/80 border border-border/40 px-1.5 py-0.5 text-[9px] text-muted-foreground tabular font-medium shadow-xs"
          dir="ltr"
        >
          {dataDate}
        </span>
      ) : null}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background via-background/40 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background via-background/40 to-transparent" />
    </div>
  )
}
