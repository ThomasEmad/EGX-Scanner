"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowRight, BellRing, Building2, CalendarDays, FileWarning, Percent, Scale, ScanSearch, Sparkles, Star, TrendingDown, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type DashboardData } from "@/lib/client/api"
import { useWatchlist } from "@/lib/client/watchlist"
import { useI18n } from "@/lib/i18n"
import { DemoBadge, EventBadge } from "./shared"
import { EVENT_TYPE_MAP } from "@/lib/financial/registry"
import type { ViewKey } from "@/app/page"

export function DashboardView({
  onOpenScanner,
  onOpenCompany,
  onViewChange,
}: {
  onOpenScanner: (ruleId: string) => void
  onOpenCompany: (id: string) => void
  onViewChange: (v: ViewKey) => void
}) {
  const { t, lang, pick } = useI18n()
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard })
  const watchItems = useWatchlist((s) => s.items)
  const watchIds = watchItems.map((w) => w.id)

  // Watchlist alerts digest — latest events among watched companies (client-side
  // preference; the filter itself runs server-side via /api/v1/events?companyIds=)
  const alertsQuery = useQuery({
    queryKey: ["watch-alerts", watchIds.join(",")],
    queryFn: () => api.eventsFeed(watchIds, 8),
    enabled: watchIds.length > 0,
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-red-600">{t("common.noData")}</CardTitle>
          <CardDescription>{error instanceof Error ? error.message : String(error)}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const stats = [
    { label: t("dash.companiesTracked"), value: data.stats.companies, icon: <Building2 className="h-4 w-4" /> },
    { label: t("dash.validatedValues"), value: data.stats.validValues, icon: <Sparkles className="h-4 w-4" /> },
    { label: t("dash.eventsDetected"), value: data.stats.events, icon: <ScanSearch className="h-4 w-4" /> },
    { label: t("dash.upcomingDividends"), value: data.upcomingDividends.length, icon: <CalendarDays className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="rounded-xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("dash.title")}</h1>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">{t("dash.subtitle")}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={() => onViewChange("scanners")}>
              <ScanSearch className="h-4 w-4" />
              {t("nav.scanners")}
            </Button>
            <Button variant="outline" onClick={() => onViewChange("custom")}>
              {t("nav.customScanner")}
            </Button>
          </div>
        </div>
        {(data.stats.pendingReview > 0 || data.stats.pendingReports > 0) && (
          <button
            onClick={() => onViewChange("reports")}
            className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            <FileWarning className="h-4 w-4" />
            {t("dash.pendingReview")}: <strong>{data.stats.pendingReview + data.stats.pendingReports}</strong>
            <ArrowRight className="h-3 w-3 rtl-flip" />
          </button>
        )}
      </section>

      {/* Watchlist strip */}
      {watchItems.length > 0 ? (
        <section aria-label={t("watchlist.title")} className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {t("watchlist.title")}
              <span className="tabular">({watchItems.length})</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {watchItems.map((w) => (
                <button
                  key={w.id}
                  onClick={() => onOpenCompany(w.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-card px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-amber-400/10"
                >
                  {w.ticker}
                </button>
              ))}
            </div>
            <button onClick={() => onViewChange("companies")} className="ms-auto text-[11px] text-muted-foreground hover:text-foreground">
              {lang === "ar" ? "إدارة" : "Manage"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Watchlist alerts digest */}
      {watchItems.length > 0 ? (
        <section aria-label={t("dash.watchAlerts")} className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <BellRing className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight">{t("dash.watchAlerts")}</h2>
              <p className="text-[11px] text-muted-foreground">{t("dash.watchAlertsSub")}</p>
            </div>
          </div>
          {alertsQuery.isLoading ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : !alertsQuery.data || alertsQuery.data.events.length === 0 ? (
            <p className="mt-3 text-xs italic text-muted-foreground">{t("dash.watchNoEvents")}</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {alertsQuery.data.events.map((e) => {
                const meta = EVENT_TYPE_MAP[e.eventType]
                const toneDot = meta?.tone === "positive" ? "bg-emerald-500" : meta?.tone === "negative" ? "bg-red-500" : "bg-slate-400"
                return (
                  <button
                    key={e.id}
                    onClick={() => onOpenCompany(e.company.id)}
                    className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-start transition-colors hover:bg-muted/50"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${toneDot}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-bold">{e.company.ticker}</span>
                        <span className="truncate font-medium">{pick(e.labelEn, e.labelAr)}</span>
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">{e.periodLabel} · {pick(e.explanationEn, e.explanationAr)}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      {/* Stats */}
      <section aria-label="Portfolio statistics" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="relative overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{s.icon}</span>
              <span className="leading-tight">{s.label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular">{s.value.toLocaleString()}</p>
          </Card>
        ))}
      </section>

      {/* Scanner discovery grid */}
      <section aria-label={t("dash.scannerDiscovery")}>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{t("dash.scannerDiscovery")}</h2>
          <p className="text-sm text-muted-foreground">{t("dash.scannerDiscoverySub")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.scannerCards.map((card) => {
            const meta = card.presetKey ? presetIcons[card.presetKey] : undefined
            return (
              <button
                key={card.id}
                onClick={() => onOpenScanner(card.id)}
                className="group text-start rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 hover:ring-1 hover:ring-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta?.bg ?? "bg-primary/10 text-primary"}`}>
                      {meta?.icon ?? <ScanSearch className="h-4.5 w-4.5" />}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold leading-tight">{pick(card.name, card.nameAr)}</h3>
                      <p className="text-[11px] text-muted-foreground">{card.count} {lang === "ar" ? "مطابقة" : "matches"}</p>
                    </div>
                  </div>
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/10 px-2 text-sm font-bold tabular text-primary">
                    {card.count}
                  </span>
                </div>
                <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">{card.description}</p>
                {card.topMatches.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {card.topMatches.map((m) => (
                      <span
                        key={m.companyId}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium"
                      >
                        {m.ticker}
                        <span className="text-muted-foreground">{m.period}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground/70 italic">{lang === "ar" ? "لا مطابقات في أحدث سنة" : "No matches in the latest annual period"}</p>
                )}
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  {t("common.viewWhy")} <ArrowRight className="h-3 w-3 rtl-flip" />
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Recent events + dividend calendar */}
      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3 p-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("dash.recentEvents")}</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-2.5 overflow-y-auto scrollbar-thin">
            {data.recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("co.noEvents")}</p>
            ) : (
              data.recentEvents.map((e) => {
                const meta = EVENT_TYPE_MAP[e.eventType]
                const toneBorder = meta?.tone === "positive" ? "border-s-4 border-s-emerald-500/70" : meta?.tone === "negative" ? "border-s-4 border-s-red-500/70" : "border-s-4 border-s-slate-400/50"
                return (
                  <button
                    key={e.id}
                    onClick={() => onOpenCompany(e.company.id)}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-start transition-colors hover:bg-muted/50 ${toneBorder}`}
                  >
                    <EventBadge
                      small
                      label={pick(meta?.labelEn ?? e.eventType, meta?.labelAr)}
                      tone={meta?.tone ?? "neutral"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-bold">{e.company.ticker}</span>
                        <span className="truncate text-muted-foreground">{pick(e.company.nameEn, e.company.nameAr)}</span>
                        {e.company.isDemoData ? <DemoBadge small /> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                        {pick(e.explanationEn, e.explanationAr)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {e.periodLabel}
                    </span>
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 p-0">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("dash.dividendCalendar")}</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onViewChange("dividends")}>
              {t("dash.viewAll")}
            </Button>
          </CardHeader>
          <CardContent className="max-h-96 space-y-2.5 overflow-y-auto scrollbar-thin">
            {data.upcomingDividends.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
            ) : (
              data.upcomingDividends.map((d) => (
                <button
                  key={d.id}
                  onClick={() => d.company && onOpenCompany(d.company.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-start transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-bold">{d.company?.ticker}</span>
                      <span className="truncate text-muted-foreground">{pick(d.company?.nameEn, d.company?.nameAr)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {d.dividendPerShare ? `${t("dv.dps")}: ${d.dividendPerShare} EGP · ` : ""}
                      {d.distributionDate
                        ? `${t("dv.distribution")}: ${fmtDate(d.distributionDate)}`
                        : d.notes || t("dv.notAnnounced")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusChipMini status={d.status} />
                    {d.announcementDate ? (
                      <span className="text-[10px] text-muted-foreground">{fmtDate(d.announcementDate)}</span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function StatusChipMini({ status }: { status: string }) {
  return <span className="rounded bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300 border border-teal-500/30">{status}</span>
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return iso
  }
}

const presetIcons: Record<string, { icon: React.ReactNode; bg: string }> = {
  TURNAROUND: { icon: <TrendingUp className="h-4.5 w-4.5" />, bg: "bg-emerald-500/10 text-emerald-600" },
  PROFIT_GROWTH: { icon: <TrendingUp className="h-4.5 w-4.5" />, bg: "bg-green-500/10 text-green-600" },
  DETERIORATION: { icon: <TrendingDown className="h-4.5 w-4.5" />, bg: "bg-red-500/10 text-red-500" },
  REVENUE_GROWTH: { icon: <TrendingUp className="h-4.5 w-4.5" />, bg: "bg-teal-500/10 text-teal-600" },
  DEBT_REDUCTION: { icon: <TrendingDown className="h-4.5 w-4.5" />, bg: "bg-sky-500/10 text-sky-600" },
  EQUITY_GROWTH: { icon: <TrendingUp className="h-4.5 w-4.5" />, bg: "bg-cyan-500/10 text-cyan-600" },
  STRONG_CASH_FLOW: { icon: <Sparkles className="h-4.5 w-4.5" />, bg: "bg-lime-500/10 text-lime-600" },
  FINANCIAL_RECOVERY: { icon: <TrendingUp className="h-4.5 w-4.5" />, bg: "bg-emerald-500/10 text-emerald-700" },
  STRONG_ROE: { icon: <Sparkles className="h-4.5 w-4.5" />, bg: "bg-amber-500/10 text-amber-600" },
  HIGH_ASSETS: { icon: <Building2 className="h-4.5 w-4.5" />, bg: "bg-slate-500/10 text-slate-600" },
  PROFIT_ACCELERATION: { icon: <TrendingUp className="h-4.5 w-4.5" />, bg: "bg-green-500/10 text-green-700" },
  DIVIDEND_CALENDAR: { icon: <CalendarDays className="h-4.5 w-4.5" />, bg: "bg-teal-500/10 text-teal-700" },
  VALUE_P_B: { icon: <Scale className="h-4.5 w-4.5" />, bg: "bg-violet-500/10 text-violet-600" },
  DIVIDEND_YIELD: { icon: <Percent className="h-4.5 w-4.5" />, bg: "bg-fuchsia-500/10 text-fuchsia-600" },
}
