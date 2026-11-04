"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  BellRing,
  Building2,
  CalendarDays,
  FileCheck2,
  Gauge,
  Lock,
  Percent,
  Scale,
  ScanSearch,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Activity,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, getUserToken, type DashboardData } from "@/lib/client/api"
import { useWatchlist } from "@/lib/client/watchlist"
import { useI18n, type DictKey } from "@/lib/i18n"
import { formatEgp } from "@/lib/financial/units"
import { DemoBadge, EventBadge } from "./shared"
import { QaBox } from "./qa-box"
import { EVENT_TYPE_MAP } from "@/lib/financial/registry"
import type { ViewKey } from "@/lib/view-keys"
import { sectorLabel } from "@/lib/sectors"

interface SectorAgg {
  sector: string
  companyCount: number
  avgRoe: number | null
  avgRoa: number | null
  avgNetMargin: number | null
  avgPe: number | null
  avgPb: number | null
  totalMarketCap: number | null
  totalRevenue: number | null
  totalNetProfit: number | null
  medianRoe: number | null
  medianPe: number | null
  medianPb: number | null
  periodLabel: string | null
  periodType: string | null
  fiscalYear: number | null
  dayChangePct: number | null
  advancing: number
  declining: number
  unchanged: number
  pricedCompanyCount: number
}

interface BreadthData {
  advancing: number
  declining: number
  unchanged: number
  tradedValue: number | null
  asOf: string | null
  pricedCount?: number
  tradedValueCoverage?: number | null
}

interface WatchlistItemWithPrice {
  id: string
  ticker: string
  price?: number
  changePct?: number
  asOf?: string
}

export function DashboardView({
  onOpenScanner,
  onOpenCompany,
  onViewChange,
}: {
  onOpenScanner: (ruleId: string) => void
  onOpenCompany: (id: string) => void
  onViewChange: (v: ViewKey) => void
}) {
  const router = useRouter()
  const { t, lang, pick } = useI18n()
  const ar = lang === "ar"

  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard })
  const { data: subData } = useQuery({ queryKey: ["my-subscription"], queryFn: () => api.subscription() })
  const { data: latest } = useQuery({ queryKey: ["latest-results"], queryFn: () => api.latestResults(), staleTime: 60_000 })
  const { data: valuation } = useQuery({
    queryKey: ["market-valuation"],
    queryFn: () => fetch("/api/v1/dashboard/valuation").then((r) => (r.ok ? ((r.json() as unknown) as { results: { companyId: string; ticker: string; name: string; sector: string; pe: number | null; discountPct: number | null }[] }) : null)),
    staleTime: 300_000,
  })

  const { data: sectorAggs } = useQuery({
    queryKey: ["sector-aggs"],
    queryFn: () => fetch("/api/v1/sectors").then((r) => (r.ok ? (r.json() as Promise<{ sectors: SectorAgg[] }>) : { sectors: [] })),
    staleTime: 120_000,
  })

  const { data: breadth } = useQuery({
    queryKey: ["market-breadth"],
    queryFn: () => fetch("/api/v1/market/breadth").then((r) => (r.ok ? (r.json() as Promise<BreadthData>) : null)),
    staleTime: 60_000,
    refetchInterval: 300_000,
  })

  const isPremium = !!subData?.isPremium
  const watchItems = useWatchlist((s) => s.items)
  const watchIds = watchItems.map((w) => w.id)

  const { data: watchPrices } = useQuery({
    queryKey: ["watch-prices", watchIds.join(",")],
    queryFn: () => fetch(`/api/v1/market/ticker?fresh=true`).then((r) => (r.ok ? (r.json() as Promise<{ movers?: { ticker: string; price: number; changePct: number }[] }>) : { movers: [] })),
    enabled: watchIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const alertsQuery = useQuery({
    queryKey: ["watch-alerts", watchIds.join(",")],
    queryFn: () => api.eventsFeed(watchIds, 8),
    enabled: watchIds.length > 0 && isPremium,
    refetchInterval: 60_000,
  })

  // Sector cards show the day's equal-weighted price move, not average ROE.
  // The two are different facts; labelling ROE as "performance" made a
  // profitability ratio look like a price return.
  const topSectors = [...(sectorAggs?.sectors ?? [])]
    .filter((s) => s.dayChangePct !== null)
    .sort((a, b) => (b.dayChangePct ?? -Infinity) - (a.dayChangePct ?? -Infinity))
    .slice(0, 4)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[20px] border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8 h-[240px]">
          <Skeleton className="h-full w-full rounded-[20px]" />
        </section>
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4"><Skeleton className="h-[240px] rounded-[20px]" /></div>
          <div className="lg:col-span-4"><Skeleton className="h-[240px] rounded-[20px]" /></div>
          <div className="lg:col-span-4"><Skeleton className="h-[240px] rounded-[20px]" /></div>
        </div>
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4"><Skeleton className="h-[200px] rounded-[20px]" /></div>
          <div className="lg:col-span-4"><Skeleton className="h-[200px] rounded-[20px]" /></div>
          <div className="lg:col-span-4"><Skeleton className="h-[200px] rounded-[20px]" /></div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">{t("common.noData")}</CardTitle>
          <CardDescription>{error instanceof Error ? error.message : String(error)}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
      <div className="space-y-8">
      {/* ===== HERO BANNER ===== */}
      <section
        className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-8 sm:p-10 min-h-[280px] flex items-center"
      >
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-background/60 via-background/40 to-background/80" />
          <div className="absolute inset-0 [background-image:radial-gradient(circle_at_30%_20%,rgba(163,230,53,0.15)_0%,transparent_50%),radial-gradient(circle_at_70%_80%,rgba(163,230,53,0.1)_0%,transparent_50%)]" />
          <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(163,230,53,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(163,230,53,0.08)_1px,transparent_1px)] [background-size:60px_60px] opacity-20" />
        </div>
        <div className="absolute z-0 -top-20 -right-20 w-80 h-80 rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute z-0 -bottom-32 -left-32 w-96 h-96 rounded-full bg-emerald-500/10 blur-[120px]" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8 w-full">
          <div className="flex-1 lg:max-w-[60%]">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                {ar ? "بيانات محدثة مباشرة" : "Live Market Data"}
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-balance text-foreground mb-4 leading-tight">
              {ar ? "مستقبل الاستثمار" : "The Future of"}
              <br />
              <span className="gradient-text">{ar ? "الذكي يبدأ هنا" : "Smart Investing"}</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-[48rem] leading-relaxed mb-8">
              {ar ? "أقوى أدوات تحليل السوق المصري مع بيانات دقيقة ورؤى ذكية لاتخاذ قرارات استثمارية أفضل" : "Powerful Egyptian market analysis tools with accurate data and smart insights for better investment decisions"}
            </p>
            <div className="flex flex-wrap gap-4">
              <Button onClick={() => onViewChange("scanners")} size="lg" className="gap-2 shadow-lg shadow-primary/30">
                <ScanSearch className="h-5 w-5" />
                {t("nav.scanners")}
              </Button>
              <Button variant="outline" size="lg" onClick={() => onViewChange("custom")} className="gap-2">
                <Sparkles className="h-5 w-5" />
                {t("nav.customScanner")}
              </Button>
            </div>
          </div>

          <div className="relative z-10 hidden lg:block lg:w-[38%]">
            <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl p-6 shadow-xl shadow-black/[0.02] dark:shadow-black/[0.3]">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">{ar ? "أداء القطاعات (يوم)" : "Top Sectors (1D)"}</h2>
              </div>
              <div className="grid gap-3">
                {topSectors.length ? (
                  topSectors.map((s, i) => (
                    <div key={s.sector} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{sectorLabel(s.sector, lang)}</p>
                        <p className="text-xs text-muted-foreground">{s.companyCount} {ar ? "شركات" : "companies"}</p>
                      </div>
                      <span className={`text-sm font-bold tabular ${(s.dayChangePct ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
                        {(s.dayChangePct ?? 0) >= 0 ? "+" : ""}{(s.dayChangePct ?? 0).toFixed(1)}%
                      </span>
                    </div>
                  ))
                ) : sectorAggs ? (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    {ar ? "لا توجد أسعار قطاعية متاحة" : "No sector price data available"}
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    {ar ? "جاري التحميل..." : "Loading..."}
                  </div>
                )}
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground">
                {ar ? "تغير السعر المرجّح بالتساوي · متأخر 15 دقيقة" : "Equal-weighted price change · 15-min delayed"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== ANALYTICS ROW ===== */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Panel A — Sector Performance (Real Data) */}
        <SectorPerformancePanel
          sectorAggs={sectorAggs?.sectors ?? []}
          onOpenCompany={onOpenCompany}
          isPremium={isPremium}
          ar={ar}
          lang={lang}
          onViewChange={onViewChange}
        />

        {/* Panel B — Market Summary (Real Data) */}
        <MarketSummaryPanel breadth={breadth} ar={ar} />

        {/* Panel C — EGX30 Chart (No Synthetic Data) */}
        <Egx30ChartPanel isPremium={isPremium} ar={ar} onViewChange={onViewChange} router={router} />
      </div>

      {/* ===== SECONDARY ROW ===== */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Panel D — Important Events */}
        <EventsPanel data={data} isPremium={isPremium} ar={ar} onOpenCompany={onOpenCompany} />

        {/* Panel E — Watchlist (Real Price Changes) */}
        <WatchlistPanel
          watchItems={watchItems}
          watchPrices={watchPrices?.movers ?? []}
          onOpenCompany={onOpenCompany}
          ar={ar}
          router={router}
        />

        {/* Panel F — Opportunities Under Radar (Real Valuation Data) */}
        <OpportunitiesPanel
          valuation={valuation}
          isPremium={isPremium}
          ar={ar}
          onOpenCompany={onOpenCompany}
          router={router}
          onViewChange={onViewChange}
        />
      </div>

      {/* ===== BOTTOM STRIP ===== */}
      <section className="rounded-[20px] border border-border/60 bg-card p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex w-full flex-1 items-center gap-3 sm:flex-nowrap">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
              <Activity className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <input
                type="search"
                placeholder={ar ? "اسأل عن السوق…" : "Ask about the market…"}
                className="w-full px-3 py-1.5 text-sm rounded-xl border border-input bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
              <Button size="sm" className="ml-2 h-9 px-3 text-xs font-semibold">
                {ar ? "إرسال" : "Send"}
              </Button>
            </div>
          </div>
          <div className="flex w-full flex-1 justify-end sm:justify-start gap-2 sm:ml-auto">
            {[
              { label: ar ? "الشركات" : "Companies", href: "/rankings", icon: <Building2 className="h-4 w-4" /> },
              { label: ar ? "القطاعات" : "Sectors", href: "/sectors", icon: <ScanSearch className="h-4 w-4" /> },
              { label: ar ? "ماسح مخصص" : "Custom Scanner", href: "/dashboard#/custom", icon: <Scale className="h-4 w-4" /> },
              { label: ar ? "مقارنة" : "Compare", href: "/compare", icon: <Sparkles className="h-4 w-4" /> },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  if (item.href.startsWith("/dashboard#")) {
                    e.preventDefault()
                    router.push(item.href)
                  }
                }}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ===== Index Card ===== */
function IndexCard({ label, change, value }: { label: string; change: string; value: string }) {
  const positive = !change.startsWith("-")
  return (
    <div className="rounded-xl border border-border/50 bg-card/80 px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-xs font-bold tabular text-foreground">{value}</span>
        </div>
        <span className={`text-xs font-bold tabular ${positive ? "text-positive" : "text-negative"}`}>
          {change}
        </span>
      </div>
    </div>
  )
}

/* ===== Panel A — Sector Performance (Real Data) ===== */
function SectorPerformancePanel({
  sectorAggs,
  onOpenCompany,
  isPremium,
  ar,
  lang,
  onViewChange,
}: {
  sectorAggs: SectorAgg[]
  onOpenCompany: (id: string) => void
  isPremium: boolean
  ar: boolean
  lang: "en" | "ar"
  onViewChange?: (v: ViewKey) => void
}) {
  const router = useRouter()

  const rowsWithData = sectorAggs
    .filter((s) => s.dayChangePct !== null)
    .sort((a, b) => (b.dayChangePct ?? -Infinity) - (a.dayChangePct ?? -Infinity))

  return (
    <div className="lg:col-span-4">
      <Card className="border-border/60 p-0">
        <CardHeader className="pb-3 px-5">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-primary" />
              {ar ? "أداء القطاعات (يوم)" : "Sector Performance (1D)"}
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => router.push("/sectors")}>
              {ar ? "عرض الكل" : "Show all"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-1.5 p-4">
            {rowsWithData.length > 0 ? (
              rowsWithData.slice(0, 5).map((row, i) => {
                const change = row.dayChangePct
                const positive = change !== null && change >= 0
                const widthPct = change !== null ? Math.min(Math.abs(change) * 10, 100) : 0
                return (
                  <div
                    key={row.sector}
                    onClick={() => router.push("/sectors/" + encodeURIComponent(row.sector))}
                    className="group flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-start transition-all duration-200 hover:bg-primary/5 hover:border-primary/30 border border-transparent cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium truncate">{sectorLabel(row.sector, lang)}</span>
                    </div>
                    <div className="flex-1 h-[8px] mx-3 overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: widthPct + "%",
                          background: positive
                            ? "linear-gradient(90deg, var(--positive) 0%, #22c55e 100%)"
                            : "linear-gradient(90deg, var(--negative) 0%, #ef4444 100%)",
                        }}
                      />
                    </div>
                    <span className={`text-sm font-bold tabular shrink-0 flex items-center gap-1 ${positive ? "text-positive" : change !== null ? "text-negative" : "text-muted-foreground"}`}>
                      {change !== null ? (
                        <>
                          {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                        </>
                      ) : "—"}
                    </span>
                  </div>
                )
              })
            ) : (
              <div className="text-center text-xs text-muted-foreground py-4">
                {ar ? "لا توجد أسعار قطاعية متاحة بعد" : "No sector price data available yet"}
              </div>
            )}
          </div>
          <p className="px-4 pb-3 text-[10px] text-muted-foreground">
            {ar ? "تغير السعر المرجّح بالتساوي · متأخر 15 دقيقة" : "Equal-weighted price change · 15-min delayed"}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* ===== Panel B — Market Summary (Real Data) ===== */
function MarketSummaryPanel({ breadth, ar }: { breadth: BreadthData | null | undefined; ar: boolean }) {
  const advancing = breadth?.advancing ?? 0
  const declining = breadth?.declining ?? 0
  const unchanged = breadth?.unchanged ?? 0
  const tradedValue = breadth?.tradedValue
  const asOf = breadth?.asOf

  const cells = [
    { label: ar ? "منخفضة" : "Declining", value: String(declining), color: "text-negative", dot: "bg-negative" },
    { label: ar ? "مستقرة" : "Unchanged", value: String(unchanged), color: "text-muted-foreground", dot: "bg-muted-foreground" },
    { label: ar ? "صاعدة" : "Advancing", value: String(advancing), color: "text-positive", dot: "bg-positive" },
    {
      label: ar ? "قيمة التداول" : "Traded Value",
      value: tradedValue !== null && tradedValue !== undefined ? formatEgp(tradedValue) : (ar ? "غير متاح" : "N/A"),
      color: "text-gold",
      dot: "bg-gold/20 text-gold",
    },
  ]

  return (
    <div className="lg:col-span-4">
      <Card className="border-border/60 p-0">
        <CardHeader className="pb-3 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileCheck2 className="h-3.5 w-3.5 text-primary" />
            {ar ? "ملخص السوق" : "Market Summary"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 gap-2 p-4">
            {cells.map((cell, i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-card/80 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-medium uppercase tracking-wide ${cell.color}`}>{cell.label}</span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${cell.dot}`} />
                </div>
                <span className="text-xl font-bold tabular text-foreground">{cell.value}</span>
              </div>
            ))}
          </div>
          {asOf && (
            <div className="px-4 pb-1 text-[10px] text-muted-foreground text-right">
              {ar ? "آخر تحديث: " : "Updated: "}{new Date(asOf).toLocaleString(ar ? "ar-EG" : "en-GB")}
            </div>
          )}
          <div className="px-4 pb-3 text-[10px] text-muted-foreground">
            {ar ? "اتساع السوق حسب تغير السعر · متأخر 15 دقيقة" : "Price breadth · 15-min delayed"}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ===== Panel C — EGX30 (latest level only; no synthetic history) ===== */
function Egx30ChartPanel({
  ar,
  router,
}: {
  isPremium: boolean
  ar: boolean
  onViewChange: (v: ViewKey) => void
  router: ReturnType<typeof useRouter>
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["market-ticker"],
    queryFn: () =>
      fetch("/api/v1/market/ticker?fresh=true").then((r) =>
        r.ok
          ? (r.json() as Promise<{
              indices: { name: string; level: number; changePct: number }[]
              pricesAsOf?: string | null
              delayMinutes?: number | null
            }>)
          : null,
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const egx30 = data?.indices?.find((i) => i.name === "EGX30")
  const others = (data?.indices ?? []).filter((i) => i.name !== "EGX30").slice(0, 3)
  const positive = (egx30?.changePct ?? 0) >= 0
  const fmt = (value: number) =>
    value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="lg:col-span-4">
      <Card className="border-border/60 p-0">
        <CardHeader className="pb-3 px-5">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-primary" />
              {ar ? "مؤشر EGX30" : "EGX30 Index"}
            </CardTitle>
            <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {ar ? "متأخر 15 دقيقة" : "15m delayed"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-4 p-4">
            {isLoading ? (
              <div className="flex h-[120px] items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  <span className="text-xs">{ar ? "جاري تحميل البيانات..." : "Loading market data..."}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-3xl font-extrabold tabular text-foreground">
                    {egx30 ? fmt(egx30.level) : "—"}
                  </span>
                  <span className={`text-sm font-bold tabular ${positive ? "text-positive" : "text-negative"}`}>
                    {egx30 ? `${positive ? "+" : ""}${egx30.changePct.toFixed(2)}%` : "—"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {others.map((index) => {
                    const up = index.changePct >= 0
                    return (
                      <div key={index.name} className="rounded-lg border border-border/50 bg-card/80 p-2">
                        <p className="truncate text-[10px] font-medium text-muted-foreground">{index.name}</p>
                        <p className="text-xs font-bold tabular text-foreground">{fmt(index.level)}</p>
                        <p className={`text-[10px] font-semibold tabular ${up ? "text-positive" : "text-negative"}`}>
                          {up ? "+" : ""}{index.changePct.toFixed(2)}%
                        </p>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {ar
                ? "المستوى الحالي من مصدر عام متأخر 15 دقيقة. الرسم البياني التاريخي للمؤشر يتطلب تغذية بيانات مرخصة."
                : "Latest level from a 15-minute-delayed public source. Historical index charts require a licensed data feed."}
            </p>
            {data?.pricesAsOf ? (
              <p className="text-[10px] text-muted-foreground">
                {ar ? "آخر تحديث: " : "Updated: "}
                {new Date(data.pricesAsOf).toLocaleString(ar ? "ar-EG" : "en-GB")}
              </p>
            ) : null}

            <Button variant="outline" size="sm" className="w-full" onClick={() => router.push("/sectors")}>
              {ar ? "استعرض أداء القطاعات" : "Explore sector performance"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ===== Panel D — Important Events ===== */
function EventsPanel({
  data,
  isPremium,
  ar,
  onOpenCompany,
}: {
  data: DashboardData
  isPremium: boolean
  ar: boolean
  onOpenCompany: (id: string) => void
}) {
  const { pick } = useI18n()
  return (
    <div className="lg:col-span-4">
      <Card className="border-border/60 p-0">
        <CardHeader className="pb-3 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            {ar ? "أحداث هامة" : "Important Events"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isPremium ? (
            <div className="p-4 space-y-2">
              {data.recentEvents.slice(0, 5).map((e) => {
                const meta = EVENT_TYPE_MAP[e.eventType]
                const tone = meta?.tone ?? "neutral"
                return (
                  <button
                    key={e.id}
                    onClick={() => onOpenCompany(e.company.id)}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-start transition-colors hover:bg-accent/30"
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded ${tone === "positive" ? "bg-positive/10 text-positive" : tone === "negative" ? "bg-negative/10 text-negative" : "bg-muted/30 text-muted-foreground"}`}>
                      <BellRing className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground leading-tight">
                        {pick(e.explanationEn, e.explanationAr)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{e.periodLabel}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-xs text-muted-foreground">
              <Lock className="h-5 w-5 text-warning-foreground" aria-hidden />
              <p>{ar ? "الأحداث متاحة لمشتركي بريميوم فقط" : "Events available for Premium subscribers only"}</p>
              <Button size="sm" variant="link" className="h-auto gap-1 text-xs" onClick={() => {}}>
                {ar ? "ترقية" : "Upgrade"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ===== Panel E — Watchlist (Real Price Changes) ===== */
function WatchlistPanel({
  watchItems,
  watchPrices,
  onOpenCompany,
  ar,
  router,
}: {
  watchItems: { id: string; ticker: string }[]
  watchPrices: { ticker: string; price: number; changePct: number }[]
  onOpenCompany: (id: string) => void
  ar: boolean
  router: any
}) {
  const priceMap = new Map(watchPrices.map((p) => [p.ticker, p]))

  return (
    <div className="lg:col-span-4">
      <Card className="border-border/60 p-0">
        <CardHeader className="pb-3 px-5 flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-gold" />
            {ar ? "قائمة المتابعة" : "Watchlist"}
          </CardTitle>
          {watchItems.length > 0 ? (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => router.push("/watchlist")}>
              {ar ? "الكل" : "All"}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {watchItems.length > 0 ? (
            <div className="space-y-1 p-3">
              {watchItems.slice(0, 5).map((w) => {
                const priceInfo = priceMap.get(w.ticker)
                const change = priceInfo?.changePct ?? 0
                const positive = change >= 0
                return (
                  <button
                    key={w.id}
                    onClick={() => onOpenCompany(w.id)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-start transition-colors hover:bg-accent/30"
                  >
                    <span className="text-sm font-bold">{w.ticker}</span>
                    <span className={`text-xs font-bold tabular ${positive ? "text-positive" : "text-negative"}`}>
                      {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-xs text-muted-foreground">
              <Star className="h-5 w-5 text-muted-foreground/60" aria-hidden />
              <p>{ar ? "لم تضف أي شركة إلى قائمة المتابعة بعد" : "No companies in your watchlist yet"}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ===== Panel F — Opportunities Under Radar (Real Valuation Data) ===== */
function OpportunitiesPanel({
  valuation,
  isPremium,
  ar,
  onOpenCompany,
  router,
  onViewChange,
}: {
  valuation: { results: Array<{ companyId: string; ticker: string; name: string; sector: string; pe: number | null; discountPct: number | null }> } | null | undefined
  isPremium: boolean
  ar: boolean
  onOpenCompany: (id: string) => void
  router: any
  onViewChange: (v: ViewKey) => void
}) {
  const results = valuation?.results ?? []

  return (
    <div className="lg:col-span-4">
      <Card className="border-border/60 p-0">
        <CardContent className="p-0">
          <div className="relative overflow-hidden rounded-[20px] border border-primary/30 bg-gradient-to-br from-primary/10 via-surface to-transparent p-5 sm:p-6 h-[200px] flex flex-col">
            <div className="absolute top-0 right-0 z-0 w-32 h-32 rounded-full bg-primary/20 blur-[60px] -mt-8 -mr-8" />
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{ar ? "فرص تحت الرادار" : "Opportunities Under Radar"}</h3>
              </div>
              {results.length > 0 ? (
                <>
                  <p className="text-xs text-text-secondary leading-relaxed mb-3 flex-1">
                    {ar ? "شركات تفي بمعايير التقييم — اضغط للتفاصيل" : "Companies meeting valuation criteria — tap for details"}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {results.slice(0, 3).map((r) => (
                      <button
                        key={r.companyId}
                        onClick={() => onOpenCompany(r.companyId)}
                        className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2 py-1 text-xs transition-colors hover:bg-accent/30"
                      >
                        <span className="font-bold">{r.ticker}</span>
                        {r.discountPct !== null && (
                          <span className="text-positive">{r.discountPct >= 0 ? "+" : ""}{r.discountPct.toFixed(1)}%</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={() => onViewChange("scanners")}
                    className="mt-auto w-fit px-4 py-2 text-xs font-bold shadow-sm shadow-primary/20"
                  >
                    {ar ? "استكشف الآن" : "Explore Now"}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-text-secondary leading-relaxed mb-4 flex-1">
                    {ar ? "اكتشف شركات واعدة من خلال أدوات التحليل المتقدمة والماسحات المخصصة." : "Discover promising companies through advanced analysis tools and custom scanners."}
                  </p>
                  <Button
                    onClick={() => onViewChange("scanners")}
                    className="mt-auto w-fit px-4 py-2 text-xs font-bold shadow-sm shadow-primary/20"
                  >
                    {ar ? "استكشف الآن" : "Explore Now"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}