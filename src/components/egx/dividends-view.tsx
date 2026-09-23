"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"
import { StatusChip } from "./shared"

const STATUSES = ["ANNOUNCED", "UPCOMING", "ELIGIBLE", "PAID", "EXPIRED", "CANCELLED"]

export function DividendsView({ onOpenCompany }: { onOpenCompany: (id: string) => void }) {
  const { t, pick, lang } = useI18n()
  const [status, setStatus] = useState<string>("active")

  const { data, isLoading } = useQuery({
    queryKey: ["dividends", status],
    queryFn: () => api.dividends(status === "all" ? undefined : status),
  })

  const dividends = data?.dividends ?? []

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
