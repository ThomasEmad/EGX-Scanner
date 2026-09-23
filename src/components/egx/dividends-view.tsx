"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, CalendarRange } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"
import { StatusChip } from "./shared"

const STATUSES = ["ANNOUNCED", "UPCOMING", "ELIGIBLE", "PAID", "EXPIRED", "CANCELLED"]

const STATUS_DOT: Record<string, string> = {
  ANNOUNCED: "bg-teal-500",
  UPCOMING: "bg-cyan-500",
  ELIGIBLE: "bg-sky-500",
  PAID: "bg-emerald-500",
  EXPIRED: "bg-slate-400",
  CANCELLED: "bg-red-400",
}

export function DividendsView({ onOpenCompany }: { onOpenCompany: (id: string) => void }) {
  const { t, pick, lang } = useI18n()
  const [status, setStatus] = useState<string>("active")

  const { data, isLoading } = useQuery({
    queryKey: ["dividends", status],
    queryFn: () => api.dividends(status === "all" ? undefined : status),
  })
  // calendar always shows everything (statuses filtered by dot color, not omission)
  const { data: calData, isLoading: calLoading } = useQuery({
    queryKey: ["dividends", "calendar"],
    queryFn: () => api.dividends(),
  })

  const dividends = data?.dividends ?? []
  const calDividends = calData?.dividends ?? []

  // Next 12 months grid (starting from the current month)
  const months = useMemo(() => {
    const now = new Date()
    const list: { key: string; year: number; month: number; label: string; items: { id: string; ticker: string; companyId: string; day: number; status: string; dps: number | null }[] }[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      list.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { month: "short" }),
        items: [],
      })
    }
    const index = new Map(list.map((m) => [m.key, m]))
    for (const div of calDividends) {
      const dates: { iso: string | null }[] = [
        { iso: div.announcementDate },
        { iso: div.eligibilityDate },
        { iso: div.exDividendDate },
        { iso: div.distributionDate },
      ]
      const seen = new Set<string>()
      for (const { iso } of dates) {
        if (!iso) continue
        const d = new Date(iso)
        const key = `${d.getFullYear()}-${d.getMonth()}`
        const bucket = index.get(key)
        if (!bucket || seen.has(key)) continue
        seen.add(key)
        bucket.items.push({
          id: `${div.id}-${key}`,
          ticker: div.company?.ticker ?? "—",
          companyId: div.company?.id ?? "",
          day: d.getDate(),
          status: div.status,
          dps: div.dividendPerShare,
        })
      }
    }
    for (const m of list) m.items.sort((a, b) => a.day - b.day)
    return list
  }, [calDividends, lang])

  // group by month of announcement (or distribution fallback)
  const groups = new Map<string, typeof dividends>()
  for (const d of dividends) {
    const date = d.announcementDate || d.distributionDate
    const key = date ? new Date(date).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "—"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(d)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <CalendarDays className="h-5 w-5 text-primary" />
            {t("nav.dividends")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === "ar"
              ? "لا يتم استنتاج أي تواريخ غير معلنة رسمياً — تظهر كـ «لم يُعلن رسمياً»."
              : "Unofficial dates are never inferred — they are shown as “not officially announced”."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["active", "all", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                status === s ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "active" ? (lang === "ar" ? "قادمة/معلنة" : "Active") : s === "all" ? (lang === "ar" ? "الكل" : "All") : s.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Next 12 months calendar grid */}
      <Card className="p-0">
        <div className="flex items-center gap-2 border-b p-4 pb-3">
          <CalendarRange className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold leading-tight">{t("dv.next12")}</h2>
            <p className="text-[11px] text-muted-foreground">{t("dv.next12Sub")}</p>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {["ANNOUNCED", "ELIGIBLE", "PAID", "CANCELLED"].map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s] ?? "bg-slate-400"}`} aria-hidden />
                {s.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {calLoading
            ? Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="bg-card p-3">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="mt-2 h-8 rounded-md" />
                </div>
              ))
            : months.map((m) => (
                <div key={m.key} className={`min-h-24 bg-card p-3 transition-colors ${m.items.length > 0 ? "" : "opacity-60"}`}>
                  <p className="flex items-baseline gap-1 text-[11px] font-semibold text-muted-foreground">
                    {m.label}
                    <span className="text-[9px] font-normal">{m.year}</span>
                    {m.items.length > 0 ? (
                      <span className="ms-auto rounded-full bg-primary/10 px-1.5 text-[9px] font-bold text-primary">{m.items.length}</span>
                    ) : null}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {m.items.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground/60">{t("dv.noEventsThisMonth")}</span>
                    ) : (
                      m.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => item.companyId && onOpenCompany(item.companyId)}
                          className="flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-start text-[10px] transition-colors hover:bg-muted/60"
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[item.status] ?? "bg-slate-400"}`} aria-hidden />
                          <span className="font-bold">{item.ticker}</span>
                          <span className="tabular text-muted-foreground">{item.day}</span>
                          {item.dps !== null ? <span className="ms-auto tabular text-muted-foreground">{item.dps}</span> : null}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : dividends.length === 0 ? (
        <Card className="flex h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {t("common.noData")}
        </Card>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([month, items]) => (
            <section key={month}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{month}</h2>
              <div className="space-y-2.5">
                {items.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => d.company && onOpenCompany(d.company.id)}
                    className="flex w-full flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-lg border bg-card p-4 text-start transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{d.company?.ticker}</span>
                        <span className="truncate text-xs text-muted-foreground">{pick(d.company?.nameEn, d.company?.nameAr)}</span>
                        {d.company?.sector ? <span className="text-[10px] text-muted-foreground">· {d.company.sector}</span> : null}
                      </div>
                      {d.notes ? <p className="mt-1 text-[11px] italic text-muted-foreground">{d.notes}</p> : null}
                    </div>
                    {d.dividendPerShare !== null ? (
                      <div className="text-sm font-bold tabular">
                        {d.dividendPerShare} <span className="text-[10px] font-normal text-muted-foreground">EGP / {t("dv.dps")}</span>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-4">
                      <DateCell label={t("dv.announcement")} iso={d.announcementDate} />
                      <DateCell label={t("dv.eligibility")} iso={d.eligibilityDate} />
                      <DateCell label={t("dv.exDate")} iso={d.exDividendDate} />
                      <DateCell label={t("dv.distribution")} iso={d.distributionDate} />
                    </div>
                    <StatusChip status={d.status} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function DateCell({ label, iso }: { label: string; iso: string | null }) {
  const { t } = useI18n()
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wide">{label}</dt>
      <dd className={`tabular ${iso ? "font-medium text-foreground" : "italic text-slate-400"}`}>
        {iso ? fmtDate(iso) : t("dv.notAnnounced")}
      </dd>
    </div>
  )
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return iso
  }
}
