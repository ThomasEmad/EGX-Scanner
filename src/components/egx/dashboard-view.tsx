"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, BellRing, Building2, CalendarDays, FileWarning, Lock, Percent, Scale, ScanSearch, Sparkles, Star, TrendingDown, TrendingUp, FileCheck2, Gauge } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, getUserToken, type DashboardData } from "@/lib/client/api"
import { useWatchlist } from "@/lib/client/watchlist"
import { useI18n } from "@/lib/i18n"
import { formatEgp } from "@/lib/financial/units"
import { DemoBadge, EventBadge } from "./shared"
import { QaBox } from "./qa-box"
import { EVENT_TYPE_MAP } from "@/lib/financial/registry"
import type { ViewKey } from "@/lib/view-keys"

export function DashboardView({
  onOpenScanner,
  onOpenCompany,
  onViewChange,
}: {
  onOpenScanner: (ruleId: string) => void
  onOpenCompany: (id: string) => void
  onViewChange: (v: ViewKey) => void
}) {
  const router = useRouter()
  const { t, lang, pick } = useI18n()
  const [scannerCategory, setScannerCategory] = useState<string>("ALL")
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard })
  const { data: subData } = useQuery({ queryKey: ["my-subscription"], queryFn: () => api.subscription() })
  const { data: latest } = useQuery({ queryKey: ["latest-results"], queryFn: () => api.latestResults(), staleTime: 60_000 })
  const { data: valuation } = useQuery({
    queryKey: ["market-valuation"],
    queryFn: () => fetch("/api/v1/dashboard/valuation").then((r) => (r.ok ? ((r.json() as unknown) as { results: { companyId: string; ticker: string; name: string; sector: string; pe: number | null; discountPct: number | null }[] }) : null)),
    staleTime: 300_000,
  })
  const isPremium = !!subData?.isPremium
  const { data: adminStats } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => fetch("/api/v1/admin/dashboard", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
    enabled: !!getUserToken(),
    staleTime: 60_000,
  })
  const watchItems = useWatchlist((s) => s.items)
  const watchIds = watchItems.map((w) => w.id)

  // Watchlist alerts digest — latest events among watched companies (client-side
  // preference; the filter itself runs server-side via /api/v1/events?companyIds=)
  const alertsQuery = useQuery({
    queryKey: ["watch-alerts", watchIds.join(",")],
    queryFn: () => api.eventsFeed(watchIds, 8),
    enabled: watchIds.length > 0 && isPremium,
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


  return (
    <div className="space-y-8">
      {/* Market overview hero — gradient + live KPI row */}
      <section className="page-glow relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-6 sm:p-8">
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">{t("dash.title")}</h1>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">{t("dash.subtitle")}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => onViewChange("scanners")} className="btn-primary shadow-sm shadow-primary/15">
                <ScanSearch className="h-4 w-4" />
                {t("nav.scanners")}
              </Button>
              <Button variant="outline" onClick={() => onViewChange("custom")} className="border-border/70 hover:border-primary/30">
                {t("nav.customScanner")}
              </Button>
            </div>
          </div>
          {/* live KPI chips */}
          <div className="grid grid-cols-2 lg:grid-cols-2 gap-2.5 lg:w-90">
            <div className="rounded-xl border border-border/50 bg-card/70 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "الشركات المدرجة" : "Listed companies"}</p>
              <p className="text-xl font-bold tabular text-primary">{data.stats.companies}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/70 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "إفصاح" : "Filings"}</p>
              <p className="text-xl font-bold tabular text-primary">{data.stats.reports?.toLocaleString?.() ?? data.stats.reports}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/70 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "قيمة متحقق منها" : "Verified values"}</p>
              <p className="text-xl font-bold tabular text-primary">{data.stats.validValues?.toLocaleString?.() ?? data.stats.validValues}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/70 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "حدث مكتشف" : "Detected events"}</p>
              <p className="text-xl font-bold tabular text-primary">{data.stats.events?.toLocaleString?.() ?? data.stats.events}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Ask-the-market Q&A */}
      <QaBox compact />

      {/* Watchlist strip */}
      {watchItems.length > 0 ? (
        <section aria-label={t("watchlist.title")} className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
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
                  className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-card px-2.5 py-1 text-[11px] font-semibold transition-all duration-150 hover:bg-amber-400/10 hover:border-amber-400/60"
                >
                  {w.ticker}
                </button>
              ))}
            </div>
            <button onClick={() => router.push("/watchlist")} className="ms-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              {lang === "ar" ? "القائمة كاملة ←" : "Full watchlist →"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Watchlist alerts digest */}
      {watchItems.length > 0 ? (
        <section aria-label={t("dash.watchAlerts")} className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
              {isPremium ? <BellRing className="h-4 w-4" /> : <Lock className="h-4 w-4 text-amber-500" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight">{t("dash.watchAlerts")}</h2>
              <p className="text-[11px] text-muted-foreground">{t("dash.watchAlertsSub")}</p>
            </div>
          </div>
          {!isPremium ? (
            <div className="mt-3 flex flex-col items-center gap-2 py-4 text-center text-xs text-muted-foreground">
              <p>{lang === "ar" ? "الأحداث متاحة لمشتركي Premium فقط" : "Company Events are available for Premium subscribers only"}</p>
              <Button size="sm" variant="link" className="h-auto gap-1 text-xs" onClick={() => router.push("/premium")}>
                {lang === "ar" ? "ترقية" : "Upgrade"}
              </Button>
            </div>
          ) : alertsQuery.isLoading ? (
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
                    className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-start transition-all duration-150 hover:bg-muted/50 hover:border-primary/20"
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


      {/* Latest announced results */}
      {latest && latest.results.length > 0 ? (
        <section aria-label={lang === "ar" ? "أحدث النتائج المعلنة" : "Latest announced results"} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
              <FileCheck2 className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold">{lang === "ar" ? "أحدث النتائج المعلنة" : "Latest announced results"}</h2>
            <span className="text-[11px] text-muted-foreground">{lang === "ar" ? "أحدث صافي ربح معلن لكل شركة — الأحدث أولاً" : "most recent announced net profit per company — newest first"}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {latest.results.map((r) => (
              <button key={r.companyId} onClick={() => onOpenCompany(r.companyId)} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 text-start transition-all duration-150 hover:border-primary/40 hover:shadow-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{r.ticker}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{r.name}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="h-4 px-1 text-[9px]">{r.periodLabel}</Badge>
                    <span>{r.asOf ? new Date(r.asOf).toISOString().slice(0, 10) : ""}</span>
                  </div>
                </div>
                <span className={`shrink-0 text-sm font-semibold tabular ${r.netProfit < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {formatEgp(r.netProfit)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Valuation opportunities (sector-relative screen) */}
      {valuation && valuation.results.length > 0 ? (
        <section aria-label={lang === "ar" ? "فرص التقييم" : "Valuation opportunities"} className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10 text-violet-600">
                <Gauge className="h-3.5 w-3.5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold leading-tight">{lang === "ar" ? "فرص التقييم — أقل من متوسط القطاع" : "Valuation opportunities — below sector"}</h2>
                <p className="text-[10px] text-muted-foreground">{lang === "ar" ? "مقارنة المكررات بوسيط القطاع — تحقق قبل القرار" : "Multiples vs sector median — verify before deciding"}</p>
              </div>
            </div>
            {!isPremium ? (
              <Badge variant="outline" className="gap-1 text-[10px]"><Lock className="h-3 w-3" />{lang === "ar" ? "بريميوم" : "Premium"}</Badge>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(isPremium ? valuation.results.slice(0, 12) : valuation.results.slice(0, 3)).map((r) => (
              <button key={r.companyId} onClick={() => onOpenCompany(r.companyId)} className="rounded-xl border border-border/60 bg-card p-3 text-start transition-all duration-150 hover:border-violet-500/40 hover:shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{r.ticker}</span>
                  <span className={`text-xs font-semibold tabular ${r.discountPct && r.discountPct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                    {r.discountPct !== null ? `${r.discountPct > 0 ? "-" : "+"}${Math.abs(r.discountPct).toFixed(0)}% ${lang === "ar" ? "من القطاع" : "vs sector"}` : "—"}
                  </span>
                </div>
                <p className="truncate text-[10px] text-muted-foreground">{r.name}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  P/E: <span className="tabular">{r.pe ? r.pe.toFixed(1) : "—"}x</span>
                  {isPremium ? null : <span className="ms-2">🔒</span>}
                </p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Scanner discovery grid */}
      <section aria-label={t("dash.scannerDiscovery")}>
        <div className="mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("dash.scannerDiscovery")}</h2>
            <p className="text-sm text-muted-foreground">{t("dash.scannerDiscoverySub")}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              { key: "ALL", label: t("dash.allPresets") },
              { key: "TURNAROUND", label: t("dash.catTurnaround") },
              { key: "GROWTH", label: t("dash.catGrowth") },
              { key: "QUALITY", label: lang === "ar" ? "جودة وملاءة" : "Quality & Cash" },
              { key: "DIVIDENDS", label: t("dash.catDividends") },
            ].map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setScannerCategory(cat.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  scannerCategory === cat.key
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.scannerCards
            .filter((card) => {
              if (scannerCategory === "ALL") return true
              const pk = card.presetKey ?? ""
              if (scannerCategory === "TURNAROUND") return pk.includes("TURNAROUND") || pk.includes("RECOVERY")
              if (scannerCategory === "GROWTH") return pk.includes("GROWTH") || pk.includes("ACCELERATION")
              if (scannerCategory === "QUALITY") return pk.includes("ROE") || pk.includes("CASH_FLOW") || pk.includes("DEBT") || pk.includes("ASSETS")
              if (scannerCategory === "DIVIDENDS") return pk.includes("DIVIDEND") || pk.includes("VALUE")
              return true
            })
            .map((card) => {
            const meta = card.presetKey ? presetIcons[card.presetKey] : undefined
            return (
              <button
                key={card.id}
                onClick={() => onOpenScanner(card.id)}
                className="group text-start rounded-xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.02] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta?.bg ?? "bg-primary/10 text-primary"}`}>
                      {meta?.icon ?? <ScanSearch className="h-4.5 w-4.5" />}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold leading-tight">{pick(card.name, card.nameAr)}</h3>
                      <p className="text-[11px] text-muted-foreground">{card.count} {lang === "ar" ? "مطابقة" : "matches"}</p>
                    </div>
                  </div>
                  <span className="flex h-8 min-w-8 items-center justify-center rounded-xl bg-primary/10 px-2.5 text-sm font-bold tabular num text-primary">
                    {card.count}
                  </span>
                </div>
                <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">{card.description}</p>
                {card.topMatches.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {card.topMatches.map((m) => (
                      <span
                        key={m.companyId}
                        className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-medium border border-border/50"
                      >
                        {m.ticker}
                        <span className="text-muted-foreground">{m.period}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground/70 italic">{lang === "ar" ? "لا مطابقات في أحدث سنة" : "No matches in the latest annual period"}</p>
                )}
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary transition-opacity duration-150 opacity-0 group-hover:opacity-100">
                  {t("common.viewWhy")} <ArrowRight className="h-3 w-3 rtl-flip" />
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Recent events + dividend calendar */}
      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3 p-0 border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              {t("dash.recentEvents")}
              {!isPremium ? <Lock className="h-3.5 w-3.5 text-amber-500" aria-hidden /> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-2.5 overflow-y-auto scrollbar-thin">
            {data.recentEvents.length === 0 && !isPremium ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-xs text-muted-foreground">
                <Lock className="h-5 w-5 text-amber-500" aria-hidden />
                <p>{lang === "ar" ? "الأحداث متاحة لمشتركي Premium فقط" : "Company Events are available for Premium subscribers only"}</p>
                <Button size="sm" variant="link" className="h-auto gap-1 text-xs" onClick={() => router.push("/premium")}>
                  {lang === "ar" ? "ترقية" : "Upgrade"}
                </Button>
              </div>
            ) : data.recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("co.noEvents")}</p>
            ) : (
              data.recentEvents.map((e) => {
                const meta = EVENT_TYPE_MAP[e.eventType]
                const toneBorder = meta?.tone === "positive" ? "border-s-4 border-s-emerald-500/70" : meta?.tone === "negative" ? "border-s-4 border-s-red-500/70" : "border-s-4 border-s-slate-400/50"
                return (
                  <button
                    key={e.id}
                    onClick={() => onOpenCompany(e.company.id)}
                    className={`flex w-full items-start gap-3 rounded-lg border border-border/60 bg-card p-3.5 text-start transition-all duration-150 hover:bg-muted/50 hover:border-primary/20 ${toneBorder}`}
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

        <Card className="lg:col-span-2 p-0 border-border/60">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">{t("dash.dividendCalendar")}</CardTitle>
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
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3.5 text-start transition-all duration-150 hover:bg-muted/50 hover:border-primary/20"
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
