import type { Metadata } from "next"
import Link from "next/link"
import { Activity, BellRing, Building2, FileText, LineChart, Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// /status — public trust page: what the platform serves, how fresh the data
// is, and links to the machine-readable status feed. Honest engineering: the
// numbers come straight from the database (60s cache), nothing marketing-ed.

export const metadata: Metadata = {
  title: "حالة المنصة · Platform status",
  description: "Uptime, data freshness and coverage of the EGX analysis platform.",
  robots: { index: true, follow: true },
}

export const revalidate = 60

async function loadStatus() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || ""
  try {
    const res = await fetch(`${base}/api/v1/status`, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as {
      market: { pricesAsOf: string | null; delayMinutes: number | null; trackedPrices: number | null }
      data: {
        companiesTotal: number
        companiesActive: number
        financialReports: number
        marketPricePoints: number
        aiAnalyses: number
        latestReportImportedAt: string | null
      }
      usage: { activePriceAlerts: number }
    }
  } catch {
    return null
  }
}

function fmtDate(v: string | null): string {
  if (!v) return "—"
  return new Date(v).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) +
    " · " + new Date(v).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
}

export default async function StatusPage() {
  const s = await loadStatus()

  const cards = [
    {
      icon: Building2,
      labelAr: "الشركات المغطاة",
      labelEn: "Companies covered",
      value: s ? `${s.data.companiesActive.toLocaleString("en-EG")} / ${s.data.companiesTotal.toLocaleString("en-EG")}` : "—",
    },
    {
      icon: FileText,
      labelAr: "القوائم المالية المستوردة",
      labelEn: "Financial statements",
      value: s ? s.data.financialReports.toLocaleString("en-EG") : "—",
    },
    {
      icon: LineChart,
      labelAr: "نقاط الأسعار المسجّلة",
      labelEn: "Recorded price points",
      value: s ? s.data.marketPricePoints.toLocaleString("en-EG") : "—",
    },
    {
      icon: Sparkles,
      labelAr: "تحليلات AI محفوظة",
      labelEn: "Cached AI analyses",
      value: s ? s.data.aiAnalyses.toLocaleString("en-EG") : "—",
    },
    {
      icon: BellRing,
      labelAr: "تنبيهات نشطة",
      labelEn: "Active price alerts",
      value: s ? s.usage.activePriceAlerts.toLocaleString("en-EG") : "—",
    },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
          <Activity className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </div>
        <h1 className="text-xl font-bold">
          <span dir="auto">حالة المنصة</span>
          <span className="mx-1 text-muted-foreground" aria-hidden>·</span>
          Platform status
        </h1>
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
          <span dir="auto">تعمل الآن</span> · Operational
        </Badge>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.labelEn} className="p-4">
            <c.icon className="mb-2 h-4 w-4 text-muted-foreground" aria-hidden />
            <div className="text-lg font-bold tabular-nums">{c.value}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              <span dir="auto">{c.labelAr}</span>
              <br />
              {c.labelEn}
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-3 p-5 text-sm">
        <div>
          <h2 className="mb-2 font-bold">
            <span dir="auto">حداثة البيانات</span> · Data freshness
          </h2>
          <dl className="space-y-2 text-xs">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
              <dt className="text-muted-foreground"><span dir="auto">آخر تسعيرة سوق مسجّلة</span> · Latest market price</dt>
              <dd className="tabular-nums">{fmtDate(s?.market.pricesAsOf ?? null)}</dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
              <dt className="text-muted-foreground"><span dir="auto">تأخير السعر المعروض</span> · Price delay shown</dt>
              <dd>{s?.market.delayMinutes != null ? `${s.market.delayMinutes} min` : "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
              <dt className="text-muted-foreground"><span dir="auto">أحدث قائمة مستوردة</span> · Latest statement imported</dt>
              <dd className="tabular-nums">{fmtDate(s?.data.latestReportImportedAt ?? null)}</dd>
            </div>
          </dl>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span dir="auto">
            الأسعار تُحدَّث خارج جلسة التداول عبر مزود بيانات السوق، ولا تُخترع أي قيمة داخل المنصة — ما لا يوجد مصدره يظهر «غير متوفر».
          </span>
          <br />
          Prices refresh outside trading hours from the market data provider; nothing is invented — missing data shows as unavailable.
        </p>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">
        <span dir="auto">بيانات مُصدَّرة آلياً؟ </span>
        <Link href="/api/v1/status" className="font-semibold text-primary hover:underline">/api/v1/status</Link>
        {" · "}
        <Link href="/api/v1/companies/export" className="font-semibold text-primary hover:underline">CSV</Link>
      </p>
    </div>
  )
}
