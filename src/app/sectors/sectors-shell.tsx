"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Building2, TrendingUp, TrendingDown, Activity } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { useI18n } from "@/lib/i18n"
import { SECTOR_AR, sectorLabel } from "@/lib/sectors"

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
}

interface SectorsPageShellProps {
  sectors: string[]
  counts: Map<string, number>
}

export function SectorsPageShell({ sectors, counts }: SectorsPageShellProps) {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const router = useRouter()
  // "all" = each sector on its own latest data — or ONE pinned fiscal year
  // for every sector (like-for-like historical comparison). The pin is synced
  // with the ?year= URL param (same behavior as /compare) so a pinned view is
  // shareable/bookmarkable.
  const [year, setYear] = useState<string>(() => {
    if (typeof window === "undefined") return "all"
    const y = new URLSearchParams(window.location.search).get("year")
    return y && /^\d{4}$/.test(y) ? y : "all"
  })

  const pickYear = useCallback((next: string) => {
    setYear(next)
    const u = new URL(window.location.href)
    if (next !== "all") u.searchParams.set("year", next)
    else u.searchParams.delete("year")
    window.history.replaceState(null, "", u.toString())
  }, [])

  const { data: sectorAggs } = useQuery({
    queryKey: ["sector-aggs", year],
    queryFn: () =>
      fetch(`/api/v1/sectors${year !== "all" ? `?year=${year}` : ""}`).then((r) =>
        r.ok ? (r.json() as Promise<{ sectors: SectorAgg[]; year?: number | null; years?: number[] }>) : { sectors: [] },
      ),
    staleTime: 120_000,
  })

  // A pin the current basis can't satisfy resets to auto instead of showing
  // a table of dashes forever.
  useEffect(() => {
    const years = (sectorAggs as { years?: number[] } | undefined)?.years
    if (years && year !== "all" && !years.includes(Number(year))) pickYear("all")
  }, [sectorAggs, year, pickYear])

  const aggMap = new Map((sectorAggs?.sectors ?? []).map((s) => [s.sector, s]))

  const sectorData = sectors.map((s) => {
    const count = counts.get(s) ?? 0
    const agg = aggMap.get(s)
    // Median, not mean: one company with near-zero equity (ROE > 1000%) must
    // not set the sector's headline number. The API ships both; the card uses
    // the robust one.
    const roe = agg?.medianRoe ?? null
    return {
      sector: s,
      label: sectorLabel(s, lang),
      count,
      change: roe !== null ? parseFloat(roe.toFixed(1)) : 0,
      hasRealData: roe !== null,
      medianPe: agg?.medianPe,
      medianPb: agg?.medianPb,
      totalMarketCap: agg?.totalMarketCap,
      totalRevenue: agg?.totalRevenue,
      totalNetProfit: agg?.totalNetProfit,
    }
  })

  const totalCount = sectorData.reduce((sum, s) => sum + s.count, 0)
  const maxCount = Math.max(...sectorData.map((s) => s.count), 1)

  const rowsWithRealData = sectorData.filter((s) => s.hasRealData)

  return (
    <LayoutShell showMobileNav={true}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:underline">
            {ar ? "الرئيسية" : "Home"}
          </Link>
          <span className="mx-1.5">/</span>
          <span>{ar ? "القطاعات" : "Sectors"}</span>
        </nav>

        <header className="mb-6 max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
            {ar ? "قطاعات البورصة المصرية" : "EGX Sectors"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            {year !== "all"
              ? ar
                ? `مؤشرات القطاعات محسوبة على السنة المالية ${year} — نفس الفترة لكل القطاعات، مقارنة تاريخية عادلة. القطاعات بدون قوائم منشورة لهذه السنة تظهر بدون بيانات.`
                : `Sector metrics computed on fiscal year ${year} — the same period for every sector, a like-for-like historical comparison. Sectors without filings for that year show no data.`
              : ar
                ? "استعرض قطاعات البورصة المصرية مع مؤشرات مالية حقيقية من القوائم المتحققة. كل قطاع يمثل مجموعة من الشركات المدرجة، مع وسيط العائد على حقوق الملكية (ROE) والقيمة السوقية الإجمالية."
                : "Browse EGX sectors with real financial metrics from verified filings. Each sector represents listed companies, with median ROE and total market cap."}
          </p>
          <div className="mt-3">
            <Select value={year} onValueChange={pickYear}>
              <SelectTrigger className="h-8 w-56 text-xs" aria-label={ar ? "الفترة" : "Period"}>
                <SelectValue placeholder={ar ? "الفترة" : "Period"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all" className="text-xs">
                  {ar ? "تلقائي — أحدث فترة لكل قطاع" : "Auto — each sector's latest"}
                </SelectItem>
                {((sectorAggs as { years?: number[] } | undefined)?.years ?? []).map((y) => (
                  <SelectItem key={y} value={String(y)} className="text-xs">
                    {ar ? `سنة مالية ${y}` : `Fiscal year ${y}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {/* Sector Heatmap / Treemap */}
        <section aria-label={ar ? "خريطة القطاعات" : "Sector map"} className="mb-8">
          <Card className="border-border/60 overflow-hidden">
            <CardHeader className="pb-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Activity className="h-3.5 w-3.5 text-primary" />
                {ar ? "خريطة القطاعات حسب الحجم ووسيط ROE" : "Sector map by size and median ROE"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-5">
                {/* Legend */}
                <div className="flex flex-wrap items-center gap-4 mb-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-positive" />
                    <span className="text-muted-foreground">{ar ? "ROE إيجابي" : "Positive ROE"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-negative" />
                    <span className="text-muted-foreground">{ar ? "ROE سلبي" : "Negative ROE"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 ms-auto">
                    <span className="w-3 h-3 rounded bg-muted/30" />
                    <span className="text-muted-foreground">{ar ? "لا توجد بيانات" : "No data"}</span>
                  </div>
                </div>

                {/* Treemap grid */}
                <div className="grid gap-2 lg:grid-cols-4">
                  {sectorData.map((s) => {
                    const cellSize = Math.max(60, (s.count / maxCount) * 200)
                    const positive = s.change >= 0
                    const intensity = s.hasRealData ? Math.min(Math.abs(s.change) / 30, 1) : 0
                    const bgColor = s.hasRealData
                      ? positive
                        ? `color-mix(in oklab, var(--spec-positive) ${Math.round(intensity * 30)}%, transparent)`
                        : `color-mix(in oklab, var(--spec-negative) ${Math.round(intensity * 30)}%, transparent)`
                      : "transparent"
                    return (
                        <Link
                          key={s.sector}
                          href={`/sectors/${encodeURIComponent(s.sector)}`}
                          className="group block cursor-pointer"
                        >
                          <div
                            className="rounded-xl border p-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
                            style={{
                              backgroundColor: s.hasRealData
                                ? positive
                                  ? `linear-gradient(135deg, color-mix(in oklab, var(--positive) ${Math.round(intensity * 20 + 10)}%, transparent) 0%, transparent 100%)`
                                  : `linear-gradient(135deg, color-mix(in oklab, var(--negative) ${Math.round(intensity * 20 + 10)}%, transparent) 0%, transparent 100%)`
                                : "var(--surface)",
                              borderColor: s.hasRealData
                                ? positive
                                  ? `color-mix(in oklab, var(--positive) ${Math.round(intensity * 40 + 30)}%, var(--border))`
                                  : `color-mix(in oklab, var(--negative) ${Math.round(intensity * 40 + 30)}%, var(--border))`
                                : "var(--border)",
                              minHeight: `${cellSize}px`,
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-foreground">{s.label}</span>
                              <span className={`text-xs font-bold tabular flex items-center gap-1 ${s.hasRealData ? (positive ? "text-positive" : "text-negative") : "text-muted-foreground"}`}>
                                {s.hasRealData ? (
                                  <>
                                    {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                    {s.change > 0 ? "+" : ""}{s.change.toFixed(1)}%
                                  </>
                                ) : "—"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground">{s.count} {ar ? "شركة" : "companies"}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 rtl-flip transition-all" />
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Sector breadth and performance summary */}
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="border-border/60 overflow-hidden">
              <CardHeader className="pb-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  {ar ? "نظرة على القطاعات" : "Sector overview"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="p-3 text-start font-medium">{ar ? "القطاع" : "Sector"}</th>
                        <th className="p-3 text-end font-medium">{ar ? "الشركات" : "Companies"}</th>
                        <th className="p-3 text-end font-medium">{ar ? "وسيط ROE" : "Median ROE"}</th>
                        <th className="p-3 text-end font-medium">{ar ? "القيمة السوقية" : "Market Cap"}</th>
                        <th className="p-3 text-end font-medium">{ar ? "إجمالي الإيرادات" : "Total Revenue"}</th>
                        <th className="p-3 text-end font-medium">{ar ? "إجمالي صافي الربح" : "Total Net Profit"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {sectorData.map((s) => {
                        const positive = s.change >= 0
                        const agg = aggMap.get(s.sector)
                        return (
                          <tr
                            key={s.sector}
                            onClick={() => router.push(`/sectors/${encodeURIComponent(s.sector)}`)}
                            className="hover:bg-accent/30 transition-colors cursor-pointer"
                          >
                            <td className="p-3">
                              <span className="text-sm font-medium text-foreground">{s.label}</span>
                            </td>
                            <td className="p-3 text-end tabular text-muted-foreground">{s.count}</td>
                            <td className="p-3 text-end tabular">
                              <span className={`text-xs font-bold ${s.hasRealData ? (positive ? "text-positive" : "text-negative") : "text-muted-foreground"}`}>
                                {s.hasRealData ? (s.change > 0 ? "+" : "") + s.change.toFixed(1) + "%" : "—"}
                              </span>
                            </td>
                            <td className="p-3 text-end tabular text-sm">
                              {s.totalMarketCap ? formatEgp(s.totalMarketCap) : "—"}
                            </td>
                            <td className="p-3 text-end tabular text-sm">
                              {s.totalRevenue ? formatEgp(s.totalRevenue) : "—"}
                            </td>
                            <td className="p-3 text-end tabular text-sm">
                              {s.totalNetProfit ? formatEgp(s.totalNetProfit) : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="border-border/60 overflow-hidden">
              <CardHeader className="pb-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-positive" />
                  {ar ? "أعلى وسيط ROE قطاعي" : "Top sector median ROE"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {rowsWithRealData
                  .slice()
                  .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
                  .slice(0, 3)
                  .map((s, i) => (
                    <div key={s.sector} className="flex items-center justify-between gap-3 mb-3 last:mb-0">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-foreground truncate">{s.label}</span>
                      </div>
                      <span className={`text-xs font-bold tabular ${s.change >= 0 ? "text-positive" : "text-negative"}`}>
                        {s.change > 0 ? "+" : ""}{s.change.toFixed(1)}%
                      </span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Sector assignment note */}
        <section className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          <h2 className="mb-2 text-base font-semibold text-foreground">
            {ar ? "كيف تُنسب القطاعات" : "How sectors are assigned"}
          </h2>
          <p>
            {ar
              ? "تتبع العضوية القطاعية المؤشرات القطاعية المنشورة للبورصة المصرية، وليس تقديراً بناءً على اسم الشركة. الشركات المنتمية خارج كل مؤشر منشور تُجمّع تحت «أخرى» بدلاً من إجبارها في قطاع غير ذي صلة."
              : "Sector membership follows the published EGX sector indices, not a heuristic on the company name. Companies outside every published index are grouped under “Other” rather than being forced into an unrelated sector."}
          </p>
        </section>
      </div>
    </LayoutShell>
  )
}

function formatEgp(value: number): string {
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return value.toFixed(0)
}