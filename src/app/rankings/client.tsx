"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Crown, Lock, Trophy, Medal, Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSubscriptionGate } from "@/lib/client/subscription-gate"
import { useI18n } from "@/lib/i18n"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { SECTOR_AR } from "@/lib/sectors"

// /rankings — sector & market leaderboards over verified calculated metrics.
// Free tier: top 10 · Premium: full table + all sectors.

interface RankRow {
  companyId: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  value: number
  fiscalYear: number
  periodLabel: string
  periodType: string
  stale: boolean
}

interface RankingsData {
  metric: { code: string; labelEn: string; labelAr: string; unit: string }
  basis: "latest" | "annual" | "ttm"
  year: number | null
  /** fiscal years this metric actually has data for (descending) */
  years: number[]
  results: RankRow[]
  sectors: string[]
  total: number
}

const METRIC_CHIPS = [
  "roe", "roa", "net_margin", "p_e", "p_b",
  "liabilities_to_equity", "market_cap", "revenue", "net_profit",
] as const

function fmtValue(unit: string, v: number): string {
  if (unit === "PERCENT") return `${v.toFixed(1)}%`
  if (unit === "EGP") {
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  }
  if (unit === "EGP_PER_SHARE") return `${v.toFixed(2)}`
  return v.toFixed(2)
}

const TOP_THREE_STYLES = [
  { color: "text-gold", bg: "bg-gold/10", border: "border-gold/30", icon: <Crown className="h-4 w-4 text-gold" /> },
  { color: "text-muted-foreground", bg: "bg-muted/50", border: "border-border/40", icon: <Medal className="h-4 w-4 text-muted-foreground" /> },
  { color: "text-warning-foreground", bg: "bg-warning/10", border: "border-warning/30", icon: <Star className="h-4 w-4 text-warning-foreground" /> },
]

export default function RankingsPage() {
  const { lang, pick } = useI18n()
  const { isPremium } = useSubscriptionGate()
  const router = useRouter()
  const [metric, setMetric] = useState<string>("roe")
  const [sector, setSector] = useState<string | null>(null)
  const [basis, setBasis] = useState<"latest" | "annual" | "ttm">("latest")
  // "all" = auto (each company's own latest) — or a pinned fiscal year that
  // ranks every company on the SAME period.
  const [year, setYear] = useState<string>("all")
  const ar = lang === "ar"

  const { data, isLoading, error } = useQuery({
    queryKey: ["rankings", metric, sector, basis, year],
    queryFn: () =>
      fetch(`/api/v1/rankings?metric=${metric}${sector ? `&sector=${encodeURIComponent(sector)}` : ""}&basis=${basis}${year !== "all" ? `&year=${year}` : ""}`).then((r) => (r.ok ? (r.json() as Promise<RankingsData>) : null)),
    staleTime: 120_000,
  })

  // Switching metric/basis changes the valid year list — drop a pin that the
  // new scope can't satisfy instead of showing a permanently empty table.
  useEffect(() => {
    if (data && year !== "all" && !(data.years ?? []).includes(Number(year))) {
      setYear("all")
    }
  }, [data, year])

  const metricLabels = useMemo(() => {
    const map: Record<string, { en: string; ar: string; unit: string }> = {}
    const FALLBACK: Record<string, [string, string, string]> = {
      roe: ["ROE", "العائد على حقوق الملكية", "PERCENT"],
      roa: ["ROA", "العائد على الأصول", "PERCENT"],
      net_margin: ["Net margin", "هامش صافي الربح", "PERCENT"],
      p_e: ["P/E", "السعر إلى الأرباح", "RATIO"],
      p_b: ["P/B", "السعر إلى الدفترية", "RATIO"],
      dividend_yield: ["Dividend yield", "عائد التوزيعات", "PERCENT"],
      market_cap: ["Market cap", "القيمة السوقية", "EGP"],
      revenue: ["Revenue", "الإيرادات", "EGP"],
      net_profit: ["Net profit", "صافي الربح", "EGP"],
      liabilities_to_equity: ["Liabilities / Equity", "المطلوبات إلى حقوق الملكية", "RATIO"],
    }
    for (const code of METRIC_CHIPS) {
      const f = FALLBACK[code]
      map[code] = { en: f[0], ar: f[1], unit: f[2] }
    }
    if (data?.metric) map[data.metric.code] = { en: data.metric.labelEn, ar: data.metric.labelAr, unit: data.metric.unit }
    return map
  }, [data])

  if (error) {
    return (
      <LayoutShell showMobileNav={true}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm font-medium text-destructive">{ar ? "تعذّر تحميل التصنيفات — تحقق من اتصالك" : "Failed to load rankings — please check your connection"}</p>
              <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : ar ? "حدث خطأ غير متوقع" : "An unexpected error occurred"}</p>
              <Button variant="outline" onClick={() => window.location.reload()} className="mt-2 h-8 text-xs">{ar ? "إعادة التحميل" : "Reload"}</Button>
            </CardContent>
          </Card>
        </div>
      </LayoutShell>
    )
  }

  const visible = isPremium ? data?.results ?? [] : (data?.results ?? []).slice(0, 10)
  const hiddenCount = Math.max(0, (data?.results.length ?? 0) - visible.length)
  const unit = metricLabels[metric]?.unit ?? "RATIO"
  const metricLabel = pick(metricLabels[metric]?.en ?? metric, metricLabels[metric]?.ar ?? metric)

  return (
    <LayoutShell showMobileNav={true}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <Trophy className="h-5 w-5 text-gold" />
            {ar ? "ترتيب الشركات" : "Company Rankings"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {year !== "all" ? (
              ar
                ? `الترتيب على السنة المالية ${year} — نفس الفترة لكل الشركات، مقارنة تاريخية عادلة. الشركات التي لا تملك قوائم منشورة لهذه السنة تُستبعد من الترتيب.`
                : `Ranked on fiscal year ${year} — the same period for every company, a like-for-like historical comparison. Companies without published filings for that year are excluded.`
            ) : basis === "latest"
              ? ar
                ? "الترتيب على أحدث قيمة متاحة لكل شركة على حدة — دون تثبيت فترة موحدة. الفترة مطبوعة في كل صف، والشركات الأقدم من أحدث فترة بالسوق بأكثر من أربعة أرباع تُعلَّم بنجمة."
                : "Ranked on each company's own latest available value — no shared fixed period. Every row shows its period; companies more than four quarters behind the market's freshest period are marked with a star."
              : basis === "annual"
                ? ar
                  ? "الترتيب على أحدث قوائم سنوية متحقق منها لكل شركة."
                  : "Ranked on each company's latest verified annual statements."
                : ar
                  ? "الترتيب على آخر 12 شهراً (TTM) لكل شركة — أساس متماثل للمؤشرات التدفقية مثل ROE والهوامش."
                  : "Ranked on each company's trailing twelve months (TTM) — a like-for-like basis for flow metrics such as ROE and margins."}
          </p>
          {(metric === "roe" || metric === "roa") && basis === "latest" ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {ar
                ? "ملاحظة: ROE/ROA في أساس «أحدث بيانات» تعتمد على آخر فترة كاملة (TTM أو سنوية) — لا تُقارن أرباع غير سنوية بفترات سنوية."
                : "Note: on the Latest basis, ROE/ROA use the latest full period (TTM or annual) — unannualised quarters are not ranked against annual figures."}
            </p>
          ) : null}
        </div>

        {/* Basis + period pin: basis chooses how "latest" is interpreted,
            the dropdown optionally pins ONE fiscal year for everyone — the
            like-for-like historical comparison investors ask for. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-border/60 bg-surface-secondary/50">
            {([
              ["latest", ar ? "أحدث بيانات متاحة" : "Latest available"],
              ["ttm", ar ? "آخر 12 شهراً" : "TTM"],
              ["annual", ar ? "آخر سنة سنوية" : "Latest annual"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setBasis(key)}
                className={`px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                  basis === key ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-8 w-52 text-xs" aria-label={ar ? "الفترة" : "Period"}>
              <SelectValue placeholder={ar ? "الفترة" : "Period"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all" className="text-xs">
                {ar ? "تلقائي — أحدث فترة لكل شركة" : "Auto — each company's latest"}
              </SelectItem>
              {(data?.years ?? []).map((y) => (
                <SelectItem key={y} value={String(y)} className="text-xs">
                  {ar ? `سنة مالية ${y}` : `Fiscal year ${y}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Metric filter chips */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {METRIC_CHIPS.map((code) => (
            <button
              key={code}
              onClick={() => setMetric(code)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                metric === code
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "border border-border/60 bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              {pick(metricLabels[code]?.en ?? code, metricLabels[code]?.ar ?? code)}
            </button>
          ))}
        </div>

        {/* Sector filter — a compact select keeps 20 sectors to one row;
            the chip wall wrapped over three rows and pushed the table off-screen. */}
        <div className="mb-4 flex items-center gap-2">
          <Select value={sector ?? "all"} onValueChange={(v) => setSector(v === "all" ? null : v)}>
            <SelectTrigger className="h-8 w-56 text-xs" aria-label={ar ? "القطاع" : "Sector"}>
              <SelectValue placeholder={ar ? "كل القطاعات" : "All sectors"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all" className="text-xs">{ar ? "كل القطاعات" : "All sectors"}</SelectItem>
              {(data?.sectors ?? []).map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {ar ? SECTOR_AR[s] ?? s : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sector ? (
            <button
              onClick={() => setSector(null)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              {ar ? "مسح الفلتر" : "Clear"}
            </button>
          ) : null}
        </div>

        {/* Rankings table */}
        <Card className="border-border/60 overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-lg" />
                ))}
              </div>
            ) : !data || data.results.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{ar ? "لا بيانات متاحة لهذا المؤشر في هذا النطاق بعد." : "No data for this metric in this scope yet."}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-card/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="p-3 text-start font-medium w-10">#</th>
                      <th className="p-3 text-start font-medium">{ar ? "الشركة" : "Company"}</th>
                      <th className="hidden p-3 text-start font-medium sm:table-cell">{ar ? "القطاع" : "Sector"}</th>
                      <th className="p-3 text-end font-medium">{metricLabel}</th>
                      <th className="hidden p-3 text-end font-medium md:table-cell">{ar ? "الفترة" : "Period"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r, i) => {
                      const isTopThree = i < 3
                      const style = TOP_THREE_STYLES[i]
                      const positive = r.value >= 0
                      return (
                        <tr
                          key={r.companyId}
                          className={`cursor-pointer border-b border-border/40 transition-colors last:border-0 ${isTopThree ? style.border : ""} hover:bg-accent/30`}
                          onClick={() => router.push(`/company/${r.ticker}`)}
                        >
                          <td className={`p-3 ${isTopThree ? "font-bold" : ""}`}>
                            {isTopThree ? style.icon : (
                              <span className={`text-xs font-bold tabular ${positive ? "text-positive" : "text-muted-foreground"}`}>
                                {i + 1}
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${isTopThree ? "text-foreground" : "text-foreground"}`}>{r.ticker}</span>
                              <span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:inline">
                                {pick(r.nameEn, r.nameAr ?? r.nameEn)}
                              </span>
                            </div>
                          </td>
                          <td className="hidden p-3 text-xs text-muted-foreground sm:table-cell">
                            {ar ? SECTOR_AR[r.sector] ?? r.sector : r.sector}
                          </td>
                          <td className={`p-3 text-end font-bold tabular ${isTopThree ? style.color : ""}`}>
                            {fmtValue(unit, r.value)}
                          </td>
                          <td className="hidden p-3 text-end text-[11px] text-muted-foreground md:table-cell">
                            {r.periodLabel}
                            {r.stale ? <span className="ms-1 text-warning-foreground" title={ar ? "أقدم من أحدث فترة بالسوق بأكثر من أربعة أرباع" : "More than four quarters behind the market's freshest period"}>*</span> : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {!isPremium && hiddenCount > 0 ? (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-gold/30 bg-gold/5 p-4">
            <p className="flex items-center gap-2 text-xs text-warning-foreground">
              <Lock className="h-3.5 w-3.5" />
              {ar ? `${hiddenCount} شركة إضافية متاحة لمشتركي Premium` : `${hiddenCount} more companies available with Premium`}
            </p>
            <Button size="sm" onClick={() => router.push("/premium")}>
              <Crown className="h-3.5 w-3.5" />
              {ar ? "ترقية" : "Upgrade"}
            </Button>
          </div>
        ) : null}

        <Badge variant="outline" className="mt-4 border-success/40 text-[10px] text-success-foreground">
          {ar ? "كل القيم من قوائم سنوية متحقق منها — أحدث سنة لكل شركة" : "All values from verified annual filings — each company's latest year"}
        </Badge>
      </div>
    </LayoutShell>
  )
}
