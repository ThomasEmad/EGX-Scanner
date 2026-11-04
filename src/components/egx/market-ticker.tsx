"use client"

// Live market ticker strip — EGX indices + top movers, rendered as a smooth
// marquee above the header on every page. The signature trading-platform element.

import { useEffect, useRef, useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
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
      <span className="tabular text-muted-foreground">{value}</span>
      <span
        className={`tabular font-bold flex items-center gap-0.5 ${
          up ? "text-positive" : "text-negative"
        }`}
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
  const ar = lang === "ar"
  const [isVisible, setIsVisible] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [scrollPosition, setScrollPosition] = useState(0)
  const [animationId, setAnimationId] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const itemWidthsRef = useRef<Map<number, number>>(new Map())
  const [isLive, setIsLive] = useState(false)
  const [sseConnected, setSseConnected] = useState(false)

  const { data } = useQuery({
    queryKey: ["market-ticker"],
    queryFn: () => fetch("/api/v1/market/ticker?fresh=true").then((r) => (r.ok ? (r.json() as Promise<TickerData>) : null)),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch("/api/v1/market/refresh", { method: "POST" })
      if (res.ok) {
        // Invalidate and refetch
        // The query will automatically refetch due to the fresh query
      }
    } catch (e) {
      console.error("Failed to refresh market data:", e)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Calculate item widths for virtualization
  useEffect(() => {
    if (!trackRef.current) return
    const items = trackRef.current.querySelectorAll('[data-ticker-item]')
    const widths = new Map<number, number>()
    items.forEach((el, i) => {
      widths.set(i, (el as HTMLElement).offsetWidth)
    })
    itemWidthsRef.current = widths
  }, [data])

  // IntersectionObserver to pause when off-screen
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
        setIsPaused(!entry.isIntersecting)
      },
      { rootMargin: "50px", threshold: 0 }
    )

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // requestAnimationFrame-based smooth scrolling
  useEffect(() => {
    if (!isVisible || isPaused || !trackRef.current) return

    const track = trackRef.current
    const container = containerRef.current
    if (!container) return

    const containerWidth = container.offsetWidth
    let lastTime = performance.now()
    let position = scrollPosition
    const speed = 0.5 // pixels per frame

    const animate = (currentTime: number) => {
      if (!isVisible || isPaused || !trackRef.current) {
        setAnimationId(null)
        return
      }

      const deltaTime = currentTime - lastTime
      lastTime = currentTime

      // Move based on time delta for consistent speed
      position -= speed * (deltaTime / 16.67) // normalize to 60fps

      // Check if we've scrolled past the first set of items
      const trackWidth = track.scrollWidth / 2 // since we doubled
      if (Math.abs(position) >= trackWidth) {
        position = 0 // seamless loop
      }

      setScrollPosition(position)
      track.style.transform = `translate3d(${position}px, 0, 0)`

      const id = requestAnimationFrame(animate)
      setAnimationId(id)
    }

    const id = requestAnimationFrame(animate)
    setAnimationId(id)

    return () => {
      if (id) cancelAnimationFrame(id)
      setAnimationId(null)
    }
  }, [isVisible, isPaused, scrollPosition])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationId) cancelAnimationFrame(animationId)
    }
  }, [animationId])

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

  const handleNavigate = (ticker: string) => {
    router.push(`/company/${ticker}`)
  }

  return (
    <div
      ref={containerRef}
      className="relative flex items-center overflow-hidden border-b border-border/50 bg-muted/20 dark:bg-card/50 backdrop-blur-xs select-none"
      dir="ltr"
      role="region"
      aria-label={ar ? "لقطة السوق" : "Market snapshot"}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
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
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="ml-2 p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={ar ? "تحديث البيانات" : "Refresh data"}
          title={ar ? "تحديث البيانات" : "Refresh data"}
        >
          <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div ref={trackRef} className="ticker-track py-0.5" style={{ willChange: "transform" }}>
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