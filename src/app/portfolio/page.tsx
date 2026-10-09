"use client"

// /portfolio — investor positions valued against recorded MarketPrice snapshots.
// Values are user input; prices come from verified snapshots (never estimates —
// a holding without any recorded price shows cost only, with a notice).

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Briefcase, Loader2, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AppHeader } from "@/components/egx/app-header"
import { AppFooter } from "@/components/egx/app-footer"
import { authHeaders } from "@/lib/client/api"
import { useSubscriptionGate } from "@/lib/client/subscription-gate"
import { useI18n } from "@/lib/i18n"

interface HoldingRow {
  id: string
  companyId: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  quantity: number
  avgCost: number
  price: number | null
  priceAsOf: string | null
  marketValue: number | null
  cost: number
  pl: number | null
  plPct: number | null
}

interface PortfolioData {
  holdings: HoldingRow[]
  totals: { marketValue: number; cost: number; pl: number; plPct: number | null; count: number; priceGaps: number; expectedDividend: number; dividendYieldOnCost: number | null }
  sectors: { sector: string; value: number; pct: number }[]
}

function fmtEgp(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? "-" : ""
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`
  return `${sign}${abs.toFixed(2)}`
}

export default function PortfolioPage() {
  const { lang } = useI18n()
  const { isPremium } = useSubscriptionGate()
  const qc = useQueryClient()
  const ar = lang === "ar"

  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () =>
      fetch("/api/v1/portfolio", { headers: authHeaders() }).then((r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "AUTH" : "FAILED")
        return r.json() as Promise<PortfolioData>
      }),
    retry: false,
  })

  const del = useMutation({
    mutationFn: (id: string) => fetch(`/api/v1/portfolio?id=${id}`, { method: "DELETE", headers: authHeaders() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }),
  })

  const totals = data?.totals
  const positive = (totals?.pl ?? 0) >= 0

  return (
    <div className="min-h-svh bg-background">
      <AppHeader view="companies" companyOpen={false} onViewChange={() => (window.location.href = "/dashboard")} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Briefcase className="h-5 w-5 text-primary" />
              {ar ? "محفظتي" : "My Portfolio"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {ar ? "مراكزك مُقيّمة بأسعار مسجّلة — بدون تقديرات. سجّل دخولك أولًا لإضافة مراكز." : "Positions valued at recorded prices — never estimates. Sign in to add positions."}
            </p>
          </div>
          <AddHolding ar={ar} isPremium={isPremium} count={totals?.count ?? 0} disabled={!data && !error} />
        </div>

        {error ? (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5 text-sm text-amber-700 dark:text-amber-400">
              {ar ? "محتاج تسجل دخول عشان تشوف محفظتك — " : "Sign in to view your portfolio — "}
              <a href="/login" className="font-semibold underline">{ar ? "صفحة الدخول" : "sign in"}</a>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : !data || data.holdings.length === 0 ? (
          <Card className="border-border/60">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Briefcase className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">{ar ? "محفظتك فاضية — ضيف أول مركز من زر «مركز جديد»" : "No positions yet — add your first one with “New position”"}</p>
              <p className="text-xs text-muted-foreground">{ar ? "كل مركز بيتقيّم فورًا بآخر سعر مسجّل" : "Each position is valued instantly at the latest recorded price"}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {/* totals */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Card className="border-border/60 p-0">
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{ar ? "القيمة السوقية" : "Market value"}</p>
                  <p className="mt-1 text-lg font-bold tabular">{fmtEgp(totals!.marketValue)} EGP</p>
                </CardContent>
              </Card>
              <Card className="border-border/60 p-0">
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{ar ? "التكلفة" : "Cost"}</p>
                  <p className="mt-1 text-lg font-bold tabular">{fmtEgp(totals!.cost)} EGP</p>
                </CardContent>
              </Card>
              <Card className={`p-0 ${positive ? "border-emerald-500/30" : "border-red-500/30"}`}>
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{ar ? "الربح/الخسارة" : "P&L"}</p>
                  <p className={`mt-1 flex items-center gap-1.5 text-lg font-bold tabular ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {fmtEgp(totals!.pl)} EGP
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/60 p-0">
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{ar ? "نسبة العائد" : "Return"}</p>
                  <p className={`mt-1 text-lg font-bold tabular ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {totals!.plPct !== null ? `${totals!.plPct >= 0 ? "+" : ""}${totals!.plPct.toFixed(1)}%` : "—"}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-teal-500/30 p-0">
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{ar ? "توزيعات سنوية متوقعة" : "Expected annual dividends"}</p>
                  <p className="mt-1 text-lg font-bold tabular text-teal-700 dark:text-teal-300">{totals!.expectedDividend > 0 ? `${fmtEgp(totals!.expectedDividend)} EGP` : "—"}</p>
                  {totals!.dividendYieldOnCost !== null ? (
                    <p className="text-[10px] text-muted-foreground">{ar ? "عائد على التكلفة" : "yield on cost"}: <span className="tabular font-semibold">{totals!.dividendYieldOnCost.toFixed(1)}%</span></p>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            {/* holdings table */}
            <Card className="border-border/60 p-0">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="p-3 text-start font-medium">{ar ? "الشركة" : "Company"}</th>
                        <th className="p-3 text-end font-medium">{ar ? "الكمية" : "Qty"}</th>
                        <th className="p-3 text-end font-medium">{ar ? "متوسط التكلفة" : "Avg cost"}</th>
                        <th className="p-3 text-end font-medium">{ar ? "آخر سعر مسجّل" : "Last price"}</th>
                        <th className="p-3 text-end font-medium">{ar ? "القيمة" : "Value"}</th>
                        <th className="p-3 text-end font-medium">{ar ? "الربح/الخسارة" : "P&L"}</th>
                        <th className="p-3 text-end font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.holdings.map((h) => {
                        const good = (h.pl ?? 0) >= 0
                        return (
                          <tr key={h.id} className="border-b border-border/40 last:border-0">
                            <td className="p-3">
                              <a href={`/company/${h.companyId}`} className="group flex items-center gap-2">
                                <span className="font-bold group-hover:text-primary">{h.ticker}</span>
                                <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:inline">{ar ? h.nameAr ?? h.nameEn : h.nameEn}</span>
                              </a>
                            </td>
                            <td className="p-3 text-end tabular">{h.quantity.toLocaleString()}</td>
                            <td className="p-3 text-end tabular">{h.avgCost.toFixed(2)}</td>
                            <td className="p-3 text-end tabular">
                              {h.price !== null ? (
                                <>
                                  {h.price.toFixed(2)}
                                  {h.priceAsOf ? <span className="ms-1 text-[10px] text-muted-foreground">{new Date(h.priceAsOf).toISOString().slice(0, 10)}</span> : null}
                                </>
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">{ar ? "لا سعر مسجّل" : "no recorded price"}</span>
                              )}
                            </td>
                            <td className="p-3 text-end font-semibold tabular">{h.marketValue !== null ? fmtEgp(h.marketValue) : fmtEgp(h.cost)}</td>
                            <td className={`p-3 text-end font-bold tabular ${h.pl === null ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {h.pl !== null ? `${good ? "+" : ""}${fmtEgp(h.pl)} (${h.plPct !== null ? `${h.plPct >= 0 ? "+" : ""}${h.plPct.toFixed(1)}%` : "—"})` : "—"}
                            </td>
                            <td className="p-3 text-end">
                              <Button variant="ghost" size="sm" className="h-7 w-7 px-0 text-muted-foreground hover:text-red-500" onClick={() => del.mutate(h.id)} aria-label={ar ? "حذف" : "Remove"}>
                                {del.isPending && del.variables === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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

            {/* sector exposure */}
            {data.sectors.length > 0 ? (
              <Card className="border-border/60 p-0">
                <CardContent className="p-4">
                  <p className="mb-3 text-sm font-semibold">{ar ? "توزيع القطاعات" : "Sector exposure"}</p>
                  <div className="space-y-2">
                    {data.sectors.map((s) => (
                      <div key={s.sector} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{s.sector}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, s.pct)}%` }} />
                        </div>
                        <span className="w-14 shrink-0 text-end text-xs font-semibold tabular">{s.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {totals!.priceGaps > 0 ? (
              <p className="text-xs text-muted-foreground italic">
                {ar ? `${totals!.priceGaps} مركز بدون سعر مسجّل — بتظهر بتكلفتها` : `${totals!.priceGaps} position(s) without a recorded price — shown at cost`}
              </p>
            ) : null}
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  )
}

function AddHolding({ ar, isPremium, count, disabled }: { ar: boolean; isPremium: boolean; count: number; disabled: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [picked, setPicked] = useState<{ id: string; ticker: string; nameEn: string } | null>(null)
  const [quantity, setQuantity] = useState("")
  const [avgCost, setAvgCost] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [debounceId, setDebounceId] = useState<ReturnType<typeof setTimeout> | null>(null)

  const { data: results } = useQuery({
    queryKey: ["portfolio-search", debounced],
    queryFn: () => fetch(`/api/v1/companies?search=${encodeURIComponent(debounced)}&pageSize=6`).then((r) => (r.ok ? r.json() : { companies: [] })),
    enabled: debounced.length >= 2,
  })

  const add = useMutation({
    mutationFn: () =>
      fetch("/api/v1/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ companyId: picked?.id, quantity: Number(quantity), avgCost: Number(avgCost) }),
      }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) })),
    onSuccess: ({ ok, body }) => {
      if (ok) {
        setOpen(false)
        setPicked(null)
        setQuantity("")
        setAvgCost("")
        setMsg(null)
        qc.invalidateQueries({ queryKey: ["portfolio"] })
      } else {
        setMsg(body?.message ?? (ar ? "حصل خطأ" : "Something went wrong"))
      }
    },
  })

  function onSearch(v: string) {
    setSearch(v)
    if (debounceId) clearTimeout(debounceId)
    setDebounceId(setTimeout(() => setDebounced(v.trim()), 250))
  }

  const limitReached = !isPremium && count >= 2

  return (
    <div className="relative">
      <Button onClick={() => setOpen((o) => !o)} disabled={disabled}>
        <Plus className="h-4 w-4" />
        {ar ? "مركز جديد" : "New position"}
      </Button>
      {open ? (
        <div className="absolute end-0 top-full z-40 mt-2 w-80 rounded-xl border border-border/60 bg-card p-4 shadow-lg shadow-black/10">
          {limitReached && !picked ? (
            <div className="space-y-2 text-xs">
              <p className="font-medium text-amber-700 dark:text-amber-400">{ar ? "وصلت حد الخطة المجانية (مركزين)" : "Free plan limit reached (2 positions)"}</p>
              <a href="/premium" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">{ar ? "ترقية لبريميوم — بلا حدود ←" : "Upgrade to Premium — unlimited →"}</a>
            </div>
          ) : !picked ? (
            <>
              <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={ar ? "ابحث عن شركة…" : "Search company…"} className="h-9 text-sm" />
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {(results?.companies ?? []).map((c: { id: string; ticker: string; nameEn: string; nameAr: string | null }) => (
                  <button
                    key={c.id}
                    onClick={() => setPicked({ id: c.id, ticker: c.ticker, nameEn: c.nameEn })}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs transition-colors hover:bg-muted/60"
                  >
                    <span className="font-bold">{c.ticker}</span>
                    <span className="truncate text-muted-foreground">{ar ? c.nameAr ?? c.nameEn : c.nameEn}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{picked.ticker}</span>
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setPicked(null)}>{ar ? "تغيير" : "Change"}</Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">{ar ? "الكمية" : "Quantity"}</span>
                  <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" className="h-8 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">{ar ? "متوسط التكلفة (EGP)" : "Avg cost (EGP)"}</span>
                  <Input value={avgCost} onChange={(e) => setAvgCost(e.target.value)} inputMode="decimal" className="h-8 text-sm" />
                </label>
              </div>
              {msg ? <p className="text-[11px] text-red-500">{msg}</p> : null}
              <Button className="w-full" size="sm" disabled={!quantity || !avgCost || add.isPending} onClick={() => add.mutate()}>
                {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : ar ? "حفظ المركز" : "Save position"}
              </Button>
              {!isPremium ? <p className="text-[10px] text-muted-foreground">{ar ? `الخطة المجانية: مركزين (${count}/2)` : `Free plan: 2 positions (${count}/2)`}</p> : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
