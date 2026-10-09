"use client"

// /compare?ids=a,b,c — side-by-side comparison of 2-4 companies on their latest
// verified annual metrics. Best value per row highlighted; shareable URL.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Scale, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AppHeader } from "@/components/egx/app-header"
import { AppFooter } from "@/components/egx/app-footer"
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
}

const SECTOR_AR: Record<string, string> = {
  Banks: "البنوك", "Financial Services": "الخدمات المالية", Healthcare: "الرعاية الصحية", Food: "الأغذية",
  Consumer: "المستهلك", Industrial: "الصناعة", Telecom: "الاتصالات والتكنولوجيا", "Real Estate": "العقارات",
  Investment: "الاستثمار", Construction: "الإنشاءات", "Basic Materials": "المواد الأساسية", Energy: "الطاقة",
  Utilities: "المرافق", Insurance: "التأمين",
}

// higher-is-better metrics; the rest show no highlight (P/E, P/B, debt depend on context)
const HIGHER_BETTER = new Set(["revenue", "net_profit", "net_margin", "roe", "roa", "revenue_growth", "profit_growth", "total_assets", "total_equity", "current_ratio", "eps", "market_cap"])

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
  const { lang } = useI18n()
  const ar = lang === "ar"
  const [ids, setIds] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [debounceId, setDebounceId] = useState<ReturnType<typeof setTimeout> | null>(null)

  // sync ids with the URL (?ids=) for shareable comparisons
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ids")
    if (fromUrl) {
      const parsed = fromUrl.split(",").filter((s) => s.length > 10).slice(0, 4)
      if (parsed.length) setIds(parsed)
    }
  }, [])

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

  const { data, isLoading } = useQuery({
    queryKey: ["compare", ids.join(",")],
    queryFn: () => fetch(`/api/v1/compare?ids=${ids.join(",")}`).then((r) => (r.ok ? (r.json() as Promise<CompareData>) : null)),
    enabled: ids.length >= 2,
  })

  // picked companies shown as chips even before comparison loads
  const pickedInfo = useMemo(() => {
    const fromSearch = (searchResults?.companies ?? []) as { id: string; ticker: string; nameEn: string }[]
    const map = new Map<string, string>()
    for (const c of data?.companies ?? []) map.set(c.id, c.ticker)
    for (const c of fromSearch) if (ids.includes(c.id) && !map.has(c.id)) map.set(c.id, c.ticker)
    return ids.map((id) => ({ id, ticker: map.get(id) ?? "…" }))
  }, [ids, data, searchResults])

  // best (max) per metric row among companies that have the value
  const bestByMetric = useMemo(() => {
    const best = new Map<string, string>()
    for (const def of data?.metricDefs ?? []) {
      if (!HIGHER_BETTER.has(def.code)) continue
      let bestId: string | null = null
      let bestVal = -Infinity
      for (const c of data?.companies ?? []) {
        const v = c.metrics[def.code]
        if (v !== undefined && v > bestVal) {
          bestVal = v
          bestId = c.id
        }
      }
      if (bestId) best.set(def.code, bestId)
    }
    return best
  }, [data])

  return (
    <div className="min-h-svh bg-background">
      <AppHeader view="companies" companyOpen={false} onViewChange={() => (window.location.href = "/dashboard")} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Scale className="h-5 w-5 text-primary" />
            {ar ? "مقارنة الشركات" : "Compare Companies"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ar ? "قارن حتى 4 شركات على أحدث قوائم سنوية متاحة لكل شركة — الرابط يتحدث تلقائيًا للمشاركة." : "Compare up to 4 companies on each one's latest annual statements — the URL updates for sharing."}
          </p>
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
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs transition-colors hover:bg-muted/60"
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
                            <span className="block text-[10px] font-normal text-muted-foreground/80">{c.periodLabel ?? ar ? "—" : "—"}</span>
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
                          return (
                            <td key={c.id} className={`p-3 text-end font-semibold tabular ${isBest ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
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

        <Badge variant="outline" className="mt-4 border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-400">
          {ar ? "الأخضر = الأفضل في الصف — كل قيمة من أحدث قوائم سنوية متحقق منها لكل شركة" : "Green = best in row — every value from each company's latest verified annual filing"}
        </Badge>
      </main>
      <AppFooter />
    </div>
  )
}
