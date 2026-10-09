"use client"

// Live market ticker strip — EGX indices + top movers, rendered as a slow
// marquee above the header on every page. The signature trading-platform element.

import { useQuery } from "@tanstack/react-query"
import { useI18n } from "@/lib/i18n"

import { useRouter } from "next/navigation"

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
          up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
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
  const { data } = useQuery({
    queryKey: ["market-ticker"],
    queryFn: () => fetch("/api/v1/market/ticker").then((r) => (r.ok ? (r.json() as Promise<TickerData>) : null)),
    refetchInterval: 120_000,
    staleTime: 60_000,
  })

  if (!data || (data.indices.length === 0 && data.gainers.length === 0)) return null

  const items: { key: string; label: string; value: string; changePct: number; ticker?: string }[] = [
    ...data.indices.map((i) => ({
      key: `i-${i.name}`,
      label: i.name ?? "",
      value: (i.level ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 }),
      changePct: i.changePct,
    })),
    ...data.gainers.map((g) => ({
      key: `g-${g.ticker}`,
      label: g.ticker ?? "",
      value: (g.price ?? 0).toFixed(2),
      changePct: g.changePct,
      ticker: g.ticker,
    })),
    ...data.losers.map((l) => ({
      key: `l-${l.ticker}`,
      label: l.ticker ?? "",
      value: (l.price ?? 0).toFixed(2),
      changePct: l.changePct,
      ticker: l.ticker,
    })),
  ]
  if (items.length === 0) return null

  const doubled = [...items, ...items]
  const dataDate = data.asOf ? new Date(data.asOf).toISOString().slice(0, 10) : null

  const handleNavigate = (ticker: string) => {
    router.push(`/company/${ticker}`)
  }

  return (
    <div
      className="relative flex items-center overflow-hidden border-b border-border/50 bg-muted/20 dark:bg-card/50 backdrop-blur-xs select-none"
      dir="ltr"
      role="marquee"
      aria-label={ar ? "شريط السوق الحي" : "Live market ticker"}
    >
      <div className="hidden sm:flex shrink-0 items-center gap-1.5 border-e border-border/50 px-2.5 py-1 z-10 bg-background/90 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>EGX</span>
      </div>

      <div className="ticker-track py-0.5">
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
