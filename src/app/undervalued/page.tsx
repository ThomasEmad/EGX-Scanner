"use client"

import { useQuery } from "@tanstack/react-query"
import { Gauge, Lock, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AppFooter } from "@/components/egx/app-footer"
import { useI18n } from "@/lib/i18n"
import { useSubscriptionGate } from "@/lib/client/subscription-gate"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

type Row = {
  companyId: string; ticker: string; name: string; sector: string
  currentPrice: number; fairValue: number | null; upside: number | null
  method: string; criteriaMet: string[]
}

const CRITERIA_AR: Record<string, string> = {
  PE_BELOW_SECTOR_0_85: "المكرر أقل من 85% من وسيط القطاع",
  PB_BELOW_1_AND_SECTOR_0_9: "تحت القيمة الدفترية وأقل من 90% من القطاع",
  YIELD_ABOVE_SECTOR_75TH: "عائد توزيعات أعلى من 75% من القطاع",
  ROE_ABOVE_PE_BELOW: "عائد فوق القطاع بسعر أرخص",
  EV_EBITDA_BELOW_25TH: "EV/EBITDA في أرخص 25% من القطاع",
}

export default function UndervaluedPage() {
  const { lang } = useI18n()
  const router = useRouter()
  const { isPremium } = useSubscriptionGate()
  const [sector, setSector] = useState("")
  const [minUpside, setMinUpside] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["undervalued"],
    queryFn: () => fetch("/api/v1/undervalued").then((r) => (r.ok ? ((r.json() as unknown) as { detected: number; results: Row[]; lastUpdated: string }) : null)),
    staleTime: 300_000,
  })

  const rows = useMemo(() => {
    let list = data?.results ?? []
    if (sector) list = list.filter((r) => r.sector === sector)
    if (minUpside) list = list.filter((r) => (r.upside ?? -999) >= Number(minUpside))
    return list
  }, [data, sector, minUpside])

  const visible = isPremium ? rows : rows.slice(0, 3)
  const locked = rows.length - visible.length
  const sectors = [...new Set((data?.results ?? []).map((r) => r.sector))].sort()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="flex items-center gap-2 text-sm font-bold">
            <Gauge className="h-4 w-4 text-violet-500" />
            {lang === "ar" ? "فرص التقييم" : "Undervalued"}
          </span>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => router.push("/dashboard")}>
            {lang === "ar" ? "لوحة التحكم" : "Dashboard"}
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4">
        <div>
          <h1 className="text-xl font-bold">{lang === "ar" ? "الفرص المقومة بأقل من قيمتها" : "Undervalued opportunities"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {data ? `${data.detected} ${lang === "ar" ? "سهم مكتشف — آخر تحديث" : "stocks detected — last updated"} ${data.lastUpdated.slice(0, 16).replace("T", " ")}` : ""}
          </p>
        </div>

        {/* filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            {lang === "ar" ? "فلاتر:" : "Filters:"}
          </div>
          <select value={sector} onChange={(e) => setSector(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-xs" aria-label={lang === "ar" ? "القطاع" : "Sector"}>
            <option value="">{lang === "ar" ? "كل القطاعات" : "All sectors"}</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Input value={minUpside} onChange={(e) => setMinUpside(e.target.value.replace(/\D/g, ""))} placeholder={lang === "ar" ? "أقل عائد %" : "Min upside %"} className="h-8 w-32 text-xs" inputMode="numeric" />
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSector(""); setMinUpside("") }}>
            {lang === "ar" ? "إعادة تعيين" : "Reset"}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            {lang === "ar" ? "لا توجد فرص مطابقة للفلاتر" : "No opportunities match the filters"}
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {visible.map((r, idx) => (
              <Card key={r.companyId} className="border-border/60">
                <CardContent className="p-0">
                  <button className="flex w-full items-center justify-between gap-3 p-4 text-start" onClick={() => setExpanded(expanded === r.companyId ? null : r.companyId)}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-6 shrink-0 text-xs font-bold text-muted-foreground tabular">#{idx + 1}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{r.ticker}</span>
                          <span className="truncate text-xs text-muted-foreground">{r.name}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {lang === "ar" ? "السعر:" : "Price:"} <span dir="ltr" className="tabular">{r.currentPrice.toFixed(2)} EGP</span> · {r.sector}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className={`text-sm font-bold tabular ${(r.upside ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {r.upside !== null ? `${r.upside > 0 ? "+" : ""}${r.upside}%` : "—"}
                      </p>
                      <p className="text-[9px] text-muted-foreground">{lang === "ar" ? "أفق متوقع" : "upside"}</p>
                    </div>
                  </button>
                  {expanded === r.companyId ? (
                    <div className="space-y-2 border-t border-border/60 p-4 text-xs">
                      <p>
                        <span className="font-medium">{lang === "ar" ? "القيمة العادلة:" : "Fair value:"}</span>{" "}
                        <span dir="ltr" className="tabular font-semibold">{r.fairValue !== null ? `${r.fairValue.toFixed(2)} EGP` : "—"}</span>
                        {r.method ? <span className="ms-2 text-muted-foreground">({r.method})</span> : null}
                      </p>
                      <div>
                        <p className="mb-1 font-medium">{lang === "ar" ? "المعايير المحققة:" : "Criteria met:"}</p>
                        <ul className="list-disc space-y-0.5 ps-4 text-muted-foreground">
                          {r.criteriaMet.map((c) => <li key={c}>{CRITERIA_AR[c] ?? c}</li>)}
                        </ul>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => router.push(`/company/${r.companyId}`)}>
                        {lang === "ar" ? "عرض الشركة" : "View company"}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
            {!isPremium && locked > 0 ? (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="flex items-center justify-center gap-3 p-4 text-xs text-amber-700 dark:text-amber-400">
                  <Lock className="h-4 w-4" aria-hidden />
                  {lang === "ar" ? `${locked} فرصة إضافية متاحة لمشتركي Pro` : `${locked} more opportunities on Pro`}
                  <Button size="sm" className="h-7 text-xs" onClick={() => router.push("/premium")}>
                    {lang === "ar" ? "ترقية" : "Upgrade"}
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  )
}
