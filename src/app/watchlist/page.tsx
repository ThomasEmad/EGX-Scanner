"use client"

// /watchlist — the starred companies with a verified-data snapshot each:
// latest recorded price + 1Y change, latest annual revenue/profit/margins.
// The list itself is a client preference (zustand, device-local).

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Star, Trash2, TrendingDown, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AppHeader } from "@/components/egx/app-header"
import { AppFooter } from "@/components/egx/app-footer"
import { useWatchlist } from "@/lib/client/watchlist"
import { useI18n } from "@/lib/i18n"

interface WatchCompany {
  id: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  price: number | null
  priceAsOf: string | null
  change1y: number | null
  fiscalYear: number | null
  periodLabel: string | null
  metrics: Record<string, number>
}

interface WatchData {
  companies: WatchCompany[]
  metricDefs: { code: string; labelEn: string; labelAr: string; unit: string }[]
}

const SECTOR_AR: Record<string, string> = {
  Banks: "البنوك", "Financial Services": "الخدمات المالية", Healthcare: "الرعاية الصحية", Food: "الأغذية",
  Consumer: "المستهلك", Industrial: "الصناعة", Telecom: "الاتصالات والتكنولوجيا", "Real Estate": "العقارات",
  Investment: "الاستثمار", Construction: "الإنشاءات", "Basic Materials": "المواد الأساسية", Energy: "الطاقة",
  Utilities: "المرافق", Insurance: "التأمين",
}

function fmt(unit: string, v: number | undefined | null): string {
  if (v === undefined || v === null) return "—"
  if (unit === "PERCENT") return `${v.toFixed(1)}%`
  if (unit === "EGP") {
    const abs = Math.abs(v)
    if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`
    return v.toFixed(0)
  }
  return v.toFixed(2)
}

export default function WatchlistPage() {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const items = useWatchlist((s) => s.items)
  const toggle = useWatchlist((s) => s.toggle)
  const ids = useMemo(() => items.map((i) => i.id), [items])
  const idKey = ids.join(",")

  const { data, isLoading } = useQuery({
    queryKey: ["watchlist-summaries", idKey],
    queryFn: () => fetch(`/api/v1/watchlist?ids=${idKey}`).then((r) => (r.ok ? (r.json() as Promise<WatchData>) : null)),
    enabled: ids.length > 0,
    staleTime: 120_000,
  })

  const defs = data?.metricDefs ?? []
  const get = (c: WatchCompany, code: string) => fmt(defs.find((d) => d.code === code)?.unit ?? "RATIO", c.metrics[code])

  return (
    <div className="min-h-svh bg-background">
      <AppHeader view="companies" companyOpen={false} onViewChange={() => (window.location.href = "/dashboard")} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            {ar ? "قائمة المتابعة" : "Watchlist"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ar
              ? "الشركات اللي متابعهها بملخص سريع من أحدث بيانات متحقق منها — القائمة محفوظة على جهازك."
              : "Your starred companies with a quick data snapshot — saved on this device."}
          </p>
        </div>

        {ids.length === 0 ? (
          <Card className="border-border/60">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Star className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">{ar ? "مفيش شركات في القائمة — دوس النجمة على أي شركة لتتابعها هنا" : "No companies yet — tap the star on any company to follow it here"}</p>
              <Button size="sm" variant="outline" onClick={() => (window.location.href = "/dashboard")}>
                {ar ? "استكشف الشركات" : "Explore companies"}
              </Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-2">
            {ids.slice(0, 6).map((id) => (
              <Skeleton key={id} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <Card className="border-border/60 p-0">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="p-3 text-start font-medium">{ar ? "الشركة" : "Company"}</th>
                      <th className="p-3 text-end font-medium">{ar ? "آخر سعر" : "Last price"}</th>
                      <th className="p-3 text-end font-medium">{ar ? "سنة" : "1Y"}</th>
                      <th className="p-3 text-end font-medium">{ar ? "الإيرادات" : "Revenue"}</th>
                      <th className="p-3 text-end font-medium">{ar ? "صافي الربح" : "Net profit"}</th>
                      <th className="p-3 text-end font-medium">{ar ? "الهامش" : "Margin"}</th>
                      <th className="p-3 text-end font-medium">ROE</th>
                      <th className="hidden p-3 text-end font-medium md:table-cell">P/E</th>
                      <th className="hidden p-3 text-end font-medium md:table-cell">{ar ? "التوزيعات" : "Div yield"}</th>
                      <th className="p-3 text-end font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.companies ?? []).map((c) => {
                      const up = (c.change1y ?? 0) >= 0
                      return (
                        <tr key={c.id} className="border-b border-border/40 last:border-0">
                          <td className="p-3">
                            <a href={`/company/${c.id}`} className="group flex items-center gap-2">
                              <span className="font-bold group-hover:text-primary">{c.ticker}</span>
                              <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:inline">{ar ? c.nameAr ?? c.nameEn : c.nameEn}</span>
                              <Badge variant="outline" className="hidden text-[9px] lg:inline-flex">{ar ? SECTOR_AR[c.sector] ?? c.sector : c.sector}</Badge>
                            </a>
                          </td>
                          <td className="p-3 text-end tabular">
                            {c.price !== null ? (
                              <>
                                {c.price.toFixed(2)}
                                {c.priceAsOf ? <span className="ms-1 text-[10px] text-muted-foreground">{c.priceAsOf.slice(0, 10)}</span> : null}
                              </>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className={`p-3 text-end font-semibold tabular ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {c.change1y !== null ? (
                              <span className="inline-flex items-center gap-1">
                                {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {up ? "+" : ""}{c.change1y.toFixed(0)}%
                              </span>
                            ) : "—"}
                          </td>
                          <td className="p-3 text-end tabular">{get(c, "revenue")}</td>
                          <td className="p-3 text-end tabular">{get(c, "net_profit")}</td>
                          <td className="p-3 text-end tabular">{get(c, "net_margin")}</td>
                          <td className="p-3 text-end tabular">{get(c, "roe")}</td>
                          <td className="hidden p-3 text-end tabular md:table-cell">{get(c, "p_e")}</td>
                          <td className="hidden p-3 text-end tabular md:table-cell">{get(c, "dividend_yield")}</td>
                          <td className="p-3 text-end">
                            <Button variant="ghost" size="sm" className="h-7 w-7 px-0 text-muted-foreground hover:text-red-500" onClick={() => toggle({ id: c.id, ticker: c.ticker })} aria-label={ar ? "إزالة" : "Remove"}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {ids.length > 0 && data && data.companies.length < ids.length ? (
          <p className="mt-3 text-xs text-muted-foreground italic">
            {ar ? `${ids.length - data.companies.length} من شركات القائمة غير موجودة في قاعدة البيانات الحالية` : `${ids.length - data.companies.length} watched id(s) not found in the current database`}
          </p>
        ) : null}
      </main>
      <AppFooter />
    </div>
  )
}
