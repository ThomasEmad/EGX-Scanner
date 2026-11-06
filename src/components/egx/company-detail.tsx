"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import ReactMarkdown, { type Components } from "react-markdown"
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ChartBar,
  Check,
  Copy,
  Crown,
  Download,
  ExternalLink,
  FileText,
  FileX2,
  Flame,
  HeartPulse,
  Info,
  Languages,
  Lock,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  ScanSearch,
  Scale,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PremiumGate } from "@/components/egx/premium-gate"
import { HealthTab } from "@/components/egx/health-tab"
import { PriceChart } from "@/components/egx/price-chart"
import { QaBox } from "@/components/egx/qa-box"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { api, type AiChatMessage, type EventItem, type MetricsData } from "@/lib/client/api"
import { useI18n, type DictKey } from "@/lib/i18n"
import { formatEgp, formatPercent, formatRatio } from "@/lib/financial/units"
import { RAW_METRIC_MAP } from "@/lib/financial/registry"
import { TEMP_EDIT_MODE } from "@/lib/temp-edit"
import { useToast } from "@/hooks/use-toast"
import { DemoBadge, EventBadge, StarButton, StatusChip } from "./shared"

const PEER_METRICS = [
  { code: "roe", fmt: (v: number) => formatPercent(v), betterWhen: "higher" },
  { code: "net_margin", fmt: (v: number) => formatPercent(v), betterWhen: "higher" },
  { code: "debt_to_equity", fmt: (v: number) => formatRatio(v), betterWhen: "lower" },
  { code: "net_profit", fmt: (v: number) => formatEgp(v), betterWhen: "higher" },
  // bank-sector metrics (server picks the set per sector)
  { code: "roa", fmt: (v: number) => formatPercent(v), betterWhen: "higher" },
  { code: "book_value_per_share", fmt: (v: number) => `EGP ${v.toFixed(2)}`, betterWhen: "higher" },
  { code: "p_b", fmt: (v: number) => formatRatio(v), betterWhen: "lower" },
] as const

type SubTab = "overview" | "statements" | "health" | "events" | "peers" | "dividends" | "documents" | "ai"

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
  a: ({ children }) => (
    <span className="text-primary underline underline-offset-2">
      {children}
    </span>
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

// AI-analysis markdown styling — same base as the chat but with section
// headings that carry a colored marker bar and a divider, and tighter tables
// (the Key Numbers table is the visual centerpiece of the analysis).
const aiMdComponents: Components = {
  ...mdComponents,
  h2: ({ children }) => (
    <h3 className="mt-6 flex items-center gap-2 border-b border-border/70 pb-1.5 text-sm font-bold first:mt-0">
      <span aria-hidden className="inline-block h-3.5 w-1 shrink-0 rounded-full bg-primary/70" />
      {children}
    </h3>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border shadow-sm">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-primary/10">{children}</thead>,
  th: ({ children }) => <th className="border-b p-2 text-start font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b p-2 align-top tabular-nums">{children}</td>,
}

// Extract the closing stance from the analysis markdown so the UI can surface
// it as a colored badge without re-reading the text. Matched against the
// Overall Stance section (English keywords + common Arabic phrasings).
function extractStance(content: string): { labelEn: string; labelAr: string; tone: "bullish" | "cautious" | "neutral" | "bearish" } | null {
  if (!content) return null
  const m = content.match(/^##\s*(?:Overall Stance|الموقف العام)\s*([\s\S]*)$/im)
  const tail = (m?.[1] ?? content).slice(0, 400).toLowerCase()
  const pick = (rules: Array<[RegExp, { labelEn: string; labelAr: string; tone: "bullish" | "cautious" | "neutral" | "bearish" }]>): { labelEn: string; labelAr: string; tone: "bullish" | "cautious" | "neutral" | "bearish" } | null => {
    for (const [re, v] of rules) if (re.test(tail)) return v
    return null
  }
  return pick([
    [/bearish|هابط|سلبي|سلبية/, { labelEn: "Bearish", labelAr: "هابط", tone: "bearish" }],
    [/cautiously\s*positive|cautious|صعود بحذر|إيجابي بحذر|بحذر/, { labelEn: "Cautiously Positive", labelAr: "إيجابي بحذر", tone: "cautious" }],
    [/bullish|صاعد|إيجابي(?!\s*بحذر)/, { labelEn: "Bullish", labelAr: "صاعد", tone: "bullish" }],
    [/neutral|محايد/, { labelEn: "Neutral", labelAr: "محايد", tone: "neutral" }],
  ])
}

const STANCE_STYLE = {
  bullish: "border-success/40 bg-success/10 text-success",
  cautious: "border-warning/40 bg-warning/10 text-warning",
  neutral: "border-border bg-muted/60 text-muted-foreground",
  bearish: "border-destructive/40 bg-destructive/10 text-destructive",
} as const

function StanceBadge({ stance }: { stance: NonNullable<ReturnType<typeof extractStance>> }) {
  const { lang } = useI18n()
  const Icon = stance.tone === "bullish" ? TrendingUp : stance.tone === "bearish" ? TrendingDown : stance.tone === "cautious" ? TrendingUp : Minus
  const cls = STANCE_STYLE[stance.tone]
  const title = lang === "ar"
    ? { bullish: "الموقف العام: صاعد", cautious: "الموقف العام: إيجابي بحذر", neutral: "الموقف العام: محايد", bearish: "الموقف العام: هابط" }[stance.tone]
    : { bullish: "Overall stance: Bullish", cautious: "Overall stance: Cautiously positive", neutral: "Overall stance: Neutral", bearish: "Overall stance: Bearish" }[stance.tone]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`} title={title}>
      <Icon className="h-3 w-3" aria-hidden />
      {lang === "ar" ? stance.labelAr : stance.labelEn}
    </span>
  )
}

export function CompanyDetail({
  companyId,
  onBack,
  onOpenScanner,
}: {
  companyId: string
  onBack: () => void
  onOpenScanner?: (ruleId: string) => void
}) {
  const { t, lang, pick } = useI18n()
  const { toast } = useToast()
  const [sub, setSub] = useState<SubTab>("overview")
  const [basisOverride, setBasisOverride] = useState<string | null>(null)
  const [periodViewOverride, setPeriodViewOverride] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["company", companyId], queryFn: () => api.company(companyId) })
  const { data: subData } = useQuery({ queryKey: ["my-subscription"], queryFn: () => api.subscription() })
  const isPremium = !!subData?.isPremium

  // Discovery query for available statement bases — shares the cache with the
  // Statements tab's default ("auto") fetch, so no extra request when both mount.
  const { data: finAvail } = useQuery({ queryKey: ["financials", companyId, "auto"], queryFn: () => api.financials(companyId) })
  const availableBases = finAvail?.availableStatementTypes ?? []
  const effectiveBasis = basisOverride ?? finAvail?.statementType ?? null
  const availablePeriodViews = finAvail?.availablePeriodViews ?? []
  const effectivePeriodView = periodViewOverride ?? finAvail?.periodView ?? null

  if (isError) return <ErrorState onRetry={() => refetch()} />
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
      <div className="page-glow relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-5 sm:p-6">
        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-gradient-to-br from-primary/15 to-primary/5 text-sm font-bold tracking-wide text-primary"
              >
                {c.ticker.slice(0, 4)}
              </span>
              <h1 className="text-2xl font-bold tracking-tight">{c.ticker}</h1>
              {c.isDemoData ? <DemoBadge /> : null}
              <StatusChip status={c.listingStatus} />
              {c.counts.values > 0 ? (
                <Badge
                  variant="outline"
                  className="border-success/40 bg-success/10 text-[10px] text-success-foreground"
                  title={t("co.aiGrounded")}
                >
                  <ShieldCheck className="me-1 h-3 w-3" aria-hidden />
                  {t("co.trustBadge")}
                </Badge>
              ) : null}
              <StarButton companyId={c.id} ticker={c.ticker} className="border border-border/60" />
              <a
                href={`/compare?ids=${c.id}`}
                title={lang === "ar" ? "مقارنة هذه الشركة" : "Compare this company"}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/60 px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Scale className="h-3.5 w-3.5" />
                {t("co.compare")}
              </a>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href)
                    toast({ title: t("co.copied") })
                  } catch {
                    // fallback
                  }
                }}
                title={t("co.shareLink")}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/60 px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Copy className="h-3.5 w-3.5" />
                {t("co.shareLink")}
              </button>
              <a
                href={`/company/${c.id}/report`}
                title={lang === "ar" ? "تقرير استثماري جاهز للطباعة/PDF" : "Print-ready investor report"}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/60 px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <FileText className="h-3.5 w-3.5" />
                {lang === "ar" ? "تقرير" : "Report"}
              </a>
            </div>
            <p className="mt-1.5 text-sm font-medium">{pick(c.nameEn, c.nameAr)}</p>
            <p className="text-xs text-muted-foreground">{lang === "ar" ? c.nameAr : c.nameEn}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-[10px]">{c.sector}</Badge>
              {c.industry ? <span>{c.industry}</span> : null}
              {c.sharesOutstanding ? (
                <span className="tabular num">· {t("co.shares")}: {c.sharesOutstanding >= 1e9 ? (c.sharesOutstanding / 1e9).toFixed(2) + "B" : c.sharesOutstanding >= 1e6 ? Math.round(c.sharesOutstanding / 1e6) + "M" : c.sharesOutstanding.toLocaleString()}</span>
              ) : null}
              {data.dataAsOf ? (
                (() => {
                  const monthsOld = (Date.now() - new Date(data.dataAsOf!.periodEnd).getTime()) / (1000 * 60 * 60 * 24 * 30.4)
                  const stale = monthsOld > 15
                  return (
                    <span
                      className="tabular-nums"
                      title={lang === "ar" ? "أحدث فترة موثقة لهذه الشركة" : "Latest verified filing period for this company"}
                    >
                      · <span className={stale ? "font-medium text-warning-foreground" : ""}>
                        {lang === "ar" ? `البيانات حتى ${data.dataAsOf.periodLabel}` : `Data as of ${data.dataAsOf.periodLabel}`}
                      </span>
                      {stale ? " ⚠" : ""}
                    </span>
                  )
                })()
              ) : null}
            </div>
            {pick(c.descriptionEn, c.descriptionAr) !== "—" ? (
              <p className="mt-2 max-w-2xl text-xs text-muted-foreground leading-relaxed">{pick(c.descriptionEn, c.descriptionAr)}</p>
            ) : null}
          </div>

          {/* scanner matches — premium only (free users see a locked teaser) */}
          <div className="min-w-0 md:max-w-xs">
            <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <ScanSearch className="h-3.5 w-3.5 text-primary" />
              {t("co.matchedScanners")}
              {!isPremium && data.matchedPresets.length > 0 ? (
                <Lock className="h-3 w-3 text-amber-500" aria-hidden />
              ) : null}
            </p>
            {!isPremium ? (
              data.matchedPresets.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{t("common.noData")}</p>
              ) : (
                <a href="/premium" className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 transition-colors duration-150 hover:bg-amber-500/10 dark:text-amber-400">
                  <Lock className="h-3 w-3 shrink-0" aria-hidden />
                  <span>{lang === "ar" ? `تمت مطابقة ${data.matchedPresets.length} ماسح — متاح لمشتركي Premium` : `${data.matchedPresets.length} scanner matches — Premium only`}</span>
                </a>
              )
            ) : data.matchedPresets.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t("common.noData")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.matchedPresets.map((m) => (
                  <Badge
                    key={`${m.presetKey}-${m.basis}`}
                    variant="outline"
                    className="cursor-pointer border-primary/40 bg-primary/5 text-primary hover:bg-primary/15 transition-colors duration-150 text-[10px]"
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

      {availableBases.length > 1 || availablePeriodViews.length > 1 ? (
        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
          {availableBases.length > 1 ? (
            <StatementBasisToggle available={availableBases} value={effectiveBasis} onSelect={setBasisOverride} />
          ) : null}
          {availablePeriodViews.length > 1 ? (
            <PeriodViewToggle available={availablePeriodViews} value={effectivePeriodView} onSelect={setPeriodViewOverride} />
          ) : null}
        </div>
      ) : null}

      <Tabs value={sub} onValueChange={(v) => setSub(v as SubTab)}>
        <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap sm:flex-nowrap rounded-xl bg-muted/60 p-1 backdrop-blur-sm">
          <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />{t("co.keyMetrics")}</TabsTrigger>
          <TabsTrigger value="statements" className="gap-1.5"><Table2 className="h-3.5 w-3.5" />{t("co.statements")}</TabsTrigger>
          <TabsTrigger value="health" className="gap-1.5"><HeartPulse className="h-3.5 w-3.5 text-destructive" />{t("co.health")}</TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5"><Flame className="h-3.5 w-3.5" />{t("co.events")} ({c.counts.events}) {!isPremium ? <Lock className="h-3 w-3 text-amber-500" aria-hidden /> : null}</TabsTrigger>
          <TabsTrigger value="peers" className="gap-1.5"><Users className="h-3.5 w-3.5" />{t("peers.tab")}</TabsTrigger>
          <TabsTrigger value="dividends" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{t("co.dividends")}</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5"><FileText className="h-3.5 w-3.5 text-info" />{t("co.filings")} ({c.counts.reports ?? 0})</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" />{t("co.aiAnalysis")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <PriceChart companyId={companyId} />
          <OverviewTab companyId={companyId} basis={basisOverride} />
          <QaBox companyId={companyId} />
        </TabsContent>
        <TabsContent value="statements" className="mt-4">
          <StatementsTab companyId={companyId} ticker={c.ticker} basis={basisOverride} periodView={effectivePeriodView} />
        </TabsContent>
        <TabsContent value="health" className="mt-4">
          <HealthTab companyId={companyId} />
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
        <TabsContent value="documents" className="mt-4">
          <DocumentsTable companyId={companyId} />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          <AiAnalysisTab companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function onOpenScannerByPresetKey(presetKey: string, onOpenScanner?: (ruleId: string) => void) {
  // matchedPresets use presetKey; find matching rule id via scanners list is extra work —
  // instead we pass presetKey through; the scanners view auto-selects by rule id OR preset key.
  onOpenScanner?.(presetKey)
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

/* ---------------- Period view toggle (annual vs interim) ---------------- */

function PeriodViewToggle({
  available,
  value,
  onSelect,
}: {
  available: string[]
  value: string | null
  onSelect: (view: string) => void
}) {
  const { t, lang } = useI18n()
  const meta: Record<string, { label: string; sub: string; icon: React.ReactNode }> = {
    annual: {
      label: t("co.periodAnnual"),
      sub: lang === "ar" ? "قوائم السنة الكاملة" : "Full-year statements",
      icon: <CalendarDays className="h-4 w-4" />,
    },
    interim: {
      label: t("co.periodInterim"),
      sub: lang === "ar" ? "أحدث الأرباع المعلنة" : "Latest announced quarters",
      icon: <ChartBar className="h-4 w-4" />,
    },
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("co.periodView")}</span>
      <div className="inline-flex rounded-xl border border-border/70 bg-card p-1 shadow-sm" role="group" aria-label={t("co.periodView")}>
        {available.map((pv) => {
          const active = value === pv
          const m = meta[pv] ?? { label: pv, sub: "", icon: null }
          return (
            <button
              key={pv}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(pv)}
              title={m.sub}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-start transition-all duration-150 ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {m.icon}
              <span className="flex flex-col leading-tight">
                <span className="text-xs font-semibold">{m.label}</span>
                <span className={`text-[9px] ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{m.sub}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Error state with retry (API failures must never look like eternal loading) ---------------- */

function ErrorState({ onRetry, label }: { onRetry: () => void; label?: string }) {
  const { t, lang } = useI18n()
  return (
    <Card className="p-6 flex flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground">{label ?? (lang === "ar" ? "تعذر تحميل البيانات — تحقق من الاتصال وحاول مرة أخرى." : "Could not load this data — check your connection and try again.")}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>{lang === "ar" ? "إعادة المحاولة" : "Retry"}</Button>
      <span className="sr-only">{t("common.noData")}</span>
    </Card>
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
    { code: "debt_to_equity", label: t("co.debtToEquity"), fmt: (v) => formatRatio(v) },
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
            <Card key={card.code} className="p-4 border-border/60 transition-all duration-200 hover:shadow-md hover:shadow-black/5">
              <p className="text-[11px] text-muted-foreground leading-tight font-medium">{card.label}</p>
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
                <p className={`mt-1.5 text-sm font-bold tabular num tracking-tight ${card.invert && (cell.value as number) < 0 ? "text-destructive" : ""}`}>
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
      <Card className="p-0 border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
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
    <Card className="p-0 border-border/60">
      <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" />
          {t("co.market")}
        </CardTitle>
        {mp ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-baseline gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 cursor-help transition-colors duration-150 hover:bg-primary/10">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("co.price")}</span>
                  <span className="text-sm font-bold tabular num text-primary">
                    {mp.price.toFixed(2)} <span className="text-[10px] font-normal">{mp.currency}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t("co.asOf")} {new Date(mp.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-56 text-[11px]">
                
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
              <div key={card.code} className="rounded-xl border border-border/60 bg-muted/30 p-3.5 transition-all duration-150 hover:border-primary/20">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{card.label}</p>
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
                  <p className="mt-1 text-sm font-bold tabular num">{card.fmt(cell.value as number)}</p>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function TrendChart({ data }: { data: { label: string; revenue: number | null; profit: number | null }[] }) {
  const { lang } = useI18n()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  if (data.length === 0) return null
  const max = Math.max(...data.flatMap((d) => [d.revenue ?? 0, Math.abs(d.profit ?? 0)]), 1)
  const hovered = hoverIdx !== null ? data[hoverIdx] : null
  const margin = hovered && hovered.revenue && hovered.profit !== null ? ((hovered.profit / hovered.revenue) * 100) : null

  return (
    <div className="space-y-3" dir="ltr">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
            <span className="h-2.5 w-2.5 rounded bg-primary/70" />
            {lang === "ar" ? "الإيرادات" : "Revenue"}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
            <span className="h-2.5 w-2.5 rounded bg-success" />
            {lang === "ar" ? "صافي الربح" : "Net profit"}
          </span>
        </div>
        {hovered ? (
          <div className="flex items-center gap-3 text-[11px] font-semibold">
            <span>{hovered.label}:</span>
            <span className="text-primary tabular">{formatEgp(hovered.revenue)}</span>
            <span className={`tabular ${(hovered.profit ?? 0) >= 0 ? "text-success" : "text-rose-600 dark:text-rose-400"}`}>
              {formatEgp(hovered.profit)}
              {margin !== null ? ` (${margin.toFixed(1)}%)` : ""}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {lang === "ar" ? "مرر على أي عمود للتفاصيل" : "Hover columns for breakdown"}
          </span>
        )}
      </div>

      <div className="flex items-end gap-3 sm:gap-6 px-2 pt-2 pb-1 border-b border-border/40">
        {data.map((d, i) => (
          <div
            key={d.label}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            className="flex flex-1 flex-col items-center gap-2 cursor-pointer group"
          >
            <div className="flex h-40 w-full max-w-16 items-end justify-center gap-1.5 sm:gap-2">
              <div className="relative flex h-full w-5 sm:w-7 items-end">
                <div
                  className="w-full rounded-t-md bg-primary/70 transition-all duration-300 ease-out group-hover:bg-primary shadow-xs"
                  style={{ height: `${Math.max(4, ((d.revenue ?? 0) / max) * 100)}%` }}
                  title={`Revenue: ${formatEgp(d.revenue)}`}
                />
              </div>
              <div className="relative flex h-full w-5 sm:w-7 items-end">
                <div
                  className={`w-full rounded-t-md transition-all duration-300 ease-out shadow-xs ${
                    (d.profit ?? 0) < 0
                      ? "bg-destructive group-hover:bg-destructive/90"
                      : "bg-success group-hover:bg-success/90"
                  }`}
                  style={{ height: `${Math.max(4, (Math.abs(d.profit ?? 0) / max) * 100)}%` }}
                  title={`Net profit: ${formatEgp(d.profit)}`}
                />
              </div>
            </div>
            <span className={`text-[11px] font-semibold transition-colors ${hoverIdx === i ? "text-primary" : "text-muted-foreground"}`}>
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Statements tab ---------------- */

function StatementsTab({ companyId, ticker, basis, periodView }: { companyId: string; ticker: string; basis: string | null; periodView: string | null }) {
  const { t, lang } = useI18n()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["financials", companyId, basis ?? "auto", periodView ?? "auto"],
    queryFn: () => api.financials(companyId, basis ?? undefined, periodView ?? undefined),
  })
  const [stmt, setStmt] = useState<"INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW">("INCOME_STATEMENT")
  const qc = useQueryClient()

  // ---- Admin inline edit mode (temporary until production launch, gated by TEMP_EDIT_MODE) ----
  const [editMode, setEditMode] = useState(false)
  const [editVals, setEditVals] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const NEW_PERIOD_KEY = "__new__"
  const [newPeriod, setNewPeriod] = useState<{ periodType: string; fiscalYear: string; periodLabel: string; periodEnd: string } | null>(null)
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [adminCheckDone, setAdminCheckDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    import("@/lib/client/admin-auth").then(({ isAdminClient }) => {
      isAdminClient().then((admin) => {
        if (!cancelled) {
          setIsAdminUser(admin)
          setAdminCheckDone(true)
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const canEdit = isAdminUser

  const EDIT_METRICS: Record<string, string[]> = {
    INCOME_STATEMENT: ["REVENUE","COGS","GROSS_PROFIT","OPERATING_INCOME","PROFIT_BEFORE_TAX","INCOME_TAX","NET_PROFIT","NET_PROFIT_PARENT","EBITDA","EBIT","FINANCE_COST","INTEREST_EXPENSE","INTEREST_INCOME","NET_INTEREST_INCOME","ADMIN_EXPENSES","OPERATING_EXPENSES_TOTAL","OTHER_INCOME","OTHER_EXPENSES","DILUTED_EPS","BASIC_EPS","WEIGHTED_AVG_SHARES"],
    BALANCE_SHEET: ["TOTAL_ASSETS","CURRENT_ASSETS","NON_CURRENT_ASSETS","TOTAL_LIABILITIES","CURRENT_LIABILITIES","NON_CURRENT_LIABILITIES","TOTAL_EQUITY","EQUITY_PARENT","NON_CONTROLLING_INTERESTS","CASH_AND_EQUIVALENTS","INVENTORY","ACCOUNTS_RECEIVABLE","INVESTMENTS","SHORT_TERM_DEBT","LONG_TERM_DEBT","TOTAL_DEBT","RETAINED_EARNINGS","SHARE_CAPITAL","SHARES_OUTSTANDING","BOOK_VALUE_PER_SHARE","PPE","GOODWILL","INTANGIBLE_ASSETS"],
    CASH_FLOW: ["OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","CAPEX","FREE_CASH_FLOW","NET_CHANGE_IN_CASH","OPENING_CASH","CLOSING_CASH","DIVIDENDS_PAID","DEPRECIATION_EXPENSE","AMORTIZATION_EXPENSE"],
  }

  const startEdit = () => {
    // pre-fill with current values from the data
    const vals: Record<string, Record<string, string>> = {}
    const metrics = EDIT_METRICS[stmt] || []
    for (const m of metrics) vals[m] = {}
    if (data) {
      for (const rows of Object.values(data.statements)) {
        for (const row of rows) {
          if (!vals[row.code]) vals[row.code] = {}
          for (const [pk, cell] of Object.entries(row.cells)) {
            vals[row.code][pk] = String(cell.normalizedValue)
          }
        }
      }
    }
    setEditVals(vals)
    // a company with no statements at all starts with a fresh period ready to fill
    if (!data || data.periods.length === 0) setNewPeriod(makeNewPeriod("ANNUAL"))
    setEditMode(true)
    setSaveMsg(null)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setNewPeriod(null)
    setSaveMsg(null)
  }

  const makeNewPeriod = (type: string): { periodType: string; fiscalYear: string; periodLabel: string; periodEnd: string } => {
    const year = String(new Date().getFullYear())
    const endMd: Record<string, string> = { ANNUAL: "-12-31", SEMIANNUAL: "-06-30", QUARTERLY: "-03-31", NINE_MONTH: "-09-30" }
    const prefix = type === "ANNUAL" ? "FY " : type === "SEMIANNUAL" ? "H1 " : type === "QUARTERLY" ? "Q1 " : "9M "
    return { periodType: type, fiscalYear: year, periodLabel: prefix + year, periodEnd: year + (endMd[type] || "-12-31") }
  }

  const setCell = (code: string, pk: string, raw: string) => {
    const clean = raw.replace(/[,\s]/g, "")
    setEditVals(v => ({ ...v, [code]: { ...v[code], [pk]: clean } }))
  }

  const saveEdits = async () => {
    if (!data || !ticker) return
    setSaving(true)
    setSaveMsg(null)
    try {
      // group changes by period (existing periods + the optional new one)
      const byPeriod: Record<string, { fiscalYear: number; periodType: string; periodLabel: string; periodEnd: string; vals: Record<string, string> }> = {}
      for (const p of data.periods) {
        byPeriod[p.key] = { fiscalYear: p.fiscalYear, periodType: p.periodType, periodLabel: p.label, periodEnd: "", vals: {} }
      }
      let hasChanges = false
      for (const [code, periods] of Object.entries(editVals)) {
        for (const [pk, val] of Object.entries(periods)) {
          if (pk === NEW_PERIOD_KEY) {
            if (val.trim() !== "") hasChanges = true // collected below via newVal
            continue
          }
          if (!byPeriod[pk]) continue
          // check if changed from current
          const existing = data.statements[stmt]?.find(r => r.code === code)?.cells[pk]
          const currentVal = existing ? String(existing.normalizedValue) : ""
          if (val !== currentVal) {
            byPeriod[pk].vals[code] = val
            hasChanges = true
          }
        }
      }
      // validate the new-period metadata before using it
      const newMeta = newPeriod
      const newVals: Record<string, string> = {}
      if (newMeta) {
        for (const code of Object.keys(editVals)) {
          const v = editVals[code]?.[NEW_PERIOD_KEY]
          if (v !== undefined && v.trim() !== "") newVals[code] = v
        }
        if (Object.keys(newVals).length && (!newMeta.periodLabel.trim() || !/^\d{4}$/.test(newMeta.fiscalYear))) {
          setSaveMsg(lang === "ar" ? "خطأ: أكمل سنة الفترة الجديدة (4 أرقام) وتسميتها" : "Error: complete the new period's year (4 digits) and label")
          setSaving(false)
          return
        }
        if (Object.keys(newVals).length) hasChanges = true
      }
      if (!hasChanges) { setSaveMsg(lang === "ar" ? "لا توجد تغييرات" : "No changes to save"); setSaving(false); return }
      let totalCreated = 0, totalUpdated = 0
      const post = async (payload: Record<string, unknown>) => {
        const r = await fetch("/api/v1/admin/financial-ops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        })
        const j = await r.json()
        if (!r.ok) { setSaveMsg(`خطأ: ${j.error || "save failed"}`); setSaving(false); return false }
        totalCreated += j.created || 0
        totalUpdated += j.updated || 0
        return true
      }
      for (const [pk, info] of Object.entries(byPeriod)) {
        if (!Object.keys(info.vals).length) continue
        const ok = await post({ ticker, periodType: info.periodType, fiscalYear: info.fiscalYear, periodLabel: info.periodLabel, periodEnd: info.periodEnd || undefined, values: info.vals })
        if (!ok) return
      }
      if (newMeta && Object.keys(newVals).length) {
        const ok = await post({ ticker, periodType: newMeta.periodType, fiscalYear: parseInt(newMeta.fiscalYear), periodLabel: newMeta.periodLabel.trim(), periodEnd: newMeta.periodEnd || undefined, values: newVals })
        if (!ok) return
      }
      setSaveMsg(lang === "ar"
        ? `✅ تم الحفظ: ${totalCreated} قيمة جديدة + ${totalUpdated} محدثة — تمت إعادة حساب كل المقاييس`
        : `✅ Saved: ${totalCreated} created + ${totalUpdated} updated — all metrics recomputed`)
      setEditMode(false)
      setNewPeriod(null)
      qc.invalidateQueries({ queryKey: ["financials", companyId] })
      qc.invalidateQueries({ queryKey: ["metrics", companyId] })
      qc.invalidateQueries({ queryKey: ["company", companyId] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    } catch (e) {
      setSaveMsg(`خطأ: ${e instanceof Error ? e.message : String(e)}`)
    }
    setSaving(false)
  }

  if (isError) return <ErrorState onRetry={() => refetch()} />
  if (isLoading || !data) return <Skeleton className="h-72 rounded-xl" />

  const rows = data.statements[stmt] ?? []
  // server returns periods chronologically (fiscalYear, within-year sequence) — never re-sort alphabetically
  const periods = data.periods
  const hasAnyRows = Object.values(data.statements).some((section) => section.length > 0)
  const shownBasis = data.statementType ?? basis ?? null

  // Edit-mode rows: every canonical metric the site uses for this statement plus any
  // extra rows that already exist in the data (e.g. bank-specific DEPOSITS / LOANS_NET).
  // Missing metrics render as empty inputs so absent figures can be filled in.
  const editRows: { code: string; label: string }[] = (() => {
    const seen = new Set<string>()
    const out: { code: string; label: string }[] = []
    const labelOf = (code: string) => {
      const def = RAW_METRIC_MAP[code]
      return (lang === "ar" ? def?.labelAr : def?.labelEn) ?? def?.labelEn ?? code
    }
    for (const r of rows) {
      if (seen.has(r.code)) continue
      seen.add(r.code)
      out.push({ code: r.code, label: labelOf(r.code) })
    }
    for (const code of EDIT_METRICS[stmt] || []) {
      if (seen.has(code)) continue
      seen.add(code)
      out.push({ code, label: labelOf(code) })
    }
    return out
  })()



  const stmtTabs = [
    { key: "INCOME_STATEMENT", label: t("co.incomeStatement") },
    { key: "BALANCE_SHEET", label: t("co.balanceSheet") },
    { key: "CASH_FLOW", label: t("co.cashFlow") },
  ] as const

  // client-side CSV export of the current statement view (normalized values, one column per period)
  const exportCsv = () => {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`
    const header = ["Code", "Label", "Currency", ...periods.map((p) => p.label)]
    const lines = [header.map(q).join(",")]
    for (const row of rows) {
      const cells = periods.map((p) => {
        const c = row.cells[p.key]
        return c ? String(c.normalizedValue) : ""
      })
      lines.push([row.code, row.cells[Object.keys(row.cells)[0]]?.label ?? row.code, "EGP", ...cells].map(q).join(","))
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `statements-${stmt.toLowerCase()}-${periodView ?? "annual"}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Card className="p-0 border-border/60">
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {t("co.statements")}
            {shownBasis ? <Badge variant="outline" className="text-[10px]">{basisBadgeLabel(shownBasis, t)}</Badge> : null}
            <span className="hidden text-[10px] font-normal text-muted-foreground lg:inline">
              {lang === "ar" ? "اضغط على أي قيمة للتفاصيل" : "Click any value for details"}
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              editMode ? (
                <>
                  <Button size="sm" className="h-7 gap-1 text-[11px]" onClick={saveEdits} disabled={saving}>
                    <Check className="h-3 w-3" aria-hidden />
                    {saving ? (lang === "ar" ? "جاري الحفظ…" : "Saving…") : lang === "ar" ? "حفظ + إعادة حساب" : "Save + recompute"}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={cancelEdit} disabled={saving}>
                    <X className="h-3 w-3" aria-hidden />
                    {lang === "ar" ? "إلغاء" : "Cancel"}
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={startEdit} title={lang === "ar" ? "تعديل القيم يدويًا (مؤقت قبل الإطلاق)" : "Edit values manually (temporary, pre-launch)"}>
                  <Pencil className="h-3 w-3" aria-hidden />
                  {lang === "ar" ? "تعديل القيم" : "Edit values"}
                </Button>
              )
            ) : null}
            {rows.length > 0 ? (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={exportCsv} title={lang === "ar" ? "تنزيل الجدول الحالي CSV" : "Download the current table as CSV"}>
                <Download className="h-3 w-3" aria-hidden />
                CSV
              </Button>
            ) : null}
            <div className="flex gap-1">
              {stmtTabs.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStmt(s.key)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${stmt === s.key ? "bg-primary/10 text-primary shadow-sm shadow-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        {editMode ? (
          <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs leading-relaxed text-warning-foreground">
            {lang === "ar"
              ? "وضع التعديل المؤقت (قبل الإطلاق): عدّل أي قيمة أو املأ الفراغات — امسح الحقل لحذف القيمة. القيم تُدخل بالجنيه المصري الكامل (مثال: 25400000000). الحفظ يكتب في قاعدة البيانات ويعيد حساب كل النسب والأحداث تلقائيًا."
              : "Temporary edit mode (pre-launch): edit any value or fill blanks — clear a field to delete the value. Amounts are plain EGP (e.g. 25400000000). Saving writes to the database and recomputes all ratios and events."}
            {saveMsg ? <div className="mt-1 font-semibold">{saveMsg}</div> : null}
          </div>
        ) : null}
        <CardContent className="p-0">
          {editMode && canEdit ? (
            <div className="max-h-[560px] overflow-auto scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border/70">
                    <th className="sticky-col sticky-col-header p-2.5 text-start font-medium text-muted-foreground min-w-40 shadow-[inset-inline-end:1px_0_0_var(--border)]">{lang === "ar" ? "البند" : "Item"}</th>
                    {periods.map((p) => (
                      <th key={p.key} className="p-2.5 text-end font-medium text-muted-foreground whitespace-nowrap">
                        {p.label}
                        <span className="ms-1 block text-[9px] font-normal">{lang === "ar" ? "ج.م" : "EGP"}</span>
                      </th>
                    ))}
                    {newPeriod ? (
                      <th className="border-s-2 border-primary/50 bg-primary/5 p-2 text-end">
                        <div className="flex flex-col items-stretch gap-1">
                          <div className="flex gap-1">
                            <select
                              value={newPeriod.periodType}
                              onChange={(e) => setNewPeriod(makeNewPeriod(e.target.value))}
                              className="w-full rounded border bg-card p-0.5 text-[10px]"
                              aria-label={lang === "ar" ? "نوع الفترة" : "Period type"}
                            >
                              <option value="ANNUAL">{lang === "ar" ? "سنوي" : "FY"}</option>
                              <option value="SEMIANNUAL">{lang === "ar" ? "نصف سنوي" : "H1"}</option>
                              <option value="QUARTERLY">{lang === "ar" ? "ربع سنوي" : "Q"}</option>
                              <option value="NINE_MONTH">9M</option>
                            </select>
                            <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" onClick={() => setNewPeriod(null)} title={lang === "ar" ? "إلغاء الفترة الجديدة" : "Drop new period"}>
                              <X className="h-3 w-3" aria-hidden />
                            </Button>
                          </div>
                          <Input
                            value={newPeriod.fiscalYear}
                            onChange={(e) => setNewPeriod((p) => (p ? { ...p, fiscalYear: e.target.value.replace(/\D/g, "").slice(0, 4) } : p))}
                            placeholder="2025"
                            className="h-5 text-[10px] tabular-nums"
                            aria-label={lang === "ar" ? "السنة" : "Fiscal year"}
                          />
                          <Input
                            value={newPeriod.periodLabel}
                            onChange={(e) => setNewPeriod((p) => (p ? { ...p, periodLabel: e.target.value } : p))}
                            placeholder="FY 2025"
                            className="h-5 text-[10px]"
                            aria-label={lang === "ar" ? "تسمية الفترة" : "Period label"}
                          />
                          <Input
                            type="date"
                            value={newPeriod.periodEnd}
                            onChange={(e) => setNewPeriod((p) => (p ? { ...p, periodEnd: e.target.value } : p))}
                            className="h-5 text-[10px] tabular-nums"
                            aria-label={lang === "ar" ? "نهاية الفترة" : "Period end"}
                          />
                        </div>
                      </th>
                    ) : (
                      <th className="p-2.5 text-center">
                        <Button variant="outline" size="sm" className="h-6 gap-0.5 text-[10px]" onClick={() => setNewPeriod(makeNewPeriod("ANNUAL"))}>
                          <Plus className="h-3 w-3" aria-hidden />
                          {lang === "ar" ? "فترة جديدة" : "New period"}
                        </Button>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {editRows.map((row) => (
                    <tr key={row.code} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors duration-150">
                      <td className="sticky-col sticky-col-cell p-2 font-medium shadow-[inset-inline-end:1px_0_0_var(--border)]" title={row.code}>
                        {row.label}
                        <span className="ms-1 block text-[9px] font-normal text-muted-foreground" dir="ltr">{row.code}</span>
                      </td>
                      {periods.map((p) => (
                        <td key={p.key} className="p-1.5 text-end">
                          <Input
                            inputMode="decimal"
                            value={editVals[row.code]?.[p.key] ?? ""}
                            onChange={(e) => setCell(row.code, p.key, e.target.value)}
                            placeholder="—"
                            className="h-6 w-28 text-end text-xs tabular-nums"
                          />
                        </td>
                      ))}
                      {newPeriod ? (
                        <td className="border-s-2 border-primary/50 bg-primary/5 p-1.5 text-end">
                          <Input
                            inputMode="decimal"
                            value={editVals[row.code]?.[NEW_PERIOD_KEY] ?? ""}
                            onChange={(e) => setCell(row.code, NEW_PERIOD_KEY, e.target.value)}
                            placeholder="—"
                            className="h-6 w-28 text-end text-xs tabular-nums"
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : data.periods.length === 0 || !hasAnyRows ? (
            <div>
              <NoFinancialsEmpty bare />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
          ) : (
            <div className="max-h-[480px] overflow-auto scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border/70">
                    <th className="sticky-col sticky-col-header p-2.5 text-start font-medium text-muted-foreground min-w-40 shadow-[inset-inline-end:1px_0_0_var(--border)]">{lang === "ar" ? "البند" : "Item"}</th>
                    {periods.map((p) => (
                      <th key={p.key} className="p-2.5 text-end font-medium text-muted-foreground whitespace-nowrap">
                        {p.label}
                        <span className="ms-1 block text-[9px] font-normal">{lang === "ar" ? "ج.م" : "EGP"}</span>
                      </th>
                    ))}
                    <th className="p-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">{t("co.trend")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    // bilingual row label: registry label by language; the source
                    // document's original label stays visible (AR) / on hover (EN)
                    const def = RAW_METRIC_MAP[row.code]
                    const original = row.cells[Object.keys(row.cells)[0]]?.label ?? row.code
                    return (
                    <tr key={row.code} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors duration-150">
                      <td className="sticky-col sticky-col-cell p-2.5 font-medium shadow-[inset-inline-end:1px_0_0_var(--border)]" title={original !== row.code ? original : undefined}>
                        {lang === "ar" && def?.labelAr ? (
                          <>
                            {def.labelAr}
                            {original !== def.labelAr ? (
                              <span className="block text-[9px] font-normal text-muted-foreground" dir="ltr">
                                {original !== row.code ? original : row.code}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          def?.labelEn ?? original
                        )}
                      </td>
                      {periods.map((p, pi) => {
                        const cell = row.cells[p.key]
                        const prev = pi > 0 ? row.cells[periods[pi - 1].key]?.normalizedValue : undefined
                        const chg = cell && prev !== undefined && prev !== null && prev !== 0
                          ? ((cell.normalizedValue - prev) / Math.abs(prev)) * 100
                          : null
                        return (
                          <td
                            key={p.key}
                            className={`p-2.5 text-end tabular whitespace-nowrap transition-colors ${
                              cell && cell.normalizedValue < 0 ? "text-destructive" : ""
                            }`}
                          >
                            {cell ? (
                              <span className="inline-flex flex-col items-end leading-tight">
                                <span className="flex items-center gap-1 justify-end">
                                  <span>{formatEgp(cell.normalizedValue, { withCurrency: false })}</span>
                                </span>
                                {chg !== null && Number.isFinite(chg) ? (
                                  <span className={`text-[9px] font-medium ${chg > 0.05 ? "text-success" : chg < -0.05 ? "text-destructive" : "text-muted-foreground"}`}>
                                    {chg > 0.05 ? "▲" : chg < -0.05 ? "▼" : "●"} {Math.abs(chg).toFixed(1)}%
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        )
                      })}
                      <td className="p-2.5 text-center">
                        <Sparkline values={periods.map((p) => row.cells[p.key]?.normalizedValue)} />
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/** Tiny inline trend line across the visible periods (missing values are skipped) */
function Sparkline({ values }: { values: (number | undefined)[] }) {
  const finite = values.filter((v): v is number => v !== undefined && Number.isFinite(v))
  if (finite.length < 2) return <span className="text-[10px] text-muted-foreground/50">—</span>
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const range = max - min || 1
  const W = 60
  const H = 18
  const coords = values
    .map((v, i) => {
      if (v === undefined || !Number.isFinite(v)) return null
      return {
        x: (i / Math.max(1, values.length - 1)) * (W - 4) + 2,
        y: H - 3 - ((v - min) / range) * (H - 6),
      }
    })
    .filter((c): c is { x: number; y: number } => c !== null)
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")
  const last = coords[coords.length - 1]
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="inline-block text-primary/50" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="1.8" fill="currentColor" />
    </svg>
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
        <div key={e.id} className={`rounded-xl border border-border/60 bg-card p-4 shadow-sm shadow-black/[0.02] transition-all duration-200 hover:border-primary/20 ${toneBorder[e.tone] ?? ""}`}>
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
  const [basis, setBasis] = useState<"latest" | "annual" | "ttm">("latest")
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["peers", companyId, basis],
    queryFn: () => api.peers(companyId, basis),
  })

  if (isError) return <ErrorState onRetry={() => refetch()} />
  if (isLoading || !data) return <Skeleton className="h-72 rounded-xl" />
  // strict sector comparison: the server returns an empty peer set when the
  // sector has fewer than 3 listed companies — show an honest message instead
  // of a meaningless cross-sector comparison
  if (data.insufficient) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        {pick(
          `Not enough peers for a fair comparison — only ${data.sectorCount} listed companies in the ${data.sector} sector (minimum 3).`,
          `عدد الشركات لا يكفي لمقارنة عادلة — يوجد ${data.sectorCount} فقط من الشركات المدرجة في قطاع ${data.sector} (الحد الأدنى 3).`
        )}
      </Card>
    )
  }
  if (!data.period || data.peers.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">{t("peers.noData")}</Card>
  }
  // only the metrics the server computed for this sector
  const sectorMetrics = PEER_METRICS.filter((m) => m.code in data.medians)
  const basisText = basis === "latest"
    ? pick("Latest available", "أحدث بيانات متاحة")
    : basis === "annual"
      ? pick("Latest annual", "آخر سنة سنوية")
      : pick("TTM", "آخر 12 شهراً")

  return (
    <Card className="p-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex flex-wrap items-center gap-2">
          {t("peers.title")}
          <Badge variant="secondary" className="text-[10px]">{data.sector}</Badge>
          <Badge variant="outline" className="text-[10px]">{data.period.label}</Badge>
          <a
            href={`/compare?ids=${companyId}`}
            className="ms-auto inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <Scale className="h-3 w-3" />
            {lang === "ar" ? "قارن في أداة المقارنة" : "Open in Compare"}
          </a>
        </CardTitle>
        <div className="mt-2 inline-flex overflow-hidden rounded-lg border border-border/60">
          {([
            ["latest", pick("Latest available", "أحدث بيانات متاحة")],
            ["annual", pick("Latest annual", "آخر سنة سنوية")],
            ["ttm", pick("TTM", "آخر 12 شهراً")],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setBasis(key)}
              className={`px-3 py-1 text-[11px] font-semibold transition-colors ${basis === key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted/60"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          {pick(
            "Every company is shown on its own latest available period — the period is printed next to each value. Period lengths can differ (a quarter is not annualised), so use the Annual or TTM basis for a like-for-like comparison. ROE/ROA always use the latest full period (TTM or annual).",
            "كل شركة تظهر على أحدث فترة متاحة لها — والفترة مطبوعة بجانب كل قيمة. أطوال الفترات قد تختلف (الربع ليس سنوياً)، استخدم أساس السنة السنوية أو آخر 12 شهراً لمقارنة متماثلة. ويُحسب ROE/ROA دائماً على آخر فترة كاملة (TTM أو سنوية)."
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {sectorMetrics.map((metric) => {
          const entries = data.peers
            .map((p) => ({
              peer: p,
              value: p.values[metric.code] ?? null,
              period: p.periods[metric.code] ?? null,
            }))
            // A peer whose own value for THIS metric is years old is not a
            // comparable bar (ALEX FY2018 ROE −977% would flatten every other
            // bar). Keep the self row visible; exclude other stale values.
            .filter((e) => e.value !== null && (e.peer.isSelf || !e.peer.staleCodes?.includes(metric.code))) as { peer: (typeof data.peers)[number]; value: number; period: { label: string } | null }[]
          if (entries.length === 0) return null
          const staleExcluded = data.peers.filter(
            (p) => !p.isSelf && p.staleCodes?.includes(metric.code) && p.values[metric.code] !== null,
          ).length
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
                  .map(({ peer, value, period }) => {
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
                        <span className={`w-20 shrink-0 text-end text-[11px] tabular ${value < 0 ? "text-destructive" : peer.isSelf ? "font-bold" : "text-muted-foreground"}`}>
                          {metric.fmt(value)}
                        </span>
                        <span className="w-24 shrink-0 text-end text-[9px] text-muted-foreground/80" title={period?.label ?? ""}>
                          {period?.label ?? "—"}
                          {peer.stale ? <span className="ms-1 text-warning-foreground">*</span> : null}
                        </span>
                      </div>
                    )
                  })}
              </div>
              {staleExcluded > 0 ? (
                <p className="mt-1 text-[9px] text-muted-foreground/80">
                  {pick(
                    `${staleExcluded} stale peer${staleExcluded === 1 ? "" : "s"} excluded from this metric (last value more than four quarters behind the sector).`,
                    `${staleExcluded} شركة قديمة مستبعدة من هذا المؤشر (آخر قيمة أقدم من القطاع بأكثر من أربعة أرباع).`,
                  )}
                </p>
              ) : null}
              {self ? (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {t("peers.you")}: <span className="font-medium text-foreground tabular">{metric.fmt(self.value)}</span>
                  {self.period ? <span className="ms-1 text-muted-foreground/80">({self.period.label})</span> : null}
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
        <p className="text-[10px] text-muted-foreground/80">
          {pick(
            `${basisText} · * marks a period older than the sector's freshest by more than four quarters.`,
            `${basisText} · * تشير إلى فترة أقدم من أحدث فترة في القطاع بأكثر من أربعة أرباع.`
          )}
        </p>
      </CardContent>
    </Card>
  )
}

function EventsTab({ companyId }: { companyId: string }) {
  const { t, lang } = useI18n()
  const { data: subData } = useQuery({ queryKey: ["my-subscription"], queryFn: () => api.subscription() })
  const isPremium = !!subData?.isPremium

  // Premium-only endpoint: only fetch once we know the user is premium —
  // anonymous visitors otherwise get a guaranteed 403 in the console and the
  // tab shows the gate anyway.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["events", companyId, isPremium],
    queryFn: () => api.events(companyId),
    enabled: isPremium,
  })

  if (!isPremium) {
    return <PremiumGate />
  }

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />
  return <EventsList events={data?.events ?? []} emptyText={t("co.noEvents")} />
}

/* ---------------- Dividends tab ---------------- */

function CompanyDividendsTab({ companyId }: { companyId: string }) {
  const { t, pick } = useI18n()
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["company-dividends", companyId], queryFn: () => api.companyDividends(companyId) })
  if (isLoading) return <Skeleton className="h-64 rounded-xl" />

  const dividends = data?.dividends ?? []
  if (dividends.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">{t("co.noDividends")}</Card>
  }

  return (
    <div className="space-y-3">
      {dividends.map((d) => (
        <div key={d.id} className="rounded-xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.02] transition-all duration-200 hover:border-primary/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <StatusChip status={d.status} />
              <Badge variant="secondary" className="text-[10px]">{d.dividendType}</Badge>
              {d.dividendPerShare !== null ? (
                <span className="text-sm font-bold tabular">{d.dividendPerShare} EGP / {t("dv.dps")}</span>
              ) : null}
            </div>
            
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

/* ---------------- Documents + Reports tab ---------------- */

function DocumentsTable({ companyId }: { companyId: string }) {
  const { t, lang } = useI18n()
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["company-documents", companyId], queryFn: () => api.companyDocuments(companyId) })

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
    lang === "ar" ? "القيم" : "Values",
    "",
  ]

  return (
    <div className="overflow-x-auto scrollbar-thin rounded-lg border">
      <table className="w-full min-w-[560px] text-xs">
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
              <td className="p-2.5 text-end tabular">
                {doc.valueCount} <span className="text-[9px] text-muted-foreground">{t("co.values")}</span>
              </td>
              <td className="p-2.5">
              <div className="flex items-center justify-end gap-1.5">
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
  const { data: subData } = useQuery({ queryKey: ["my-subscription"], queryFn: () => api.subscription() })
  const isPremium = !!subData?.isPremium
  const usage = subData?.smartAnalysisUsage
  const usageLabel = usage ? `${usage.usageCount}/${usage.limit} ${lang === "ar" ? "مستخدم" : "used"}` : ""

  // Language is part of the key: toggling the UI language refetches and shows
  // the analysis generated in that language when one exists.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ai-analysis", companyId, lang],
    queryFn: () => api.aiAnalysis(companyId, lang),
  })

  const generate = useMutation({
    mutationFn: () => api.generateAiAnalysis(companyId, lang),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-analysis", companyId, lang] })
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] })
    },
  })

  const err = generate.error as (Error & { status?: number; body?: unknown }) | null
  const noData = !!err && (err.status === 400 || /NO_DATA/i.test(err.message))
  const usageLimited = !!err && (err.status === 429 || /USAGE_LIMIT_EXCEEDED/i.test(err.message))
  const analysis = data?.analysis ?? null
  const stance = extractStance(analysis?.content ?? "")
  if (isLoading) return <Skeleton className="h-72 rounded-xl" />
  if (generate.isPending) return <AiLoadingPanel />

  if (usageLimited) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">
            {lang === "ar" ? `التحليلات الذكية: ${usageLabel}` : `Smart Analyses: ${usageLabel}`}
          </Badge>
        </div>
        <PremiumGate
          title={lang === "ar" ? "تم الوصول للحد الشهري" : "Monthly limit reached"}
          description={lang === "ar"
            ? "استنفدت الحد المجاني للتحليلات الذكية لهذا الشهر. قم بالترقية للحصول على تحليلات غير محدودة."
            : "You have reached the free monthly limit for Smart Analyses. Upgrade for unlimited analyses."}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {err ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>{noData ? t("co.aiNoData") : t("co.aiFailed")}</AlertTitle>
          {!noData && err.message ? <AlertDescription className="font-mono text-xs">{err.message}</AlertDescription> : null}
        </Alert>
      ) : null}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isPremium ? (
          <Badge variant="secondary">{lang === "ar" ? "بريميوم — غير محدود" : "Premium — unlimited"}</Badge>
        ) : (
          <Badge variant="outline">
            {lang === "ar" ? `التحليلات الذكية: ${usageLabel}` : `Smart Analyses: ${usageLabel}`}
          </Badge>
        )}
      </div>

      {analysis ? (
        <>
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
              <div className="flex items-center gap-2">
                {stance ? <StanceBadge stance={stance} /> : null}
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => generate.mutate()}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  {t("co.aiRegenerate")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {analysis.degraded ? (
                <Alert className="mb-4 border-warning/40 bg-warning/5">
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                  <AlertDescription className="text-xs">{t("co.aiDegraded")}</AlertDescription>
                </Alert>
              ) : null}
              {analysis.lang && analysis.lang !== lang ? (
                <Alert className="mb-4">
                  <Languages className="h-4 w-4" aria-hidden />
                  <AlertDescription className="text-xs">
                    {lang === "ar"
                      ? "التحليل المخزّن مكتوب بلغة تانية — اضغط «إعادة التوليد» عشان يُكتب بالعربي من نفس البيانات."
                      : "The stored analysis was generated in another language — press Regenerate to rewrite it in your language from the same data."}
                  </AlertDescription>
                </Alert>
              ) : null}
              <div dir={lang === "ar" ? "rtl" : "ltr"}>
                <ReactMarkdown components={aiMdComponents}>{analysis.content}</ReactMarkdown>
              </div>
            </CardContent>
            <div className="border-t px-6 py-3">
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                {t("co.aiGrounded")}
              </p>
            </div>
          </Card>
          <AiAnalystChat companyId={companyId} />
        </>
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

/* ---------------- Ask-the-analyst chat (grounded follow-up Q&A) ---------------- */

function AiAnalystChat({ companyId }: { companyId: string }) {
  const { t, lang } = useI18n()
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState("")
  const [chatUsed, setChatUsed] = useState<{ used: number; limit: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const send = useMutation({
    mutationFn: (history: AiChatMessage[]) => api.aiAnalysisChat(companyId, history, lang),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }])
      if (data.usage) setChatUsed(data.usage)
    },
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length, send.isPending])

  const submit = () => {
    const text = input.trim()
    if (!text || send.isPending) return
    const next: AiChatMessage[] = [...messages, { role: "user", content: text }]
    setMessages(next)
    setInput("")
    send.mutate(next)
  }

  const chatErr = send.error as (Error & { status?: number; body?: { message?: string } }) | null
  const quotaHit = !!chatErr && (chatErr.status === 429 || /QUOTA_EXCEEDED|RATE_LIMITED/i.test(chatErr.message))

  return (
    <Card className="p-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          {t("co.aiAskTitle")}
          <span className="text-[11px] font-normal text-muted-foreground">{t("co.aiAskSub")}</span>
        </CardTitle>
        {chatUsed ? (
          <Badge variant="outline" className="text-[10px]">
            {t("co.aiAskChatLimit")}: {chatUsed.used}/{chatUsed.limit}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("co.aiAskEmpty")}
          </p>
        ) : (
          <div ref={scrollRef} className="max-h-96 space-y-3 overflow-y-auto pe-1">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  dir="auto"
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-xl bg-primary px-3.5 py-2 text-xs leading-relaxed text-primary-foreground"
                      : "max-w-[92%] rounded-xl bg-muted px-3.5 py-2"
                  }
                >
                  {m.role === "assistant" ? (
                    <div dir={lang === "ar" ? "rtl" : "ltr"} className="text-xs leading-relaxed [&_ul]:list-disc [&_ul]:ps-4 [&_ol]:list-decimal [&_ol]:ps-4 [&_code]:rounded [&_code]:bg-background [&_code]:px-1 [&_code]:text-[11px] [&_strong]:font-semibold">
                      <ReactMarkdown components={mdComponents}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {send.isPending ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-xl bg-muted px-3.5 py-2.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {chatErr ? (
          <Alert variant={quotaHit ? "default" : "destructive"}>
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertDescription className="text-xs">
              {chatErr.body?.message || chatErr.message}
            </AlertDescription>
          </Alert>
        ) : null}

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Input
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("co.aiAskPlaceholder")}
            className="h-9 flex-1 text-xs"
            maxLength={1500}
            disabled={send.isPending}
          />
          <Button type="submit" size="sm" className="h-9 gap-1.5 px-3" disabled={send.isPending || !input.trim()}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t("co.aiAskSend")}
          </Button>
        </form>
      </CardContent>
      <div className="border-t px-6 py-3">
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
          {t("co.aiGrounded")}
        </p>
      </div>
    </Card>
  )
}
