"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Building2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"
import { formatEgp, formatPercent } from "@/lib/financial/units"
import { DemoBadge } from "./shared"

export function CompaniesView({ onOpenCompany }: { onOpenCompany: (id: string) => void }) {
  const { t, lang, pick } = useI18n()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sector, setSector] = useState<string>("all")
  const [page, setPage] = useState(1)

  // debounce search
  useMemo(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ["companies", debouncedSearch, sector, page],
    queryFn: () => api.companies({ search: debouncedSearch, sector: sector === "all" ? undefined : sector, page, pageSize: 9 }),
  })

  const sectors = ["Banks", "Real Estate", "Industrial", "Telecom", "Healthcare", "Food", "Investment", "Financial Services", "Consumer", "Other"]

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">{t("nav.companies")}</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-8 h-9 w-full sm:w-64"
              placeholder={t("co.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("common.search")}
            />
          </div>
          <Select value={sector} onValueChange={(v) => { setSector(v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-44 h-9" aria-label={t("co.sector")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("co.allSectors")}</SelectItem>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : !data || data.companies.length === 0 ? (
        <Card className="flex h-48 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {t("common.noData")}
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground tabular">
            {data.total} {lang === "ar" ? "شركة" : "companies"} · {t("common.page")} {data.page} {t("common.of")} {data.totalPages}
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.companies.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenCompany(c.id)}
                className="group rounded-xl border bg-card p-4 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold">{c.ticker}</span>
                        {c.isDemoData ? <DemoBadge small /> : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{pick(c.nameEn, c.nameAr)}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary rtl-flip" />
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{c.sector}</Badge>
                  {c.industry ? <span className="truncate text-[10px] text-muted-foreground">{c.industry}</span> : null}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <dt className="text-muted-foreground">{t("co.revenue")}</dt>
                    <dd className="font-semibold tabular">{c.snapshot.revenue ? formatEgp(c.snapshot.revenue.value) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("co.netProfit")}</dt>
                    <dd className={`font-semibold tabular ${(c.snapshot.net_profit?.value ?? 0) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                      {c.snapshot.net_profit ? formatEgp(c.snapshot.net_profit.value) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("co.roe")}</dt>
                    <dd className="font-semibold tabular">{c.snapshot.roe ? formatPercent(c.snapshot.roe.value) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("co.assets")}</dt>
                    <dd className="font-semibold tabular">{c.snapshot.total_assets ? formatEgp(c.snapshot.total_assets.value) : "—"}</dd>
                  </div>
                </dl>

                <div className="mt-3 flex items-center gap-3 border-t pt-2.5 text-[10px] text-muted-foreground">
                  <span>{c.counts.reports} {t("co.reports")}</span>
                  <span>{c.counts.events} {t("co.events")}</span>
                  {c.snapshot.revenue?.periodLabel ? <span className="ms-auto font-medium">{c.snapshot.revenue.periodLabel}</span> : null}
                </div>
              </button>
            ))}
          </div>

          {data.totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ‹
              </Button>
              <span className="text-xs text-muted-foreground tabular">
                {page} / {data.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                ›
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
