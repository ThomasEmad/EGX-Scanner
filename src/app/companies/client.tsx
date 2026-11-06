"use client"

// /companies — the real company directory (searchable, sector-filterable,
// paginated). Every nav entry labelled "الشركات / Companies" points here;
// /rankings stays the metric leaderboard ("الترتيب").

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Building2, Download, ChevronLeft, ChevronRight, Search, TrendingDown, TrendingUp, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useI18n } from "@/lib/i18n"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { SECTORS, SECTOR_AR } from "@/lib/sectors"
import { formatEgp } from "@/lib/financial/units"
import { api, getUserToken } from "@/lib/client/api"
import { QuickAiAnalysisDialog, type QuickAiTarget } from "./quick-analysis"

interface SnapshotMetric {
  value: number
  status: string
  periodLabel: string
  fiscalYear: number
}

interface CompanyRow {
  id: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  industry: string | null
  listingStatus: string
  counts: { reports: number; events: number; dividends: number }
  snapshot: Record<string, SnapshotMetric>
  marketPrice: { price: number; asOf: string | null; currency: string; changePct: number | null } | null
  marketCap: number | null
}

interface CompaniesData {
  page: number
  pageSize: number
  total: number
  totalPages: number
  sort: string
  marketAsOf: string | null
  delayMinutes: number | null
  companies: CompanyRow[]
}

const PAGE_SIZE = 12

export function CompaniesPageShell() {
  const { lang, pick } = useI18n()
  const ar = lang === "ar"
  const router = useRouter()

  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [sector, setSector] = useState<string | null>(null)
  const [sort, setSort] = useState<"ticker" | "marketCap">("ticker")
  const [page, setPage] = useState(1)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickTarget, setQuickTarget] = useState<QuickAiTarget | null>(null)
  const queryClient = useQueryClient()

  // Generation lives in the shell (not the dialog) so in-flight state
  // survives closing/reopening, and a click on an already-generated company
  // reopens instantly without re-firing a POST (cache serves identical data,
  // but avoiding the round-trip is cheaper still). Quota + rate limits are
  // enforced server-side; errors are mapped inside the dialog.
  const gen = useMutation({
    mutationFn: (v: { ticker: string; lang: string }) => api.generateAiAnalysis(v.ticker, v.lang),
    onSuccess: (res) => {
      // A fresh (non-cached) generation just burned a free-tier unit —
      // refresh the usage badge shown in the dialog header.
      if (!res.cached) queryClient.invalidateQueries({ queryKey: ["my-subscription"] })
    },
  })

  function openQuickAnalysis(c: CompanyRow) {
    setQuickTarget({ ticker: c.ticker, nameEn: c.nameEn, nameAr: c.nameAr })
    setQuickOpen(true)
    // Not signed in: don't fire a doomed POST — the dialog shows the login CTA.
    if (!getUserToken()) return
    if (gen.variables?.ticker !== c.ticker) gen.mutate({ ticker: c.ticker, lang })
  }

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["companies", search, sector, sort, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort })
      if (search) params.set("search", search)
      if (sector) params.set("sector", sector)
      return fetch(`/api/v1/companies?${params.toString()}`).then((r) =>
        r.ok ? (r.json() as Promise<CompaniesData>) : null
      )
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  })

  const companies = data?.companies ?? []
  const totalPages = data?.totalPages ?? 1

  // Sector options that actually exist in the taxonomy order.
  const sectorOptions = useMemo(() => SECTORS.filter((s) => s !== "Other" || sector === "Other"), [sector])

  function pickSort(next: "ticker" | "marketCap") {
    setSort(next)
    setPage(1)
  }

  function pickSector(next: string) {
    setSector(next === "all" ? null : next)
    setPage(1)
  }

  const priceAsOfLabel = (() => {
    if (!data?.marketAsOf) return null
    const d = new Date(data.marketAsOf)
    if (Number.isNaN(d.getTime())) return null
    const delay = data.delayMinutes && data.delayMinutes > 0 ? ` · ${ar ? `متأخر ${data.delayMinutes} دقيقة` : `${data.delayMinutes}-min delay`}` : ""
    return `${ar ? "الأسعار بتاريخ" : "Prices as of"} ${d.toLocaleString(ar ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}${delay}`
  })()

  if (error) {
    return (
      <LayoutShell showMobileNav={true}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm font-medium text-destructive">{ar ? "تعذّر تحميل الشركات — تحقق من اتصالك" : "Failed to load companies — please check your connection"}</p>
              <Button variant="outline" onClick={() => window.location.reload()} className="mt-2 h-8 text-xs">
                {ar ? "إعادة التحميل" : "Reload"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </LayoutShell>
    )
  }

  return (
    <LayoutShell showMobileNav={true}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <Building2 className="h-5 w-5 text-primary" />
            {ar ? "الشركات" : "Companies"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? ar
                ? `${data.total.toLocaleString("ar-EG")} شركة مدرجة في البورصة المصرية — ابحث، فلتر بالقطاع، وادخل صفحة أي شركة للتفاصيل الكاملة.`
                : `${data.total.toLocaleString("en-GB")} companies listed on the Egyptian Exchange — search, filter by sector, and open any company for the full breakdown.`
              : ar
                ? "كل الشركات المدرجة في البورصة المصرية مع السعر والقيمة السوقية وأهم المؤشرات المدققة."
                : "Every company listed on the Egyptian Exchange with price, market cap and key verified metrics."}
          </p>
          </div>
          <a
            href="/api/v1/companies/export"
            className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            download
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {ar ? "تصدير CSV" : "Export CSV"}
          </a>
        </div>

        {/* Search + sector + sort */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={ar ? "ابحث بالاسم أو الرمز…" : "Search by name or ticker…"}
              className="h-9 ps-9 text-sm"
              aria-label={ar ? "البحث في الشركات" : "Search companies"}
            />
          </div>

          <Select value={sector ?? "all"} onValueChange={pickSector}>
            <SelectTrigger className="h-9 w-56 text-xs" aria-label={ar ? "القطاع" : "Sector"}>
              <SelectValue placeholder={ar ? "كل القطاعات" : "All sectors"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all" className="text-xs">{ar ? "كل القطاعات" : "All sectors"}</SelectItem>
              {sectorOptions.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {ar ? SECTOR_AR[s] ?? s : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="inline-flex overflow-hidden rounded-xl border border-border/60 bg-surface-secondary/50">
            {([
              ["ticker", ar ? "أبجدياً" : "A–Z"],
              ["marketCap", ar ? "الأكبر بالقيمة السوقية" : "Market cap"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => pickSort(key)}
                className={`px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                  sort === key
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : companies.length === 0 ? (
          <Card className="border-border/60">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {search || sector
                  ? ar
                    ? "لا توجد شركات مطابقة لبحثك — جرّب توسيع الفلاتر."
                    : "No companies match your filters — try widening them."
                  : ar
                    ? "لا بيانات متاحة بعد."
                    : "No data available yet."}
              </p>
              {search || sector ? (
                <button
                  onClick={() => {
                    setSearchInput("")
                    setSector(null)
                    setPage(1)
                  }}
                  className="mt-1 rounded-md px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-accent/50"
                >
                  {ar ? "مسح كل الفلاتر" : "Clear all filters"}
                </button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 transition-opacity ${isFetching ? "opacity-70" : ""}`}>
            {companies.map((c) => {
              const name = pick(c.nameEn, c.nameAr ?? c.nameEn)
              const price = c.marketPrice?.price ?? null
              const chg = c.marketPrice?.changePct ?? null
              const roe = c.snapshot["roe"]?.value ?? null
              const revenue = c.snapshot["revenue"]?.value ?? null
              const profit = c.snapshot["net_profit"]?.value ?? null
              return (
                <Card
                  key={c.id}
                  className="cursor-pointer border-border/60 transition-all duration-150 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                  onClick={() => router.push(`/company/${c.ticker}`)}
                  role="link"
                  aria-label={name}
                >
                  <CardContent className="flex flex-col gap-3 p-4">
                    {/* Identity */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 px-2 text-[11px] font-bold text-primary">
                            {c.ticker}
                          </span>
                          <span className="truncate text-sm font-bold text-foreground" title={name}>
                            {name}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          {ar ? SECTOR_AR[c.sector] ?? c.sector : c.sector}
                          {c.listingStatus === "SUSPENDED" ? (
                            <span className="ms-2 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
                              {ar ? "موقوفة" : "Suspended"}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      {/* Price */}
                      <div className="shrink-0 text-end">
                        <div className="text-sm font-bold tabular text-foreground">
                          {price !== null ? price.toLocaleString(ar ? "ar-EG" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                        </div>
                        {chg !== null ? (
                          <div className={`flex items-center justify-end gap-0.5 text-[11px] font-semibold tabular ${chg >= 0 ? "text-positive" : "text-destructive"}`}>
                            {chg >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                          </div>
                        ) : (
                          <div className="text-[11px] text-muted-foreground">—</div>
                        )}
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-2 border-t border-border/40 pt-3">
                      <div>
                        <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{ar ? "القيمة السوقية" : "Mkt cap"}</p>
                        <p className="mt-0.5 text-xs font-bold tabular text-foreground">{c.marketCap !== null ? formatEgp(c.marketCap, { withCurrency: false }) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{ar ? "الإيرادات" : "Revenue"}</p>
                        <p className="mt-0.5 text-xs font-bold tabular text-foreground">{revenue !== null ? formatEgp(revenue, { withCurrency: false }) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{ar ? "صافي الربح" : "Net profit"}</p>
                        <p className={`mt-0.5 text-xs font-bold tabular ${profit !== null && profit < 0 ? "text-destructive" : "text-foreground"}`}>
                          {profit !== null ? formatEgp(profit, { withCurrency: false }) : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {ar ? "العائد على حقوق الملكية" : "ROE"}
                        <span className="ms-1.5 font-bold tabular text-foreground">{roe !== null ? `${roe.toFixed(1)}%` : "—"}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 rounded-lg px-2 text-[11px] font-semibold text-primary hover:bg-primary/10"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          openQuickAnalysis(c)
                        }}
                        aria-label={ar ? `تحليل ذكي سريع لـ ${name}` : `Quick AI analysis for ${name}`}
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        {ar ? "تحليل سريع" : "Quick AI"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 ? (
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-8 items-center gap-1 rounded-lg border border-border/60 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
              aria-label={ar ? "الصفحة السابقة" : "Previous page"}
            >
              {ar ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              {ar ? "السابق" : "Prev"}
            </button>
            <span className="text-xs text-muted-foreground tabular">
              {ar ? `صفحة ${page.toLocaleString("ar-EG")} من ${totalPages.toLocaleString("ar-EG")}` : `Page ${page} of ${totalPages}`}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-8 items-center gap-1 rounded-lg border border-border/60 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
              aria-label={ar ? "الصفحة التالية" : "Next page"}
            >
              {ar ? "التالي" : "Next"}
              {ar ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        ) : null}

        {priceAsOfLabel ? (
          <p className="mt-4 text-center text-[10px] text-muted-foreground">{priceAsOfLabel}</p>
        ) : null}

        <QuickAiAnalysisDialog
          open={quickOpen}
          target={quickTarget}
          onOpenChange={(o) => {
            setQuickOpen(o)
            if (!o) setQuickTarget(null)
          }}
          gen={gen}
        />
      </div>
    </LayoutShell>
  )
}
