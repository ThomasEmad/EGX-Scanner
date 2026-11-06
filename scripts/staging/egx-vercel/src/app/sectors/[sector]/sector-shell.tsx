"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { useI18n } from "@/lib/i18n"
import { SectorPeriodSelect } from "./period-select"

function fmtEgp(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return value.toFixed(0)
}

function fmtDate(value: Date | null | undefined): string {
  if (!value) return "—"
  return value.toISOString().slice(0, 10)
}

interface SectorPageShellProps {
  sector: string
  ar: string
  companies: Array<{
    id: string
    ticker: string
    nameEn: string
    nameAr: string | null
    industry: string | null
    updatedAt: Date
  }>
  latestMetric: Map<string, { value: number; periodLabel: string }>
  latestPrice: Map<string, { price: number; asOf: Date }>
  url: string
  /** pinned fiscal year (null = auto — each company's latest annual) */
  year: number | null
  /** fiscal years this sector covers, descending — drives the dropdown */
  years: number[]
}

export function SectorPageShell({ sector, ar, companies, latestMetric, latestPrice, url, year, years }: SectorPageShellProps) {
  const { lang } = useI18n()
  const isAr = lang === "ar"

  return (
    <LayoutShell showMobileNav={true}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:underline">
            {isAr ? "الرئيسية" : "Home"}
          </Link>
          <span className="mx-1.5">/</span>
          <Link href="/sectors" className="hover:underline">
            {isAr ? "القطاعات" : "Sectors"}
          </Link>
          <span className="mx-1.5">/</span>
          <span>{sector}</span>
        </nav>

        <header className="mb-6 max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {sector} companies — {isAr ? ar : ar}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {year
              ? `${companies.length} active Egyptian Exchange ${companies.length === 1 ? "company" : "companies"} in the ${sector} sector, compared on fiscal year ${year} — the same period for every company. Prices are the latest recorded snapshot (date shown). "—" means no authoritative value for that year — it is never treated as zero.`
              : `${companies.length} active Egyptian Exchange ${companies.length === 1 ? "company" : "companies"} in the ${sector} sector. Prices are the latest recorded snapshot (date shown); revenue and net profit are the latest verified annual figure with its fiscal period printed. "—" means no authoritative value is available — it is never treated as zero.`}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground" dir="rtl">
            {year
              ? `${companies.length} شركة نشطة في قطاع ${ar} بالبورصة المصرية، معروضة على السنة المالية ${year} — نفس الفترة لكل الشركات، مقارنة تاريخية عادلة. الأسعار هي آخر لقطة مسجلة بتاريخها. «—» تعني عدم توفر قيمة موثوقة لهذه السنة ولا تُعامل كصفر.`
              : `${companies.length} شركة نشطة في قطاع ${ar} بالبورصة المصرية. الأسعار هي آخر لقطة مسجلة بتاريخها، والإيراد وصافي الربح هما آخر قيمة سنوية متحقق منها مع طباعة السنة المالية. «—» تعني عدم توفر قيمة موثوقة ولا تُعامل كصفر.`}
          </p>
          {years.length > 0 ? (
            <div className="mt-3">
              <SectorPeriodSelect sector={sector} year={year ? String(year) : "all"} years={years} />
            </div>
          ) : null}
        </header>

        <Card className="border-border/60 p-0">
          <CardContent className="p-0">
            {companies.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {isAr ? "لا توجد شركات نشطة في هذا القطاع بعد." : "No active companies in this sector yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="p-3 text-start font-medium">Company</th>
                      <th className="p-3 text-start font-medium">Ticker</th>
                      <th className="p-3 text-end font-medium">Price</th>
                      <th className="hidden p-3 text-end font-medium sm:table-cell">Revenue (FY)</th>
                      <th className="hidden p-3 text-end font-medium sm:table-cell">Net profit (FY)</th>
                      <th className="hidden p-3 text-end font-medium md:table-cell">Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => {
                      const revenue = latestMetric.get(`${c.id}:revenue`)
                      const profit = latestMetric.get(`${c.id}:net_profit`)
                      const price = latestPrice.get(c.id)
                      const period = revenue?.periodLabel ?? profit?.periodLabel ?? null
                      return (
                        <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-accent/30">
                          <td className="p-3">
                            <Link href={`/company/${c.ticker}`} className="font-medium hover:underline">
                              {c.nameEn}
                            </Link>
                            {c.nameAr ? <span className="ms-2 text-xs text-muted-foreground">{c.nameAr}</span> : null}
                          </td>
                          <td className="p-3 font-bold">{c.ticker}</td>
                          <td className="p-3 text-end tabular">
                            {price ? price.price.toFixed(2) : "—"}
                            <span className="ms-1 text-[10px] text-muted-foreground">{fmtDate(price?.asOf)}</span>
                          </td>
                          <td className="hidden p-3 text-end tabular sm:table-cell">{fmtEgp(revenue?.value)}</td>
                          <td className="hidden p-3 text-end tabular sm:table-cell">{fmtEgp(profit?.value)}</td>
                          <td className="hidden p-3 text-end text-[11px] text-muted-foreground md:table-cell">
                            {period ?? "—"}
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

        <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
          <Link href="/rankings" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
            {isAr ? "مقارنة الشركات عبر القطاعات" : "Compare companies across sectors"}
          </Link>
          <Link href="/sectors" className="text-muted-foreground hover:underline">
            {isAr ? "كل القطاعات" : "All sectors"}
          </Link>
        </div>
      </div>
    </LayoutShell>
  )
}
