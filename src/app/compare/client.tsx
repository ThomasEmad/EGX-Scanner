"use client"

// /compare?ids=a,b,c — side-by-side comparison of 2-4 companies on their latest
// verified annual metrics. Best value per row highlighted; shareable URL.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Scale, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { SECTOR_AR } from "@/lib/sectors"
import { useI18n } from "@/lib/i18n"

interface CompareCompany {
  id: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  fiscalYear: number | null
  periodLabel: string | null
  metrics: Record<string, number>
}

interface CompareData {
  companies: CompareCompany[]
  metricDefs: { code: string; labelEn: string; labelAr: string; unit: string }[]
  year: number | null
  /** fiscal years where ≥2 selected companies have annual data (descending) */
  years: number[]
}

const HIGHER_BETTER = new Set(["revenue", "net_profit", "net_margin", "roe", "roa", "total_assets", "total_equity", "eps", "market_cap"])
const LOWER_BETTER = new Set(["p_e", "p_b", "debt_to_equity", "dividend_yield"])

function fmtVal(unit: string, v: number): string {
  if (unit === "PERCENT") return `${v.toFixed(1)}%`
  if (unit === "EGP") {
    const abs = Math.abs(v)
    if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`
    return v.toFixed(0)
  }
  if (unit === "EGP_PER_SHARE") return v.toFixed(2)
  return v.toFixed(2)
}

export default function ComparePage() {
  const router = useRouter()
  const { lang } = useI18n()
  const ar = lang === "en" ? false : true
  const [ids, setIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    const fromUrl = new URLSearchParams(window.location.search).get("ids")
    if (!fromUrl) return []
    return fromUrl
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4)
  })
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [debounceId, setDebounceId] = useState<ReturnType<typeof setTimeout> | null>(null)
  // "all" = each company's own latest annual — or ONE pinned fiscal year for
  // everyone (like-for-like). Synced with the ?year= URL param for sharing.
  const [year, setYear] = useState<string>(() => {
    if (typeof window === "undefined") return "all"
    const y = new URLSearchParams(window.location.search).get("year")
    return y && /^\d{4}$/.test(y) ? y : "all"
  })

  const updateYearUrl = useCallback((next: string) => {
    const u = new URL(window.location.href)
    if (next !== "all") u.searchParams.set("year", next)
    else u.searchParams.delete("year")
    window.history.replaceState(null, "", u.toString())
  }, [])

  function pickYear(v: string) {
    setYear(v)
    updateYearUrl(v)
  }

  const updateUrl = useCallback((next: string[]) => {
    const u = new URL(window.location.href)
    if (next.length >= 2) u.searchParams.set("ids", next.join(","))
    else u.searchParams.delete("ids")
    window.history.replaceState(null, "", u.toString())
  }, [])

  function toggle(id: string) {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]
      updateUrl(next)
      return next
    })
  }

  function onSearch(v: string) {
    setSearch(v)
    if (debounceId) clearTimeout(debounceId)
    setDebounceId(setTimeout(() => setDebounced(v.trim()), 250))
  }

  const { data: searchResults } = useQuery({
    queryKey: ["compare-search", debounced],
    queryFn: () => fetch(`/api/v1/companies?search=${encodeURIComponent(debounced)}&pageSize=6`).then((r) => (r.ok ? r.json() : { companies: [] })),
    enabled: debounced.length >= 2,
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ["compare", ids.join(","), year],
    queryFn: () =>
      fetch(`/api/v1/compare?ids=${ids.join(",")}${year !== "all" ? `&year=${year}` : ""}`).then((r) =>
        r.ok ? (r.json() as Promise<CompareData>) : null,
      ),
    enabled: ids.length >= 2,
    staleTime: 120_000,
  })

  // A pinned year that the current company set can't satisfy resets to auto
  // instead of showing a table full of dashes forever.
  useEffect(() => {
    if (data && year !== "all" && !(data.years ?? []).includes(Number(year))) pickYear("all")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, year])

  const pickedInfo = useMemo(() => {
    const fromSearch = (searchResults?.companies ?? []) as { id: string; ticker: string; nameEn: string }[]
    const map = new Map<string, string>()
    for (const c of data?.companies ?? []) map.set(c.id, c.ticker)
    for (const c of fromSearch) if (ids.includes(c.id) && !map.has(c.id)) map.set(c.id, c.ticker)
    return ids.map((id) => ({ id, ticker: map.get(id) ?? "…" }))
  }, [ids, data, searchResults])

  const bestByMetric = useMemo(() => {
    const best = new Map<string, string>()
    for (const def of data?.metricDefs ?? []) {
      const isHigher = HIGHER_BETTER.has(def.code)
      const isLower = LOWER_BETTER.has(def.code)
      if (!isHigher && !isLower) continue
      let bestId: string | null = null
      let bestVal = isHigher ? -Infinity : Infinity
      for (const c of data?.companies ?? []) {
        const v = c.metrics[def.code]
        if (v !== undefined && ((isHigher && v > bestVal) || (isLower && v < bestVal))) {
          bestVal = v
          bestId = c.id
        }
      }
      if (bestId) best.set(def.code, bestId)
    }
    return best
  }, [data])

  if (error) {
    return (
      <LayoutShell showMobileNav={true}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm font-medium text-destructive">{ar ? "تعذّر تحميل المقارنة — تحقق من اتصالك" : "Failed to load comparison — please check your connection"}</p>
              <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : ar ? "حدث خطأ غير متوقع" : "An unexpected error occurred"}</p>
              <Button variant="outline" onClick={() => window.location.reload()} className="mt-2 h-8 text-xs">{ar ? "إعادة التحميل" : "Reload"}</Button>
            </CardContent>
          </Card>
        </div>
      </LayoutShell>
    )
  }

  return (
    <LayoutShell showMobileNav={true}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Scale className="h-5 w-5 text-primary" />
            {ar ? "مقارنة الشركات" : "Compare Companies"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {year !== "all"
              ? ar
                ? `مقارنة على السنة المالية ${year} — نفس الفترة لكل الشركات المختارة. الشركات بدون قوائم سنوية منشورة لهذه السنة تظهر شرطات.`
                : `Comparing on fiscal year ${year} — the same period for every selected company. Companies without annual filings for that year show dashes.`
              : ar
                ? "قارن حتى 4 شركات على أحدث قوائم سنوية متاحة لكل شركة — الرابط يتحدث تلقائيًا للمشاركة."
                : "Compare up to 4 companies on each one's latest annual statements — the URL updates for sharing."}
          </p>
          {ids.length >= 2 ? (
            <div className="mt-3">
              <Select value={year} onValueChange={pickYear}>
                <SelectTrigger className="h-8 w-56 text-xs" aria-label={ar ? "الفترة" : "Period"}>
                  <SelectValue placeholder={ar ? "الفترة" : "Period"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all" className="text-xs">
                    {ar ? "تلقائي — أحدث سنة لكل شركة" : "Auto — each company's latest year"}
                  </SelectItem>
                  {(data?.years ?? []).map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-xs">
                      {ar ? `سنة مالية ${y}` : `Fiscal year ${y}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {/* picker */}
        <div className="mb-4 rounded-xl border border-border/60 bg-card p-3">
          {pickedInfo.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pickedInfo.map((p) => (
                <Badge key={p.id} variant="outline" className="cursor-pointer gap-1 border-primary/40 bg-primary/5 py-1 text-xs" onClick={() => toggle(p.id)}>
                  {p.ticker}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
              {ids.length < 2 ? <span className="self-center text-[11px] text-muted-foreground italic">{ar ? "اختر شركة إضافية على الأقل" : "pick at least one more company"}</span> : null}
            </div>
          ) : null}
          <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={ar ? "ابحث واختر شركة (حتى 4)…" : "Search and pick companies (up to 4)…"} className="h-9 text-sm" />
          {debounced.length >= 2 && (searchResults?.companies ?? []).length > 0 ? (
            <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {((searchResults?.companies ?? []) as { id: string; ticker: string; nameEn: string; nameAr: string | null; sector: string }[]).map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    toggle(c.id)
                    setSearch("")
                    setDebounced("")
                  }}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs transition-colors hover:bg-accent/50"
                >
                  <span className="font-bold">{c.ticker}</span>
                  <span className="truncate text-muted-foreground">{ar ? c.nameAr ?? c.nameEn : c.nameEn}</span>
                  <span className="ms-auto shrink-0 text-[10px] text-muted-foreground/70">{ar ? SECTOR_AR[c.sector] ?? c.sector : c.sector}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : data && data.companies.length >= 2 ? (
          <Card className="border-border/60 p-0">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="p-3 text-start text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{ar ? "المؤشر" : "Metric"}</th>
                      {data.companies.map((c) => (
                        <th key={c.id} className="p-3 text-end">
                          <a href={`/company/${c.id}`} className="block hover:text-primary">
                            <span className="block text-sm font-bold">{c.ticker}</span>
                            <span className="block max-w-36 truncate text-[10px] font-normal text-muted-foreground">{ar ? c.nameAr ?? c.nameEn : c.nameEn}</span>
                            <span className="block text-[10px] font-normal text-muted-foreground/80">{c.periodLabel ?? "—"}</span>
                          </a>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.metricDefs.map((def) => (
                      <tr key={def.code} className="border-b border-border/40 last:border-0">
                        <td className="p-3 text-xs font-medium text-muted-foreground">{ar ? def.labelAr : def.labelEn}</td>
                        {data.companies.map((c) => {
                          const v = c.metrics[def.code]
                          const isBest = v !== undefined && bestByMetric.get(def.code) === c.id
                          const isHigher = HIGHER_BETTER.has(def.code)
                          const isLower = LOWER_BETTER.has(def.code)
                          const getColor = () => {
                            if (!isBest || v === undefined) return ""
                            if (isHigher) return "text-emerald-600 dark:text-emerald-400"
                            if (isLower) return "text-blue-600 dark:text-blue-400"
                            return "text-primary"
                          }
                          return (
                            <td key={c.id} className={`p-3 text-end font-semibold tabular transition-colors ${isBest ? `${getColor()} bg-primary/5` : ""}`}>
                              {v !== undefined ? fmtVal(def.unit, v) : <span className="text-muted-foreground/50">—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : ids.length >= 2 ? (
          <Card className="border-border/60">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">{ar ? "لا توجد بيانات كافية لهذه الشركات" : "Not enough data for these companies"}</CardContent>
          </Card>
        ) : (
          <Card className="border-border/60">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Scale className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">{ar ? "اختر شركتين على الأقل من البحث فوق" : "Pick at least two companies from the search above"}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {[["COMI", "cmuexbjtt001sbxn8bbpnblsn"], ["ADIB", "cmuexbjup001ubxn8mb28bbot"], ["ABUK", "cmuexbjy70024bxn8jqiz9kzp"]].map(([t, id]) => (
                  <Button key={id} variant="outline" size="sm" className="h-7 text-xs" onClick={() => toggle(id)}>
                    {t}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {data && data.companies.length >= 2 ? (
          <Badge variant="outline" className="mt-4 border-success/40 text-[10px] text-success-foreground">
            {ar ? "الأخضر = الأفضل في الصف — كل قيمة من أحدث قوائم سنوية متحقق منها لكل شركة" : "Green = best in row — every value from each company's latest verified annual filing"}
          </Badge>
        ) : null}
      </div>
    </LayoutShell>
  )
}
