"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Building2, Search, Star, ChevronUp, ChevronDown, Scale } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/client/api"
import { useWatchlist } from "@/lib/client/watchlist"
import { useI18n } from "@/lib/i18n"
import { formatEgp, formatPercent } from "@/lib/financial/units"
import { SECTORS, sectorLabel } from "@/lib/sectors"
import { DemoBadge, StarButton } from "./shared"

export function CompaniesView({ onOpenCompany }: { onOpenCompany: (id: string) => void }) {
  const { t, lang, pick } = useI18n()
  const ar = lang === "ar"
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sector, setSector] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [watchlistOnly, setWatchlistOnly] = useState(false)
  const [sortBy, setSortBy] = useState<"ticker" | "name" | "revenue" | "net_profit" | "roe">("ticker")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const watchItems = useWatchlist((s) => s.items)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const watchIds = useMemo(() => [...new Set(watchItems.map((i) => i.id))], [watchItems])
  const watchKey = watchIds.join(",")
  const { data, isLoading } = useQuery({
    queryKey: ["companies", debouncedSearch, sector, page, watchlistOnly, watchKey],
    queryFn: () => api.companies({
      search: debouncedSearch,
      sector: sector === "all" ? undefined : sector,
      page,
      pageSize: 25,
      ids: watchlistOnly ? watchIds : undefined,
    }),
    enabled: !watchlistOnly || watchIds.length > 0,
  })

  const sectors = SECTORS

  const sortedCompanies = useMemo(() => {
    if (!data?.companies) return []
    return [...data.companies].sort((a, b) => {
      const aVal = a.snapshot[sortBy]?.value ?? 0
      const bVal = b.snapshot[sortBy]?.value ?? 0
      if (sortDir === "asc") return aVal - bVal
      return bVal - aVal
    })
  }, [data, sortBy, sortDir])

  return (
    <div className="space-y-5">
      {/* Header: title + search/filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("nav.companies")}</h1>
          <p className="text-sm text-muted-foreground">
            {ar ? "دليل مالي للشركات المدرجة في البورصة المصرية مع جدولة وفرز متقدم" : "Financial directory of EGX-listed companies with advanced sorting and filtering"}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 h-9 w-full"
              placeholder={t("co.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("common.search")}
            />
          </div>
          <Select value={sector} onValueChange={(v) => { setSector(v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-56 h-9" aria-label={t("co.sector")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("co.allSectors")}</SelectItem>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>
                  {sectorLabel(s, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => {
              setWatchlistOnly((v) => !v)
              setPage(1)
            }}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all duration-150 ${
              watchlistOnly ? "border-warning/60 bg-warning/10 text-warning-foreground" : "border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/30"
            }`}
            aria-pressed={watchlistOnly}
          >
            <Star className={`h-3.5 w-3.5 ${watchlistOnly ? "fill-warning-foreground text-warning-foreground" : ""}`} />
            {t("watchlist.only")}
            {watchItems.length > 0 ? <span className="tabular">({watchItems.length})</span> : null}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : !data || data.companies.length === 0 ? (
        <Card className="flex h-64 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground border-border/60">
          {watchlistOnly && watchItems.length === 0 ? (
            <>
              <Star className="h-6 w-6 text-warning-foreground/60" />
              {t("watchlist.empty")}
            </>
          ) : (
            t("common.noData")
          )}
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground tabular">
            {data.total} {lang === "ar" ? "شركة" : "companies"} · {t("common.page")} {data.page} {t("common.of")} {data.totalPages}
          </p>

          {/* Rich sortable data table */}
          <Card className="border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm caption-bottom">
                <thead>
                  <tr className="border-b border-border/40 bg-card/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="p-3 text-start font-medium w-12">
                      <button
                        onClick={() => { setSortBy("ticker"); setSortDir(sortBy === "ticker" && sortDir === "asc" ? "desc" : "asc") }}
                        className="flex items-center gap-1 text-foreground hover:text-primary transition-colors"
                      >
                        {ar ? "الرمز" : "Ticker"}
                        {sortBy === "ticker" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                      </button>
                    </th>
                    <th className="p-3 text-start font-medium">
                      <button
                        onClick={() => { setSortBy("name"); setSortDir(sortBy === "name" && sortDir === "asc" ? "desc" : "asc") }}
                        className="flex items-center gap-1 text-foreground hover:text-primary transition-colors"
                      >
                        {ar ? "اسم الشركة" : "Company"}
                        {sortBy === "name" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                      </button>
                    </th>
                    <th className="p-3 text-start font-medium hidden sm:table-cell">{ar ? "القطاع" : "Sector"}</th>
                    <th className="p-3 text-end font-medium">
                      <button
                        onClick={() => { setSortBy("revenue"); setSortDir(sortBy === "revenue" && sortDir === "asc" ? "desc" : "asc") }}
                        className="flex items-end gap-1 text-foreground hover:text-primary transition-colors"
                      >
                        {t("co.revenue")}
                        {sortBy === "revenue" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                      </button>
                    </th>
                    <th className="p-3 text-end font-medium">
                      <button
                        onClick={() => { setSortBy("net_profit"); setSortDir(sortBy === "net_profit" && sortDir === "asc" ? "desc" : "asc") }}
                        className="flex items-end gap-1 text-foreground hover:text-primary transition-colors"
                      >
                        {t("co.netProfit")}
                        {sortBy === "net_profit" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                      </button>
                    </th>
                    <th className="p-3 text-end font-medium">
                      <button
                        onClick={() => { setSortBy("roe"); setSortDir(sortBy === "roe" && sortDir === "asc" ? "desc" : "asc") }}
                        className="flex items-end gap-1 text-foreground hover:text-primary transition-colors"
                      >
                        {t("co.roe")}
                        {sortBy === "roe" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                      </button>
                    </th>
                    <th className="p-3 text-end font-medium hidden lg:table-cell">{ar ? "القيمة السوقية" : "Market Cap"}</th>
                    <th className="p-3 text-center font-medium w-16">{ar ? "إجراءات" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCompanies.map((c) => {
                    const revenue = c.snapshot.revenue
                    const netProfit = c.snapshot.net_profit
                    const roe = c.snapshot.roe
                    const positive = (netProfit?.value ?? 0) >= 0
                    return (
                      <tr
                        key={c.id}
                        onClick={() => onOpenCompany(c.id)}
                        className="border-b border-border/40 bg-card hover:bg-accent/30 transition-colors cursor-pointer group"
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Building2 className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-bold">{c.ticker}</div>
                              {c.isDemoData ? <DemoBadge small /> : null}
                              <p className="truncate text-xs text-muted-foreground">{pick(c.nameEn, c.nameAr)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground">{sectorLabel(c.sector, lang)}</span>
                          {c.industry ? <span className="block text-[10px] text-muted-foreground/70">{c.industry}</span> : null}
                        </td>
                        <td className="p-3 text-end tabular">
                          {revenue ? formatEgp(revenue.value) : "—"}
                          {revenue ? <span className="block text-[9px] font-normal text-muted-foreground/80">{revenue.periodLabel}</span> : null}
                        </td>
                        <td className="p-3 text-end tabular">
                          <span className={`font-semibold tabular ${positive ? "text-positive" : "text-negative"}`}>
                            {netProfit ? formatEgp(netProfit.value) : "—"}
                          </span>
                          {netProfit ? <span className="block text-[9px] font-normal text-muted-foreground/80">{netProfit.periodLabel}</span> : null}
                        </td>
                        <td className="p-3 text-end tabular">
                          <span className={`font-semibold tabular ${(roe?.value ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
                            {roe ? formatPercent(roe.value) : "—"}
                          </span>
                          {roe ? <span className="block text-[9px] font-normal text-muted-foreground/80">{roe.periodLabel}</span> : null}
                        </td>
                        <td className="p-3 text-end tabular hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">—</span>
                        </td>
                        <td className="p-3 text-center">
                          <StarButton companyId={c.id} ticker={c.ticker} />
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary rtl-flip transition-colors" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {data.totalPages > 1 ? (
              <div className="border-t border-border/60 px-5 py-3 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {data.total} {lang === "ar" ? "شركة" : "companies"}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border-border/70 h-8 px-2">
                    ‹
                  </Button>
                  <span className="text-xs text-muted-foreground tabular num">
                    {page} / {data.totalPages}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="border-border/70 h-8 px-2">
                    ›
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </div>
  )
}
