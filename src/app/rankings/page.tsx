"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Crown, Lock, Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useSubscriptionGate } from "@/lib/client/subscription-gate"
import { useI18n } from "@/lib/i18n"
import { AppHeader } from "@/components/egx/app-header"
import { AppFooter } from "@/components/egx/app-footer"

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
}

interface RankingsData {
  metric: { code: string; labelEn: string; labelAr: string; unit: string }
  results: RankRow[]
  sectors: string[]
  total: number
}

const METRIC_CHIPS = [
  "roe", "roa", "net_margin", "revenue_growth", "profit_growth", "p_e", "p_b",
  "liabilities_to_equity", "market_cap", "revenue", "net_profit", "current_ratio",
] as const

const SECTOR_AR: Record<string, string> = {
  Banks: "البنوك", "Financial Services": "الخدمات المالية", Healthcare: "الرعاية الصحية", Food: "الأغذية",
  Consumer: "المستهلك", Industrial: "الصناعة", Telecom: "الاتصالات والتكنولوجيا", "Real Estate": "العقارات",
  Investment: "الاستثمار", Construction: "الإنشاءات", "Basic Materials": "المواد الأساسية", Energy: "الطاقة",
  Utilities: "المرافق", Insurance: "التأمين",
}

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

export default function RankingsPage() {
  const { lang, pick } = useI18n()
  const { isPremium } = useSubscriptionGate()
  const [metric, setMetric] = useState<string>("roe")
  const [sector, setSector] = useState<string | null>(null)
  const [basis, setBasis] = useState<"latest" | "annual">("latest")
  const ar = lang === "ar"

  const { data, isLoading } = useQuery({
    queryKey: ["rankings", metric, sector, basis],
    queryFn: () =>
      fetch(`/api/v1/rankings?metric=${metric}${sector ? `&sector=${encodeURIComponent(sector)}` : ""}&basis=${basis}`).then((r) => (r.ok ? (r.json() as Promise<RankingsData>) : null)),
    staleTime: 120_000,
  })

  // metric chips translated from the shared registry response of the first load
  const metricLabels = useMemo(() => {
    const map: Record<string, { en: string; ar: string; unit: string }> = {}
    // static fallback list keeps chips labelled before/without a response
    const FALLBACK: Record<string, [string, string, string]> = {
      roe: ["ROE", "العائد على حقوق الملكية", "PERCENT"],
      roa: ["ROA", "العائد على الأصول", "PERCENT"],
      net_margin: ["Net margin", "هامش صافي الربح", "PERCENT"],
      revenue_growth: ["Revenue growth", "نمو الإيرادات", "PERCENT"],
      profit_growth: ["Profit growth", "نمو صافي الربح", "PERCENT"],
      p_e: ["P/E", "السعر إلى الأرباح", "RATIO"],
      p_b: ["P/B", "السعر إلى الدفترية", "RATIO"],
      dividend_yield: ["Dividend yield", "عائد التوزيعات", "PERCENT"],
      market_cap: ["Market cap", "القيمة السوقية", "EGP"],
      revenue: ["Revenue", "الإيرادات", "EGP"],
      net_profit: ["Net profit", "صافي الربح", "EGP"],
      current_ratio: ["Current ratio", "نسبة التداول", "RATIO"],
      liabilities_to_equity: ["Liabilities / Equity", "المطلوبات إلى حقوق الملكية", "RATIO"],
    }
    for (const code of METRIC_CHIPS) {
      const f = FALLBACK[code]
      map[code] = { en: f[0], ar: f[1], unit: f[2] }
    }
    if (data?.metric) map[data.metric.code] = { en: data.metric.labelEn, ar: data.metric.labelAr, unit: data.metric.unit }
    return map
  }, [data])

  const visible = isPremium ? data?.results ?? [] : (data?.results ?? []).slice(0, 10)
  const hiddenCount = Math.max(0, (data?.results.length ?? 0) - visible.length)
  const unit = metricLabels[metric]?.unit ?? "RATIO"

  return (
    <div className="min-h-svh bg-background">
      <AppHeader view="companies" companyOpen={false} onViewChange={() => (window.location.href = "/dashboard")} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Trophy className="h-5 w-5 text-amber-500" />
            {ar ? "ترتيب الشركات" : "Company Rankings"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {basis === "latest"
              ? ar
                ? "الترتيب على أحدث فترة معلنة لكل شركة (ربع سنوي / نص سنوي / 9 أشهر) — الفترة ظاهرة في كل صف."
                : "Ranked on each company's latest announced period (quarterly / semiannual / 9M) — every row shows its own period."
              : ar
                ? "الترتيب على أحدث قوائم سنوية متحقق منها لكل شركة."
                : "Ranked on each company's latest annual statements."}
          </p>
        </div>

        {/* basis toggle — latest announced quarter (default) vs latest annual */}
        <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-border/60">
          {([
            ["latest", ar ? "أحدث فترة معلنة" : "Latest announced"],
            ["annual", ar ? "آخر سنة سنوية" : "Latest annual"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setBasis(key)}
              className={`px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${basis === key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted/60"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* metric chips */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {METRIC_CHIPS.map((code) => (
            <button
              key={code}
              onClick={() => setMetric(code)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${metric === code ? "bg-primary text-primary-foreground shadow-sm" : "border border-border/60 bg-card text-muted-foreground hover:bg-muted/60"}`}
            >
              {pick(metricLabels[code]?.en ?? code, metricLabels[code]?.ar ?? code)}
            </button>
          ))}
        </div>

        {/* sector filter */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSector(null)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${!sector ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60"}`}
          >
            {ar ? "كل القطاعات" : "All sectors"}
          </button>
          {(data?.sectors ?? []).map((s) => (
            <button
              key={s}
              onClick={() => setSector(s)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${sector === s ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60"}`}
            >
              {ar ? SECTOR_AR[s] ?? s : s}
            </button>
          ))}
        </div>

        <Card className="border-border/60 p-0">
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
                    <tr className="border-b bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="p-3 text-start font-medium">#</th>
                      <th className="p-3 text-start font-medium">{ar ? "الشركة" : "Company"}</th>
                      <th className="hidden p-3 text-start font-medium sm:table-cell">{ar ? "القطاع" : "Sector"}</th>
                      <th className="p-3 text-end font-medium">{pick(metricLabels[metric]?.en ?? metric, metricLabels[metric]?.ar ?? metric)}</th>
                      <th className="hidden p-3 text-end font-medium md:table-cell">{ar ? "الفترة" : "Period"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r, i) => (
                      <tr
                        key={r.companyId}
                        className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30"
                        onClick={() => (window.location.href = `/company/${r.companyId}`)}
                      >
                        <td className="p-3">
                          {i === 0 ? (
                            <Crown className="h-4 w-4 text-amber-500" />
                          ) : (
                            <span className={`text-xs font-bold tabular ${i < 3 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{i + 1}</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{r.ticker}</span>
                            <span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:inline">{pick(r.nameEn, r.nameAr ?? r.nameEn)}</span>
                          </div>
                        </td>
                        <td className="hidden p-3 text-xs text-muted-foreground sm:table-cell">{ar ? SECTOR_AR[r.sector] ?? r.sector : r.sector}</td>
                        <td className={`p-3 text-end font-bold tabular ${i === 0 ? "text-primary" : ""}`}>{fmtValue(unit, r.value)}</td>
                        <td className="hidden p-3 text-end text-[11px] text-muted-foreground md:table-cell">{r.periodLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {!isPremium && hiddenCount > 0 ? (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              <Lock className="h-3.5 w-3.5" />
              {ar ? `${hiddenCount} شركة إضافية متاحة لمشتركي Premium` : `${hiddenCount} more companies available with Premium`}
            </p>
            <Button size="sm" onClick={() => (window.location.href = "/premium")}>
              <Crown className="h-3.5 w-3.5" />
              {ar ? "ترقية" : "Upgrade"}
            </Button>
          </div>
        ) : null}

        <Badge variant="outline" className="mt-4 border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-400">
          {ar ? "كل القيم من قوائم سنوية متحقق منها — أحدث سنة لكل شركة" : "All values from verified annual filings — each company's latest year"}
        </Badge>
      </main>
      <AppFooter />
    </div>
  )
}
