"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import ReactMarkdown, { type Components } from "react-markdown"
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileX2,
  Flame,
  Info,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingUp,
  Users,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { api, type EventItem, type MetricsData, type ReportValueRow } from "@/lib/client/api"
import { useI18n, type DictKey } from "@/lib/i18n"
import { formatEgp, formatPercent, formatRatio } from "@/lib/financial/units"
import { DemoBadge, EventBadge, StarButton, StatusChip } from "./shared"

const PEER_METRICS = [
  { code: "roe", fmt: (v: number) => formatPercent(v), betterWhen: "higher" },
  { code: "net_margin", fmt: (v: number) => formatPercent(v), betterWhen: "higher" },
  { code: "revenue_growth", fmt: (v: number) => formatPercent(v, { sign: true }), betterWhen: "higher" },
  { code: "debt_to_equity", fmt: (v: number) => formatRatio(v), betterWhen: "lower" },
  { code: "net_profit", fmt: (v: number) => formatEgp(v), betterWhen: "higher" },
] as const

type SubTab = "overview" | "statements" | "growth" | "events" | "peers" | "dividends" | "reports" | "ai"

/** Bilingual label for a report statement basis (CONSOLIDATED / STANDALONE). */
function basisBadgeLabel(basis: string | null | undefined, t: (k: DictKey) => string): string {
  if (basis === "STANDALONE") return t("rp.standalone")
  if (basis === "CONSOLIDATED") return t("rp.consolidated")
  return basis ?? "—"
}

// Manual prose styling for the AI analysis markdown (no typography plugin).
const mdComponents: Components = {
  h1: ({ children }) => <h2 className="mt-5 text-base font-bold first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mt-5 text-sm font-bold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-4 text-sm font-semibold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 ps-5 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 ps-5 text-sm">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-s-2 border-border ps-3 text-sm italic text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">{children}</pre>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-md border">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  th: ({ children }) => <th className="border-b p-2 text-start font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b p-2 align-top">{children}</td>,
}

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
  const [basisOverride, setBasisOverride] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ["company", companyId], queryFn: () => api.company(companyId) })

  // Discovery query for available statement bases — shares the cache with the
  // Statements tab's default ("auto") fetch, so no extra request when both mount.
  const { data: finAvail } = useQuery({ queryKey: ["financials", companyId, "auto"], queryFn: () => api.financials(companyId) })
  const availableBases = finAvail?.availableStatementTypes ?? []
  const effectiveBasis = basisOverride ?? finAvail?.statementType ?? null

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
              {c.counts.values > 0 ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-400"
                  title={t("co.aiGrounded")}
                >
                  <ShieldCheck className="me-1 h-3 w-3" aria-hidden />
                  {t("co.trustBadge")}
                </Badge>
              ) : null}
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
                    title={m.basis === "LATEST_TTM" ? t("sc.basisTtm") : m.basis === "LATEST_QUARTERLY" ? t("sc.basisQuarterly") : t("sc.basisAnnual")}
                  >
                    {pick(m.name, m.nameAr)} · {m.basis === "LATEST_TTM" ? "TTM" : m.basis === "LATEST_QUARTERLY" ? "Q" : "FY"}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {availableBases.length > 1 ? (
        <StatementBasisToggle available={availableBases} value={effectiveBasis} onSelect={setBasisOverride} />
      ) : null}

      <Tabs value={sub} onValueChange={(v) => setSub(v as SubTab)}>
        <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap sm:flex-nowrap">
          <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />{t("co.keyMetrics")}</TabsTrigger>
          <TabsTrigger value="statements" className="gap-1.5"><Table2 className="h-3.5 w-3.5" />{t("co.statements")}</TabsTrigger>
          <TabsTrigger value="growth" className="gap-1.5"><Flame className="h-3.5 w-3.5" />{t("co.growth")}</TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5"><Flame className="h-3.5 w-3.5" />{t("co.events")} ({c.counts.events})</TabsTrigger>
          <TabsTrigger value="peers" className="gap-1.5"><Users className="h-3.5 w-3.5" />{t("peers.tab")}</TabsTrigger>
          <TabsTrigger value="dividends" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{t("co.dividends")}</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><FileText className="h-3.5 w-3.5" />{t("co.reports")} ({c.counts.reports})</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />{t("co.aiAnalysis")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab companyId={companyId} basis={basisOverride} />
        </TabsContent>
        <TabsContent value="statements" className="mt-4">
          <StatementsTab companyId={companyId} basis={basisOverride} />
        </TabsContent>
        <TabsContent value="growth" className="mt-4">
          <GrowthTab companyId={companyId} basis={basisOverride} />
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
        <TabsContent value="ai" className="mt-4">
          <AiAnalysisTab companyId={companyId} />
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

/* ---------------- Statement basis toggle ---------------- */

function StatementBasisToggle({
  available,
  value,
  onSelect,
}: {
  available: string[]
  value: string | null
  onSelect: (basis: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">{t("co.statementBasis")}</span>
      <div className="inline-flex rounded-lg border bg-muted/30 p-0.5" role="group" aria-label={t("co.statementBasis")}>
        {available.map((bt) => {
          const active = value === bt
          return (
            <button
              key={bt}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(bt)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {basisBadgeLabel(bt, t)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Empty state (no verified financial data) ---------------- */

function NoFinancialsEmpty({ bare = false }: { bare?: boolean }) {
  const { t } = useI18n()
  const inner = (
    <div className={`flex flex-col items-center justify-center gap-3 text-center ${bare ? "p-10" : ""}`}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <FileX2 className="h-7 w-7 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold">{t("co.noFinancials")}</p>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">{t("co.noFinancialsSub")}</p>
      </div>
    </div>
  )
  if (bare) return inner
  return (
    <Card className="p-0">
      <CardContent className="p-0">{inner}</CardContent>
    </Card>
  )
}

/* ---------------- Overview tab ---------------- */

function OverviewTab({ companyId, basis }: { companyId: string; basis: string | null }) {
  const { t, lang } = useI18n()
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["metrics", companyId, basis ?? "auto"],
    queryFn: () => api.metrics(companyId, basis ?? undefined),
  })

  if (isLoading || !metrics) return <Skeleton className="h-64 rounded-xl" />
  if (metrics.periods.length === 0 && metrics.rows.length === 0) return <NoFinancialsEmpty />

  const sortedPeriods = [...metrics.periods].sort((a, b) => a.key.localeCompare(b.key))
  const annualPeriods = sortedPeriods.filter((p) => p.periodType === "ANNUAL")
  const quarterlyPeriods = sortedPeriods.filter((p) => p.periodType === "QUARTERLY")
  // Prefer annual periods for the headline cards; fall back to quarterly when the
  // company only files interim statements (missing values still show "—", never zeros).
  const cardPeriods = annualPeriods.length > 0 ? annualPeriods : quarterlyPeriods.length > 0 ? quarterlyPeriods : sortedPeriods
  const latest = cardPeriods[cardPeriods.length - 1]

  const getCell = (code: string) => (latest ? metrics.rows.find((r) => r.code === code)?.cells[latest.key] : undefined)

  const cards: { code: string; label: string; fmt: (v: number) => string; invert?: boolean }[] = [
    { code: "revenue", label: t("co.revenue"), fmt: (v) => formatEgp(v) },
    { code: "net_profit", label: t("co.netProfit"), fmt: (v) => formatEgp(v), invert: true },
    { code: "roe", label: t("co.roe"), fmt: (v) => formatPercent(v) },
    { code: "total_assets", label: t("co.assets"), fmt: (v) => formatEgp(v) },
    { code: "debt_to_equity", label: t("co.growth") + " D/E", fmt: (v) => formatRatio(v) },
    { code: "eps", label: "EPS", fmt: (v) => `EGP ${v.toFixed(2)}` },
  ]

  // trend chart data (revenue & net profit over annual periods, or quarterly when no annual exist)
  const revenueRow = metrics.rows.find((r) => r.code === "revenue")
  const profitRow = metrics.rows.find((r) => r.code === "net_profit")
  const trendPeriods = annualPeriods.length > 0 ? annualPeriods : quarterlyPeriods
  const trend = trendPeriods.map((p) => ({
    label: p.label.replace(/^FY\s*/, ""),
    revenue: revenueRow?.cells[p.key]?.value ?? null,
    profit: profitRow?.cells[p.key]?.value ?? null,
  }))
  const trendIsAnnual = annualPeriods.length > 0

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
                      {cell?.detail || t("co.notAvailable")}
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

      {/* market snapshot (only when an observed price point exists) */}
      <MarketSnapshot metrics={metrics} companyId={companyId} />

      {/* trend chart */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {lang === "ar"
              ? trendIsAnnual
                ? "اتجاه الإيرادات وصافي الربح (سنوي)"
                : "اتجاه الإيرادات وصافي الربح (ربعي)"
              : trendIsAnnual
                ? "Revenue & net profit trend (annual, EGP)"
                : "Revenue & net profit trend (quarterly, EGP)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart data={trend} />
        </CardContent>
      </Card>
    </div>
  )
}

/* ---------------- Market snapshot ---------------- */

function MarketSnapshot({ metrics, companyId }: { metrics: MetricsData; companyId: string }) {
  const { t } = useI18n()
  const { data: detail } = useQuery({ queryKey: ["company", companyId], queryFn: () => api.company(companyId) })

  // prefer the latest TTM window (most current trailing fundamentals), then the latest
  // annual, then the latest quarterly period for interim-only filers
  const ttmPeriods = metrics.periods.filter((p) => p.periodType === "TTM").sort((a, b) => a.key.localeCompare(b.key))
  const annualPeriods = metrics.periods.filter((p) => p.periodType === "ANNUAL").sort((a, b) => a.key.localeCompare(b.key))
  const quarterlyPeriods = metrics.periods.filter((p) => p.periodType === "QUARTERLY").sort((a, b) => a.key.localeCompare(b.key))
  const basis = ttmPeriods[ttmPeriods.length - 1] ?? annualPeriods[annualPeriods.length - 1] ?? quarterlyPeriods[quarterlyPeriods.length - 1]
  if (!basis) return null

  const getCell = (code: string) => metrics.rows.find((r) => r.code === code)?.cells[basis.key]

  const cards: { code: string; label: string; fmt: (v: number) => string }[] = [
    { code: "market_cap", label: t("co.marketCap"), fmt: (v) => formatEgp(v) },
    { code: "p_b", label: t("co.pb"), fmt: (v) => formatRatio(v) },
    { code: "p_e", label: t("co.pe"), fmt: (v) => formatRatio(v) },
    { code: "dividend_yield", label: t("co.yield"), fmt: (v) => formatPercent(v) },
  ]

  const mp = detail?.marketPrice ?? null

  return (
    <Card className="p-0">
      <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          {t("co.market")}
        </CardTitle>
        {mp ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-baseline gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 cursor-help">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("co.price")}</span>
                  <span className="text-sm font-bold tabular text-primary">
                    {mp.price.toFixed(2)} <span className="text-[10px] font-normal">{mp.currency}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t("co.asOf")} {new Date(mp.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-56 text-[11px]">
                {mp.sourceName}
                {mp.isDemoData ? ` — ${t("co.demoPrice")}` : ""}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => {
            const cell = getCell(card.code)
            const unavailable = !cell || cell.status !== "OK" || cell.value === null
            return (
              <div key={card.code} className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
                {unavailable ? (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-400">
                          — <Info className="h-3 w-3" />
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-64 text-[11px]">
                        {cell?.detail || t("co.notAvailable")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <p className="mt-1 text-sm font-bold tabular">{card.fmt(cell.value as number)}</p>
                )}
                <p className="mt-0.5 text-[9px] text-muted-foreground/70">{cell?.formulaVersion ?? ""}</p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function TrendChart({ data }: { data: { label: string; revenue: number | null; profit: number | null }[] }) {
  if (data.length === 0) return null
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

function StatementsTab({ companyId, basis }: { companyId: string; basis: string | null }) {
  const { t, lang } = useI18n()
  const { data, isLoading } = useQuery({
    queryKey: ["financials", companyId, basis ?? "auto"],
    queryFn: () => api.financials(companyId, basis ?? undefined),
  })
  const [stmt, setStmt] = useState<"INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW">("INCOME_STATEMENT")
  const [traceId, setTraceId] = useState<string | null>(null)

  if (isLoading || !data) return <Skeleton className="h-72 rounded-xl" />

  const rows = data.statements[stmt] ?? []
  const periods = [...data.periods].sort((a, b) => a.key.localeCompare(b.key))
  const hasAnyRows = Object.values(data.statements).some((section) => section.length > 0)
  const shownBasis = data.statementType ?? basis ?? null

  const stmtTabs = [
    { key: "INCOME_STATEMENT", label: t("co.incomeStatement") },
    { key: "BALANCE_SHEET", label: t("co.balanceSheet") },
    { key: "CASH_FLOW", label: t("co.cashFlow") },
  ] as const

  return (
    <>
      <Card className="p-0">
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            {t("co.statements")}
            {shownBasis ? <Badge variant="outline" className="text-[10px]">{basisBadgeLabel(shownBasis, t)}</Badge> : null}
            <span className="hidden text-[10px] font-normal text-muted-foreground lg:inline">
              {lang === "ar" ? "اضغط على أي قيمة لعرض المستند المصدر" : "Click any value to inspect its source document"}
            </span>
          </CardTitle>
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
          {data.periods.length === 0 || !hasAnyRows ? (
            <NoFinancialsEmpty bare />
          ) : rows.length === 0 ? (
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
                            {cell ? (
                              <button
                                type="button"
                                onClick={() => setTraceId(cell.reportId)}
                                title={t("co.source")}
                                className="underline-offset-2 transition-colors hover:text-primary hover:underline"
                              >
                                {formatEgp(cell.normalizedValue, { withCurrency: false })}
                              </button>
                            ) : (
                              "—"
                            )}
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
      <ReportTraceDialog reportId={traceId} onClose={() => setTraceId(null)} />
    </>
  )
}

/* ---------------- Per-value source traceability ---------------- */

function ReportTraceDialog({ reportId, onClose }: { reportId: string | null; onClose: () => void }) {
  const { t, lang } = useI18n()
  const { data, isLoading, isError } = useQuery({
    queryKey: ["report-detail", reportId],
    queryFn: () => api.reportDetail(reportId ?? ""),
    enabled: !!reportId,
  })
  const report = data?.report
  return (
    <Dialog open={!!reportId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" aria-hidden />
            {t("co.source")}
            {report ? <span className="font-normal text-muted-foreground">— {report.periodLabel}</span> : null}
            {report ? <StatusChip status={report.processingStatus} /> : null}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {lang === "ar"
              ? "القيم كما استُخرجت من مستند المصدر — دون أي تعديل أو تقدير."
              : "Values exactly as extracted from the source document — unmodified, never estimated."}
          </DialogDescription>
        </DialogHeader>
        {isError ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            {lang === "ar" ? "تعذر تحميل القيم المستخرجة." : "Could not load the extracted values."}
          </p>
        ) : isLoading || !report ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="-mx-1 flex-1 overflow-y-auto px-1 pb-1">
            <ReportValuesTable values={report.values} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReportValuesTable({ values }: { values: ReportValueRow[] }) {
  const { t, lang } = useI18n()
  if (values.length === 0) {
    return <p className="p-4 text-center text-xs text-muted-foreground">{t("common.noData")}</p>
  }
  return (
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
          {values.map((v) => (
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
  )
}

/* ---------------- Growth & ratios tab ---------------- */

function GrowthTab({ companyId, basis }: { companyId: string; basis: string | null }) {
  const { t, lang } = useI18n()
  const { data, isLoading } = useQuery({
    queryKey: ["metrics", companyId, basis ?? "auto"],
    queryFn: () => api.metrics(companyId, basis ?? undefined),
  })

  if (isLoading || !data) return <Skeleton className="h-72 rounded-xl" />

  const periods = [...data.periods].sort((a, b) => a.key.localeCompare(b.key))
  const interesting = data.rows.filter((r) => r.kind !== "passthrough")
  const shownBasis = data.statementType ?? basis ?? null

  const fmtCell = (code: string, value: number | null) => {
    const row = data.rows.find((r) => r.code === code)
    if (value === null) return null
    if (row?.unit === "PERCENT") return formatPercent(value)
    if (row?.unit === "RATIO") return formatRatio(value)
    if (row?.unit === "EGP_PER_SHARE") return `EGP ${value.toFixed(2)}`
    if (row?.unit === "EGP") return formatEgp(value, { withCurrency: false })
    return value.toFixed(2)
  }

  return (
    <Card className="p-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          {t("co.growth")}
          {shownBasis ? <Badge variant="outline" className="text-[10px]">{basisBadgeLabel(shownBasis, t)}</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.periods.length === 0 || interesting.length === 0 ? (
          <NoFinancialsEmpty bare />
        ) : (
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
                                  {cell?.detail || t("co.notAvailable")}
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
        )}
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

/* ---------------- Documents + Reports tab (source traceability) ---------------- */

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path below
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function CopyHashButton({ hash }: { hash: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(hash)
        if (ok) {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }
      }}
      title={t("co.fileHash")}
      aria-label={t("co.fileHash")}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
    </button>
  )
}

function DocumentsTable({ companyId }: { companyId: string }) {
  const { t, lang } = useI18n()
  const { data, isLoading } = useQuery({ queryKey: ["company-documents", companyId], queryFn: () => api.companyDocuments(companyId) })

  if (isLoading) return <Skeleton className="h-40 rounded-xl" />
  const docs = data?.documents ?? []
  if (docs.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" aria-hidden />
        {t("co.documentsEmpty")}
      </div>
    )
  }

  const headers = [
    lang === "ar" ? "الملف" : "File",
    lang === "ar" ? "الفترة" : "Period",
    lang === "ar" ? "الأساس" : "Basis",
    t("common.status"),
    t("co.confidence"),
    lang === "ar" ? "القيم" : "Values",
    t("co.version"),
    lang === "ar" ? "الاعتماد" : "Approved",
    "SHA-256",
    "",
  ]

  return (
    <div className="overflow-x-auto scrollbar-thin rounded-lg border">
      <table className="w-full min-w-[1040px] text-xs">
        <thead className="bg-muted/40">
          <tr className="border-b">
            {headers.map((h, i) => (
              <th key={i} className="whitespace-nowrap p-2.5 text-start font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <tr key={doc.id} className="border-b last:border-0 align-top hover:bg-muted/30">
              <td className="p-2.5">
                <p className="max-w-44 break-all font-medium">{doc.fileName ?? <span className="text-slate-400">{t("co.notAvailable")}</span>}</p>
                {doc.fileSize != null ? (
                  <p className="mt-0.5 text-[10px] tabular text-muted-foreground">{(doc.fileSize / 1024).toFixed(1)} KB</p>
                ) : null}
              </td>
              <td className="p-2.5 whitespace-nowrap font-medium">{doc.periodLabel}</td>
              <td className="p-2.5">
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">{basisBadgeLabel(doc.statementType, t)}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{doc.language}</Badge>
                </div>
              </td>
              <td className="p-2.5"><StatusChip status={doc.processingStatus} /></td>
              <td className="p-2.5 text-end tabular">
                {doc.extractionConfidence != null ? `${Math.round(doc.extractionConfidence * 100)}%` : <span className="text-slate-400">—</span>}
              </td>
              <td className="p-2.5 text-end tabular">
                {doc.valueCount} <span className="text-[9px] text-muted-foreground">{t("co.values")}</span>
              </td>
              <td className="p-2.5">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="tabular">v{doc.version}</span>
                  {doc.isRestatement ? (
                    <Badge variant="outline" className="border-violet-400/50 text-[9px] text-violet-600 dark:text-violet-300">RESTATED</Badge>
                  ) : null}
                </div>
                {doc.parserVersion ? <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">{doc.parserVersion}</p> : null}
              </td>
              <td className="p-2.5 whitespace-nowrap tabular">
                {fmt(doc.approvedAt) ?? <span className="text-slate-400">—</span>}
              </td>
              <td className="p-2.5">
                {doc.fileHash ? (
                  <span className="inline-flex items-center gap-0.5">
                    <span className="font-mono text-[10px]">{doc.fileHash.slice(0, 12)}</span>
                    <CopyHashButton hash={doc.fileHash} />
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="p-2.5">
                <div className="flex items-center justify-end gap-1.5">
                  {doc.sourceUrl ? (
                    <a
                      href={doc.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={t("co.viewDoc")}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">{t("co.viewDoc")}</span>
                    </a>
                  ) : null}
                  {doc.hasFile ? (
                    <a href={api.downloadReportUrl(doc.id)} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        {t("co.downloadDoc")}
                      </Button>
                    </a>
                  ) : (
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled>
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      {t("co.downloadDoc")}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReportsTab({ companyId }: { companyId: string }) {
  const { t, lang, pick } = useI18n()
  const { data, isLoading } = useQuery({ queryKey: ["company-reports", companyId], queryFn: () => api.companyReports(companyId) })
  const [open, setOpen] = useState<string | null>(null)

  const { data: reportDetail, isError: detailError } = useQuery({
    queryKey: ["report-detail", open],
    queryFn: () => api.reportDetail(open ?? ""),
    enabled: !!open,
  })

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />
  const reports = data?.reports ?? []

  return (
    <div className="space-y-5">
      {/* source documents (upload → extract → validate → approve pipeline) */}
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="h-4 w-4 text-primary" aria-hidden />
          {t("co.documents")}
          <span className="text-xs font-normal text-muted-foreground">({lang === "ar" ? "مصدر كل رقم" : "the source behind every figure"})</span>
        </h3>
        <DocumentsTable companyId={companyId} />
      </section>

      {/* extracted reports with per-value traceability */}
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Table2 className="h-4 w-4 text-primary" aria-hidden />
          {t("co.reports")}
        </h3>
        {reports.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
        ) : (
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
                {open === r.id ? (
                  detailError ? (
                    <p className="border-t p-4 text-center text-xs text-muted-foreground">
                      {lang === "ar" ? "تعذر تحميل القيم المستخرجة." : "Could not load the extracted values."}
                    </p>
                  ) : reportDetail?.report ? (
                    <div className="border-t p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        {r.fileHash ? (
                          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="break-all font-mono">
                              {t("co.fileHash")}: {r.fileHash}
                            </span>
                            <CopyHashButton hash={r.fileHash} />
                          </p>
                        ) : <span />}
                        {r.localFileRef ? (
                          <a href={api.downloadReportUrl(r.id)} download>
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                              <Download className="h-3.5 w-3.5" aria-hidden />
                              {t("rp.download")}
                            </Button>
                          </a>
                        ) : null}
                      </div>
                      {r.notes ? <p className="mb-3 text-[11px] text-muted-foreground">{r.notes}</p> : null}
                      <ReportValuesTable values={reportDetail.report.values} />
                    </div>
                  ) : (
                    <div className="border-t p-4">
                      <Skeleton className="h-40 w-full" />
                    </div>
                  )
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/* ---------------- AI analysis tab ---------------- */

function AiLoadingPanel() {
  const { t, lang } = useI18n()
  return (
    <Card className="p-0">
      <CardContent className="flex flex-col items-center justify-center gap-4 p-10 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping" aria-hidden />
          <span className="absolute inset-2 rounded-full bg-primary/10 animate-pulse" aria-hidden />
          <Sparkles className="relative h-7 w-7 text-primary" aria-hidden />
        </div>
        <p className="text-sm font-semibold">{t("co.aiLoading")}</p>
        <div className="flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {lang === "ar"
            ? "يقرأ النموذج القيم المالية الموثقة من قاعدة البيانات فقط. قد تستغرق العملية حتى دقيقة."
            : "The model reads only verified financial values from the database. This can take up to a minute."}
        </p>
      </CardContent>
    </Card>
  )
}

function AiAnalysisTab({ companyId }: { companyId: string }) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["ai-analysis", companyId], queryFn: () => api.aiAnalysis(companyId) })

  const generate = useMutation({
    mutationFn: () => api.generateAiAnalysis(companyId, lang),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-analysis", companyId] })
    },
  })

  const err = generate.error as (Error & { status?: number }) | null
  const noData = !!err && (err.status === 400 || /NO_DATA/i.test(err.message))
  const analysis = data?.analysis ?? null

  if (isLoading) return <Skeleton className="h-72 rounded-xl" />
  if (generate.isPending) return <AiLoadingPanel />

  return (
    <div className="space-y-3">
      {err ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>{noData ? t("co.aiNoData") : t("co.aiFailed")}</AlertTitle>
          {!noData && err.message ? <AlertDescription className="font-mono text-xs">{err.message}</AlertDescription> : null}
        </Alert>
      ) : null}

      {analysis ? (
        <Card className="p-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              {t("co.aiAnalysis")}
              {analysis.model ? <Badge variant="secondary" className="font-mono text-[10px]">{analysis.model}</Badge> : null}
              <span className="text-[11px] font-normal text-muted-foreground">{fmt(analysis.createdAt)}</span>
              <Badge variant="outline" className="font-mono text-[9px]" title={analysis.dataHash}>
                {analysis.dataHash.slice(0, 10)}
              </Badge>
            </CardTitle>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => generate.mutate()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {t("co.aiRegenerate")}
            </Button>
          </CardHeader>
          <CardContent>
            <div dir={lang === "ar" ? "rtl" : "ltr"}>
              <ReactMarkdown components={mdComponents}>{analysis.content}</ReactMarkdown>
            </div>
          </CardContent>
          <div className="border-t px-6 py-3">
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              {t("co.aiGrounded")}
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          <CardContent className="flex flex-col items-center justify-center gap-4 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">{t("co.aiEmpty")}</p>
            <Button size="sm" className="gap-1.5" onClick={() => generate.mutate()}>
              <Sparkles className="h-4 w-4" aria-hidden />
              {t("co.aiGenerate")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
