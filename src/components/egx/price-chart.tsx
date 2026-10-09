"use client"

// Price history chart — renders harvested MarketPrice snapshots (never interpolated:
// each point is a real stored price with its source), so gaps are real gaps.

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/lib/i18n"

interface PricePoint {
  asOf: string
  price: number
  currency: string
  sourceName: string
}

const RANGES = [
  { key: "6m", months: 6 },
  { key: "1y", months: 12 },
  { key: "all", months: 0 },
] as const

function fmtEgp(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return v.toFixed(2)
}

export function PriceChart({ companyId, height = 240 }: { companyId: string; height?: number }) {
  const { t, lang } = useI18n()
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("1y")
  const { data, isLoading } = useQuery({
    queryKey: ["prices", companyId],
    queryFn: () => fetch(`/api/v1/companies/${companyId}/prices`).then((r) => (r.ok ? (r.json() as Promise<{ prices: PricePoint[] }>) : { prices: [] as PricePoint[] })),
    staleTime: 300_000,
  })

  const series = useMemo(() => {
    const rows = (data?.prices ?? []).map((p) => ({ ...p, ts: new Date(p.asOf).getTime() }))
    if (range !== "all") {
      const months = RANGES.find((r) => r.key === range)!.months
      const cutoff = Date.now() - months * 30 * 24 * 3600 * 1000
      const sliced = rows.filter((r) => r.ts >= cutoff)
      // keep at least the last two points so the change badge stays meaningful
      return sliced.length >= 2 ? sliced : rows.slice(-2)
    }
    return rows
  }, [data, range])

  const first = series.length > 0 ? series[0].price : null
  const last = series.length > 0 ? series[series.length - 1].price : null
  const changePct = first && last && first !== 0 ? ((last - first) / Math.abs(first)) * 100 : null
  const changeGood = (changePct ?? 0) >= 0

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />
  if (series.length < 2) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex flex-col items-center justify-center gap-1 py-8 text-center">
          <p className="text-xs font-medium text-muted-foreground">{lang === "ar" ? "لا يوجد تاريخ سعري كافٍ لهذه الشركة بعد" : "Not enough price history for this company yet"}</p>
          {series.length === 1 ? (
            <p className="text-[11px] text-muted-foreground/70">{lang === "ar" ? "آخر سعر مسجّل" : "Latest recorded price"}: <span className="font-semibold tabular">{series[0].price.toLocaleString()} {series[0].currency}</span></p>
          ) : null}
        </CardContent>
      </Card>
    )
  }


  return (
    <Card className="border-border/60 p-0">
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2.5">
            <span className="text-2xl font-bold tabular">{last!.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span className="text-xs font-medium text-muted-foreground">{series[series.length - 1].currency}</span>
            {changePct !== null ? (
              <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular ${changeGood ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                {changeGood ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {changeGood ? "+" : ""}{changePct.toFixed(1)}%
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150 ${range === r.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60"}`}
              >
                {r.key === "all" ? (lang === "ar" ? "الكل" : "All") : r.key.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height }} dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={changeGood ? "#16a34a" : "#dc2626"} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={changeGood ? "#16a34a" : "#dc2626"} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(ts) => new Date(ts).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { month: "short", year: "2-digit" })}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v) => fmtEgp(v)}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }}
                labelFormatter={(ts) => new Date(ts as number).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}
                formatter={(value) => [`${(value as number).toLocaleString()} EGP`, lang === "ar" ? "السعر" : "Price"]}
              />
              <Area type="monotone" dataKey="price" stroke={changeGood ? "#16a34a" : "#dc2626"} strokeWidth={2.5} fill="url(#priceFill)" dot={series.length <= 30 ? { r: 2.5, fill: changeGood ? "#16a34a" : "#dc2626", strokeWidth: 0 } : false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/70">
          {lang === "ar" ? `${series.length} نقطة سعرية` : `${series.length} price snapshots`}
        </p>
      </CardContent>
    </Card>
  )
}
