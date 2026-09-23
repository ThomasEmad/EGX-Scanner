"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, BarChart3, CalendarDays, Download, FileText, Flame, Info, ScanSearch, Table2, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { api, type EventItem } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"
import { formatEgp, formatPercent, formatRatio } from "@/lib/financial/units"
import { DemoBadge, EventBadge, StarButton, StatusChip } from "./shared"

const PEER_METRICS = [
  { code: "roe", fmt: (v: number) => formatPercent(v), betterWhen: "higher" },
  { code: "net_margin", fmt: (v: number) => formatPercent(v), betterWhen: "higher" },
  { code: "revenue_growth", fmt: (v: number) => formatPercent(v, { sign: true }), betterWhen: "higher" },
  { code: "debt_to_equity", fmt: (v: number) => formatRatio(v), betterWhen: "lower" },
  { code: "net_profit", fmt: (v: number) => formatEgp(v), betterWhen: "higher" },
] as const

type SubTab = "overview" | "statements" | "growth" | "events" | "peers" | "dividends" | "reports"

export function CompanyDetail({
  companyId,
  onBack,
  onOpenScanner,
}: {
  companyId: string
  onBack: () => void
  onOpenScanner: (ruleId: string) => void
}) {
  const { t, lang, pick } = useI18n()
  const [sub, setSub] = useState<SubTab>("overview")

  const { data, isLoading } = useQuery({ queryKey: ["company", companyId], queryFn: () => api.company(companyId) })

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const c = data.company

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 rtl-flip" />
        {t("common.back")}
      </Button>

      {/* header */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{c.ticker}</h1>
              {c.isDemoData ? <DemoBadge /> : null}
              <StatusChip status={c.listingStatus} />
              <StarButton companyId={c.id} ticker={c.ticker} className="border" />
            </div>
            <p className="mt-1 text-sm font-medium">{pick(c.nameEn, c.nameAr)}</p>
            <p className="text-xs text-muted-foreground">{lang === "ar" ? c.nameAr : c.nameEn}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-[10px]">{c.sector}</Badge>
              {c.industry ? <span>{c.industry}</span> : null}
              {c.sharesOutstanding ? (
                <span className="tabular">· {t("co.shares")}: {(c.sharesOutstanding / 1e6).toFixed(0)}M</span>
              ) : null}
            </div>
            {pick(c.descriptionEn, c.descriptionAr) !== "—" ? (
              <p className="mt-2 max-w-2xl text-xs text-muted-foreground leading-relaxed">{pick(c.descriptionEn, c.descriptionAr)}</p>
            ) : null}
          </div>

          {/* scanner matches */}
          <div className="min-w-0 md:max-w-xs">
            <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold">
              <ScanSearch className="h-3.5 w-3.5 text-primary" />
              {t("co.matchedScanners")}
            </p>
            {data.matchedPresets.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t("common.noData")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.matchedPresets.map((m) => (
                  <Badge
                    key={`${m.presetKey}-${m.basis}`}
                    variant="outline"
                    className="cursor-pointer border-primary/40 bg-primary/5 text-primary hover:bg-primary/15 text-[10px]"
                    onClick={() => onOpenScannerByPresetKey(m.presetKey, onOpenScanner)}
                    title={m.basis === "LATEST_ANNUAL" ? t("sc.basisAnnual") : t("sc.basisQuarterly")}
                  >
                    {pick(m.name, m.nameAr)} · {m.basis === "LATEST_ANNUAL" ? "FY" : "Q"}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Tabs value={sub} onValueChange={(v) => setSub(v as SubTab)}>
        <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap sm:flex-nowrap">
          <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />{t("co.keyMetrics")}</TabsTrigger>
          <TabsTrigger value="statements" className="gap-1.5"><Table2 className="h-3.5 w-3.5" />{t("co.statements")}</TabsTrigger>
          <TabsTrigger value="growth" className="gap-1.5"><Flame className="h-3.5 w-3.5" />{t("co.growth")}</TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5"><Flame className="h-3.5 w-3.5" />{t("co.events")} ({c.counts.events})</TabsTrigger>
          <TabsTrigger value="peers" className="gap-1.5"><Users className="h-3.5 w-3.5" />{t("peers.tab")}</TabsTrigger>
          <TabsTrigger value="dividends" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{t("co.dividends")}</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><FileText className="h-3.5 w-3.5" />{t("co.reports")} ({c.counts.reports})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="statements" className="mt-4">
          <StatementsTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="growth" className="mt-4">
          <GrowthTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="events" className="mt-4">
          <EventsTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="peers" className="mt-4">
          <PeersTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="dividends" className="mt-4">
          <CompanyDividendsTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <ReportsTab companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function onOpenScannerByPresetKey(presetKey: string, onOpenScanner: (ruleId: string) => void) {
  // matchedPresets use presetKey; find matching rule id via scanners list is extra work —
  // instead we pass presetKey through; the scanners view auto-selects by rule id OR preset key.
  onOpenScanner(presetKey)
}

/* ---------------- Overview tab ---------------- */

function OverviewTab({ companyId }: { companyId: string }) {
  const { t, lang } = useI18n()
  const { data: metrics, isLoading } = useQuery({ queryKey: ["metrics", companyId], queryFn: () => api.metrics(companyId) })

  if (isLoading || !metrics) return <Skeleton className="h-64 rounded-xl" />

  const annualPeriods = metrics.periods.filter((p) => p.periodType === "ANNUAL").sort((a, b) => a.fiscalYear - b.fiscalYear)
  const latest = annualPeriods[annualPeriods.length - 1]

  const getCell = (code: string) => (latest ? metrics.rows.find((r) => r.code === code)?.cells[latest.key] : undefined)

  const cards: { code: string; label: string; fmt: (v: number) => string; invert?: boolean }[] = [
    { code: "revenue", label: t("co.revenue"), fmt: (v) => formatEgp(v) },
    { code: "net_profit", label: t("co.netProfit"), fmt: (v) => formatEgp(v), invert: true },
    { code: "roe", label: t("co.roe"), fmt: (v) => formatPercent(v) },
    { code: "total_assets", label: t("co.assets"), fmt: (v) => formatEgp(v) },
    { code: "debt_to_equity", label: t("co.growth") + " D/E", fmt: (v) => formatRatio(v) },
    { code: "eps", label: "EPS", fmt: (v) => `EGP ${v.toFixed(2)}` },
  ]

  // trend chart data (revenue & net profit over annual periods)
  const revenueRow = metrics.rows.find((r) => r.code === "revenue")
  const profitRow = metrics.rows.find((r) => r.code === "net_profit")
  const trend = annualPeriods.map((p) => ({
    label: p.label.replace("FY ", ""),
    revenue: revenueRow?.cells[p.key]?.value ?? null,
    profit: profitRow?.cells[p.key]?.value ?? null,
  }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => {
          const cell = getCell(card.code)
          const unavailable = !cell || cell.status !== "OK" || cell.value === null
          return (
            <Card key={card.code} className="p-3">
              <p className="text-[11px] text-muted-foreground leading-tight">{card.label}</p>
              {unavailable ? (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-slate-400">
                        — <Info className="h-3 w-3" />
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56 text-[11px]">
                      {cell?.detail || t("sc.dataUnavailable")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <p className={`mt-1.5 text-sm font-bold tabular ${card.invert && (cell.value as number) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                  {card.fmt(cell.value as number)}
                </p>
              )}
              {latest ? <p className="mt-0.5 text-[10px] text-muted-foreground">{latest.label}</p> : null}
            </Card>
          )
        })}
      </div>

      {/* trend chart */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{lang === "ar" ? "اتجاه الإيرادات وصافي الربح (سنوي)" : "Revenue & net profit trend (annual, EGP)"}</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart data={trend} />
        </CardContent>
      </Card>
    </div>
  )
}

function TrendChart({ data }: { data: { label: string; revenue: number | null; profit: number | null }[] }) {
  const max = Math.max(...data.flatMap((d) => [d.revenue ?? 0, d.profit ?? 0]), 1)
  return (
    <div className="flex items-end gap-6 sm:gap-10 px-2 pt-4 pb-1" dir="ltr">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-36 w-full max-w-16 items-end justify-center gap-1.5">
            <div className="relative flex h-full w-6 items-end">
              <div
                className="w-full rounded-t bg-primary/70 transition-all"
                style={{ height: `${Math.max(2, ((d.revenue ?? 0) / max) * 100)}%` }}
                title={`Revenue: ${formatEgp(d.revenue)}`}
              />
            </div>
            <div className="relative flex h-full w-6 items-end">
              <div
                className={`w-full rounded-t transition-all ${(d.profit ?? 0) < 0 ? "bg-red-400" : "bg-emerald-400"}`}
                style={{ height: `${Math.max(2, (Math.abs(d.profit ?? 0) / max) * 100)}%` }}
                title={`Net profit: ${formatEgp(d.profit)}`}
              />
            </div>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ---------------- Statements tab ---------------- */

function StatementsTab({ companyId }: { companyId: string }) {
  const { t, lang } = useI18n()
  const { data, isLoading } = useQuery({ queryKey: ["financials", companyId], queryFn: () => api.financials(companyId) })
  const [stmt, setStmt] = useState<"INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW">("INCOME_STATEMENT")

  if (isLoading || !data) return <Skeleton className="h-72 rounded-xl" />

  const rows = data.statements[stmt] ?? []
  const periods = [...data.periods].sort((a, b) => a.key.localeCompare(b.key))

  const stmtTabs = [
    { key: "INCOME_STATEMENT", label: t("co.incomeStatement") },
    { key: "BALANCE_SHEET", label: t("co.balanceSheet") },
    { key: "CASH_FLOW", label: t("co.cashFlow") },
  ] as const

  return (
    <Card className="p-0">
      <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm">{t("co.statements")}</CardTitle>
        <div className="flex gap-1">
          {stmtTabs.map((s) => (
            <button
              key={s.key}
              onClick={() => setStmt(s.key)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${stmt === s.key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
        ) : (
          <div className="max-h-[480px] overflow-auto scrollbar-thin">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b">
                  <th className="sticky-col sticky-col-header p-2.5 text-start font-medium text-muted-foreground min-w-40 shadow-[inset-inline-end:1px_0_0_var(--border)]">{lang === "ar" ? "البند" : "Item"}</th>
                  {periods.map((p) => (
                    <th key={p.key} className="p-2.5 text-end font-medium text-muted-foreground whitespace-nowrap">
                      {p.label}
                      <span className="ms-1 block text-[9px] font-normal">{lang === "ar" ? "ج.م" : "EGP"}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.code} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="sticky-col sticky-col-cell p-2.5 font-medium shadow-[inset-inline-end:1px_0_0_var(--border)]">
                      {row.cells[Object.keys(row.cells)[0]]?.label ?? row.code}
                    </td>
                    {periods.map((p) => {
                      const cell = row.cells[p.key]
                      return (
                        <td key={p.key} className={`p-2.5 text-end tabular whitespace-nowrap ${cell && cell.normalizedValue < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {cell ? formatEgp(cell.normalizedValue, { withCurrency: false }) : "—"}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- Growth & ratios tab ---------------- */

function GrowthTab({ companyId }: { companyId: string }) {
  const { t, lang } = useI18n()
  const { data, isLoading } = useQuery({ queryKey: ["metrics", companyId], queryFn: () => api.metrics(companyId) })

  if (isLoading || !data) return <Skeleton className="h-72 rounded-xl" />

  const periods = [...data.periods].sort((a, b) => a.key.localeCompare(b.key))
  const interesting = data.rows.filter((r) => r.kind !== "passthrough" && r.kind !== "market")

  const fmtCell = (code: string, value: number | null) => {
    const row = data.rows.find((r) => r.code === code)
    if (value === null) return null
    if (row?.unit === "PERCENT") return formatPercent(value)
    if (row?.unit === "RATIO") return formatRatio(value)
    if (row?.unit === "EGP_PER_SHARE") return `EGP ${value.toFixed(2)}`
    return value.toFixed(2)
  }

  return (
    <Card className="p-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t("co.growth")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[520px] overflow-auto scrollbar-thin">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b">
                <th className="p-2.5 text-start font-medium text-muted-foreground min-w-48">{lang === "ar" ? "المؤشر" : "Metric"}</th>
                {periods.map((p) => (
                  <th key={p.key} className="p-2.5 text-end font-medium text-muted-foreground whitespace-nowrap">{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {interesting.map((row) => (
                <tr key={row.code} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="p-2.5 font-medium">
                    {lang === "ar" ? row.labelAr : row.labelEn}
                    <span className="ms-1.5 text-[9px] text-muted-foreground/70">{row.cells[Object.keys(row.cells)[0]]?.formulaVersion ?? ""}</span>
                  </td>
                  {periods.map((p) => {
                    const cell = row.cells[p.key]
                    const text = cell ? fmtCell(row.code, cell.value) : null
                    return (
                      <td key={p.key} className="p-2.5 text-end tabular whitespace-nowrap">
                        {cell && cell.status === "OK" && text ? (
                          <span className={/^[-]/.test(text.trim()) ? "text-red-600 dark:text-red-400" : ""}>{text}</span>
                        ) : (
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-slate-400">—</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-56 text-[11px]">
                                {cell?.detail || t("sc.dataUnavailable")}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
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
  )
}

/* ---------------- Events tab ---------------- */

export function EventsList({ events, emptyText }: { events: EventItem[]; emptyText: string }) {
  const { pick } = useI18n()
  if (events.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">{emptyText}</p>
  }
  const toneBorder: Record<string, string> = {
    positive: "border-s-4 border-s-emerald-500/70",
    negative: "border-s-4 border-s-red-500/70",
    neutral: "border-s-4 border-s-slate-400/60",
  }
  return (
    <div className="max-h-[560px] space-y-3 overflow-y-auto scrollbar-thin pe-1">
      {events.map((e) => (
        <div key={e.id} className={`rounded-lg border bg-card p-4 ${toneBorder[e.tone] ?? ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <EventBadge label={pick(e.labelEn, e.labelAr)} tone={e.tone} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{e.periodLabel}</span>
              {e.previousPeriodKey ? (
                <span className="tabular">
                  vs {e.previousPeriodKey.split(":").filter(Boolean).slice(1).join(" ")}
                </span>
              ) : null}
              <Badge variant="outline" className="text-[9px] font-mono">{e.ruleVersion}</Badge>
            </div>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed">{pick(e.explanationEn, e.explanationAr)}</p>
          {e.conditions.length > 0 ? (
            <ul className="mt-2.5 space-y-1 border-t pt-2.5">
              {e.conditions.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  {pick(c.detail, c.detailAr)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/* ---------------- Peers tab ---------------- */

function PeersTab({ companyId }: { companyId: string }) {
  const { t, lang, pick } = useI18n()
  const { data, isLoading } = useQuery({ queryKey: ["peers", companyId], queryFn: () => api.peers(companyId) })

  if (isLoading || !data) return <Skeleton className="h-72 rounded-xl" />
  if (!data.period || data.peers.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">{t("peers.noData")}</Card>
  }

  return (
    <Card className="p-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex flex-wrap items-center gap-2">
          {t("peers.title")}
          <Badge variant="secondary" className="text-[10px]">{data.basis}</Badge>
          <Badge variant="outline" className="text-[10px]">{data.period.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {PEER_METRICS.map((metric) => {
          const entries = data.peers
            .map((p) => ({ peer: p, value: p.values[metric.code] ?? null }))
            .filter((e) => e.value !== null) as { peer: (typeof data.peers)[number]; value: number }[]
          if (entries.length === 0) return null
          const maxAbs = Math.max(...entries.map((e) => Math.abs(e.value)), Math.abs(data.medians[metric.code] ?? 0), 1e-9)
          const self = entries.find((e) => e.peer.isSelf)
          const med = data.medians[metric.code]
          return (
            <div key={metric.code}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold">{t(`peers.${metric.code}` as never)}</h4>
                {med !== null ? (
                  <span className="text-[11px] text-muted-foreground tabular">
                    {t("peers.median")}: <span className="font-medium text-foreground">{metric.fmt(med)}</span>
                  </span>
                ) : null}
              </div>
              <div className="space-y-1.5">
                {entries
                  .sort((a, b) => (metric.betterWhen === "higher" ? b.value - a.value : a.value - b.value))
                  .map(({ peer, value }) => {
                    const width = Math.max(2, (Math.abs(value) / maxAbs) * 100)
                    const positive = value >= 0
                    return (
                      <div key={peer.id} className="group flex items-center gap-2">
                        <span className={`w-12 shrink-0 text-[11px] font-bold tabular ${peer.isSelf ? "text-primary" : "text-muted-foreground"}`}>
                          {peer.ticker}
                        </span>
                        <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/50">
                          <div
                            className={`h-full rounded transition-all group-hover:opacity-90 ${
                              peer.isSelf
                                ? positive
                                  ? "bg-primary"
                                  : "bg-red-500"
                                : positive
                                  ? "bg-primary/35 group-hover:bg-primary/50"
                                  : "bg-red-500/40"
                            }`}
                            style={{ width: `${width}%` }}
                          />
                          {med !== null ? (
                            <div
                              className="absolute inset-y-0 w-0.5 bg-foreground/50"
                              style={{ left: `${Math.max(0, Math.min(100, (Math.abs(med) / maxAbs) * 100))}%` }}
                              title={`${t("peers.median")}: ${metric.fmt(med)}`}
                            />
                          ) : null}
                        </div>
                        <span className={`w-20 shrink-0 text-end text-[11px] tabular ${value < 0 ? "text-red-600 dark:text-red-400" : peer.isSelf ? "font-bold" : "text-muted-foreground"}`}>
                          {metric.fmt(value)}
                        </span>
                      </div>
                    )
                  })}
              </div>
              {self ? (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {t("peers.you")}: <span className="font-medium text-foreground tabular">{metric.fmt(self.value)}</span>
                  {med !== null ? (
                    <>
                      {" "}
                      · {metric.betterWhen === "higher"
                        ? self.value >= med
                          ? lang === "ar" ? "فوق الوسيط ↑" : "above median ↑"
                          : lang === "ar" ? "تحت الوسيط ↓" : "below median ↓"
                        : self.value <= med
                          ? lang === "ar" ? "أفضل من الوسيط ↓" : "better than median ↓"
                          : lang === "ar" ? "أعلى من الوسيط ↑" : "above median ↑"}
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-1.5 text-[10px] text-muted-foreground italic">{pick("This company has no data for this metric.", "لا توجد بيانات لهذه الشركة لهذا المؤشر.")}</p>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function EventsTab({ companyId }: { companyId: string }) {
  const { t } = useI18n()
  const { data, isLoading } = useQuery({ queryKey: ["events", companyId], queryFn: () => api.events(companyId) })
  if (isLoading) return <Skeleton className="h-64 rounded-xl" />
  return <EventsList events={data?.events ?? []} emptyText={t("co.noEvents")} />
}

/* ---------------- Dividends tab ---------------- */

function CompanyDividendsTab({ companyId }: { companyId: string }) {
  const { t, pick } = useI18n()
  const { data, isLoading } = useQuery({ queryKey: ["company-dividends", companyId], queryFn: () => api.companyDividends(companyId) })
  if (isLoading) return <Skeleton className="h-64 rounded-xl" />

  const dividends = data?.dividends ?? []
  if (dividends.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">{t("co.noDividends")}</Card>
  }

  return (
    <div className="space-y-3">
      {dividends.map((d) => (
        <div key={d.id} className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <StatusChip status={d.status} />
              <Badge variant="secondary" className="text-[10px]">{d.dividendType}</Badge>
              {d.dividendPerShare !== null ? (
                <span className="text-sm font-bold tabular">{d.dividendPerShare} EGP / {t("dv.dps")}</span>
              ) : null}
            </div>
            <span className="text-[11px] text-muted-foreground">{pick(d.sourceName, d.sourceName)}</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{t("dv.announcement")}</dt>
              <dd className="font-medium tabular">{fmt(d.announcementDate) ?? <span className="text-slate-400">{t("dv.notAnnounced")}</span>}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("dv.eligibility")}</dt>
              <dd className="font-medium tabular">{fmt(d.eligibilityDate) ?? <span className="text-slate-400">{t("dv.notAnnounced")}</span>}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("dv.exDate")}</dt>
              <dd className="font-medium tabular">{fmt(d.exDividendDate) ?? <span className="text-slate-400">{t("dv.notAnnounced")}</span>}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("dv.distribution")}</dt>
              <dd className="font-medium tabular">{fmt(d.distributionDate) ?? <span className="text-slate-400">{t("dv.notAnnounced")}</span>}</dd>
            </div>
          </dl>
          {d.notes ? <p className="mt-2 text-[11px] italic text-muted-foreground">{d.notes}</p> : null}
        </div>
      ))}
    </div>
  )
}

function fmt(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return iso
  }
}

/* ---------------- Reports tab (source traceability) ---------------- */

function ReportsTab({ companyId }: { companyId: string }) {
  const { t, lang, pick } = useI18n()
  const { data, isLoading } = useQuery({ queryKey: ["company-reports", companyId], queryFn: () => api.companyReports(companyId) })
  const [open, setOpen] = useState<string | null>(null)

  const { data: reportDetail } = useQuery({
    queryKey: ["report-detail", open],
    queryFn: () => fetch(`/api/v1/reports/${open}`).then((r) => r.json()),
    enabled: !!open,
  })

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />
  const reports = data?.reports ?? []

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className="rounded-lg border bg-card">
          <button className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-start hover:bg-muted/30" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold">{r.periodLabel}</span>
              <Badge variant="secondary" className="text-[10px]">{r.reportType}</Badge>
              <StatusChip status={r.processingStatus} />
              {r.isDemoData ? <DemoBadge small /> : null}
              {r.isRestatement ? <Badge variant="outline" className="text-[10px] border-violet-400/50 text-violet-600">RESTATED v{r.version}</Badge> : null}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{r.valueCount} {t("co.values")}</span>
              {r.extractionMethod ? <Badge variant="outline" className="text-[9px] font-mono">{r.extractionMethod}</Badge> : null}
              <span className="hidden sm:inline">{pick(r.sourceName, r.sourceName)}</span>
            </div>
          </button>
          {open === r.id && reportDetail?.report ? (
            <div className="border-t p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {r.fileHash ? (
                  <p className="text-[10px] text-muted-foreground font-mono break-all">
                    {t("co.fileHash")}: {r.fileHash}
                  </p>
                ) : <span />}
                {r.localFileRef ? (
                  <a href={`/api/v1/reports/${r.id}/download`} download>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                      <Download className="h-3.5 w-3.5" />
                      {t("rp.download")}
                    </Button>
                  </a>
                ) : null}
              </div>
              {r.notes ? <p className="mb-3 text-[11px] text-muted-foreground">{r.notes}</p> : null}
              <div className="max-h-80 overflow-y-auto scrollbar-thin rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                    <tr className="border-b">
                      <th className="p-2 text-start font-medium">{t("co.originalLabel")}</th>
                      <th className="p-2 text-end font-medium">{t("common.status")}</th>
                      <th className="p-2 text-end font-medium">{lang === "ar" ? "القيمة" : "Value"}</th>
                      <th className="p-2 text-end font-medium">{lang === "ar" ? "بالجنيه" : "Normalized"}</th>
                      <th className="p-2 text-end font-medium">{t("co.confidence")}</th>
                      <th className="p-2 text-end font-medium">{t("co.extraction")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportDetail.report.values ?? []).map((v: { id: string; originalLabel: string; metricCode: string; value: number; unit: string; normalizedValue: number; validationStatus: string; confidence: number; extractionMethod: string | null }) => (
                      <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-2">
                          <span className="font-medium">{v.originalLabel}</span>
                          <span className="ms-1.5 text-[9px] text-muted-foreground">({v.metricCode})</span>
                        </td>
                        <td className="p-2 text-end"><StatusChip status={v.validationStatus} /></td>
                        <td className="p-2 text-end tabular">{v.value.toLocaleString()} <span className="text-[9px] text-muted-foreground">{v.unit}</span></td>
                        <td className="p-2 text-end tabular">{formatEgp(v.normalizedValue, { withCurrency: false })}</td>
                        <td className="p-2 text-end tabular">{(v.confidence * 100).toFixed(0)}%</td>
                        <td className="p-2 text-end text-[10px] font-mono">{v.extractionMethod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
