import { Metadata } from "next"
import { db } from "@/lib/db"
import { gatherCompanyAnalytics } from "@/lib/analytics/gather"
import { computeCompanyScores } from "@/lib/financial/scores"
import { CALC_METRIC_MAP, EVENT_TYPE_MAP } from "@/lib/financial/registry"
import { isPremiumUser } from "@/lib/subscription"
import { PrintReportButton } from "./print-button"

// /company/[id]/report — print-ready investor report. Free users see the
// one-page summary; Premium renders the full multi-year document + print/PDF.

export const metadata: Metadata = {
  title: "تقرير الشركة — EGX Financial Scanner",
  robots: { index: false, follow: false },
}

function fmtEgp(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)} مليار`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)} مليون`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)} ألف`
  return v.toFixed(2)
}
const pct = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : `${v.toFixed(digits)}%`)

export default async function CompanyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({
    where: { id },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, industry: true, isin: true, sharesOutstanding: true },
  })
  if (!company) {
    return (
      <main className="mx-auto max-w-3xl p-10 text-center text-sm">الشركة غير موجودة.</main>
    )
  }

  const g = await gatherCompanyAnalytics(id)
  const scores = await computeCompanyScores(id).catch(() => null)

  // premium gate — the full document is a subscriber feature. The session token
  // is mirrored into a cookie at login (see setUserToken), so server components
  // can resolve it; users logged in before this change just re-log in once.
  const { cookies } = await import("next/headers")
  const cookieStore = await cookies()
  const token = cookieStore.get("egx-user-token")?.value ?? null
  let premium = false
  if (token) {
    const sessionUserId = await db.session.findUnique({ where: { token }, select: { userId: true } })
    if (sessionUserId) premium = await isPremiumUser(sessionUserId.userId)
  }

  const latest = g?.latest ?? {}
  const prior = g?.prior ?? {}
  const fy = g?.latestYear

  // 4-year annual trend for the full (premium) report
  const trendCodes = ["revenue", "net_profit", "operating_cash_flow", "total_equity", "total_assets"]
  const trendRows = premium
    ? (await db.$queryRawUnsafe(
        `SELECT code, "fiscalYear", value FROM (
           SELECT cm.code, cm."fiscalYear", cm.value,
                  ROW_NUMBER() OVER (PARTITION BY cm.code, cm."fiscalYear" ORDER BY cm."fiscalYear" DESC) AS rn
           FROM CalculatedMetric cm
           WHERE cm."companyId" = ? AND cm."periodType" = 'ANNUAL' AND cm."valueStatus" = 'OK'
             AND cm.value IS NOT NULL AND cm.statementType = 'CONSOLIDATED'
             AND cm.code IN (${trendCodes.map(() => "?").join(",")})
         ) t WHERE rn = 1 ORDER BY code, "fiscalYear" DESC`,
        id, ...trendCodes
      )) as { code: string; fiscalYear: number; value: number }[]
    : []
  const years = [...new Set(trendRows.map((r) => r.fiscalYear))].sort((a, b) => b - a).slice(0, 4)
  const trendByCode = new Map<string, Map<number, number>>()
  for (const r of trendRows) {
    if (!trendByCode.has(r.code)) trendByCode.set(r.code, new Map())
    if (years.includes(r.fiscalYear)) trendByCode.get(r.code)!.set(r.fiscalYear, r.value)
  }

  const events = premium
    ? await db.financialEvent.findMany({
        where: { companyId: id },
        orderBy: [{ detectedAt: "desc" }],
        take: 5,
        select: { eventType: true, periodLabel: true, explanationAr: true, explanationEn: true },
      })
    : []
  const dividends = premium
    ? await db.dividend.findMany({ where: { companyId: id }, orderBy: { announcementDate: "desc" }, take: 4, select: { dividendPerShare: true, announcementDate: true, status: true } })
    : []

  const keyMetrics: { label: string; value: string }[] = [
    { label: "الإيرادات", value: fmtEgp(latest["REVENUE"]) },
    { label: "صافي الربح", value: fmtEgp(latest["NET_PROFIT"]) },
    { label: "هامش صافي الربح", value: pct(latest["NET_MARGIN"]) },
    { label: "العائد على حقوق الملكية ROE", value: pct(latest["ROE"]) },
    { label: "العائد على الأصول ROA", value: pct(latest["ROA"]) },
    { label: "نمو الإيرادات", value: pct(latest["REVENUE_GROWTH"]) },
    { label: "نمو صافي الربح", value: pct(latest["PROFIT_GROWTH"]) },
    { label: "الدين / حقوق الملكية", value: latest["DEBT_TO_EQUITY"] !== null && latest["DEBT_TO_EQUITY"] !== undefined ? latest["DEBT_TO_EQUITY"].toFixed(2) : "—" },
    { label: "ربحية السهم EPS", value: latest["EPS"] !== null && latest["EPS"] !== undefined ? `${latest["EPS"].toFixed(2)} EGP` : "—" },
    { label: "القيمة الدفترية للسهم", value: latest["BOOK_VALUE_PER_SHARE"] !== null && latest["BOOK_VALUE_PER_SHARE"] !== undefined ? `${latest["BOOK_VALUE_PER_SHARE"].toFixed(2)} EGP` : "—" },
    { label: "المكرر P/E", value: latest["P_E"] !== null && latest["P_E"] !== undefined ? `${latest["P_E"].toFixed(1)}x` : "—" },
    { label: "المكرر P/B", value: latest["P_B"] !== null && latest["P_B"] !== undefined ? `${latest["P_B"].toFixed(2)}x` : "—" },
    { label: "القيمة السوقية", value: fmtEgp(latest["MARKET_CAP"]) },
    { label: "آخر سعر مسجّل", value: g?.currentPrice !== null && g?.currentPrice !== undefined ? `${g.currentPrice.toFixed(2)} EGP` : "—" },
  ]

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-slate-900 print:p-0 min-h-svh">
      {/* header */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {company.ticker} — {company.nameAr ?? company.nameEn}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {company.nameEn} · قطاع {company.sector}
            {company.industry ? ` · ${company.industry}` : ""}
            {company.isin ? ` · ISIN ${company.isin}` : ""}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            تقرير استثماري من EGX Financial Scanner — أحدث قوائم سنوية متحقق منها{fy ? ` (FY${fy})` : ""}. تاريخ التقرير: {new Date().toISOString().slice(0, 10)}
          </p>
        </div>
        {premium ? <PrintReportButton label="طباعة / PDF" /> : null}
      </div>

      {/* key metrics */}
      <section className="mt-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">أهم المؤشرات الاستثمارية</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
          {keyMetrics.map((m) => (
            <div key={m.label} className="flex items-baseline justify-between gap-2 border-b border-dashed border-slate-200 pb-1">
              <span className="text-[11px] text-slate-500">{m.label}</span>
              <span className="text-[13px] font-bold tabular">{m.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* health score */}
      {scores && scores.overall !== null ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">الصحة المالية</h2>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-emerald-600 text-lg font-bold text-emerald-700">
              {Math.round(scores.overall)}
            </div>
            <div className="flex-1 text-[11px] text-slate-600">
              من 100 — حسابية من مؤشرات متحقق منها (ربحية/نمو/سيولة/رفع مالي/نقدية). الدرجة استرشادية وليست توصية.
            </div>
          </div>
        </section>
      ) : null}

      {!premium ? (
        <section className="mt-8 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-6 text-center">
          <p className="text-sm font-bold text-amber-800">هذا ملخص مجاني من التقرير الكامل</p>
          <p className="mx-auto mt-2 max-w-md text-xs text-amber-700">
            النسخة الكاملة تضيف: جدول 4 سنوات (إيرادات، أرباح، تدفقات، حقوق ملكية)، أحدث الأحداث المالية المكتشفة، سجل التوزيعات، وطباعة PDF بخط نظيف — لمشتركي Premium.
          </p>
          <a href="/premium" className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white">ترقية إلى بريميوم</a>
        </section>
      ) : (
        <>
          {/* multi-year trend (premium) */}
          {years.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">الاتجاه السنوي (EGP)</h2>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="border border-slate-300 p-1.5 text-start font-semibold">البند</th>
                    {years.map((y) => (
                      <th key={y} className="border border-slate-300 p-1.5 text-end font-semibold">FY{y}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trendCodes.map((code) => (
                    <tr key={code}>
                      <td className="border border-slate-300 p-1.5">{CALC_METRIC_MAP[code]?.labelAr ?? code}</td>
                      {years.map((y) => (
                        <td key={y} className="border border-slate-300 p-1.5 text-end tabular">{fmtEgp(trendByCode.get(code)?.get(y) ?? null)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* events (premium) */}
          {events.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">أحدث الأحداث المالية المكتشفة</h2>
              <ul className="space-y-1.5">
                {events.map((e, i) => (
                  <li key={i} className="text-[11px]">
                    <span className="font-bold">{EVENT_TYPE_MAP[e.eventType]?.labelAr ?? e.eventType}</span>
                    <span className="text-slate-500"> ({e.periodLabel})</span> — {e.explanationAr ?? e.explanationEn}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* dividends (premium) */}
          {dividends.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">سجل التوزيعات</h2>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="border border-slate-300 p-1.5 text-start font-semibold">السهم (EGP)</th>
                    <th className="border border-slate-300 p-1.5 text-start font-semibold">الإعلان</th>
                    <th className="border border-slate-300 p-1.5 text-start font-semibold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {dividends.map((d, i) => (
                    <tr key={i}>
                      <td className="border border-slate-300 p-1.5 tabular">{d.dividendPerShare ?? "—"}</td>
                      <td className="border border-slate-300 p-1.5">{d.announcementDate ? d.announcementDate.toISOString().slice(0, 10) : "—"}</td>
                      <td className="border border-slate-300 p-1.5">{d.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      )}

      {/* provenance + disclaimer */}
      <footer className="mt-8 border-t border-slate-300 pt-3 text-[10px] leading-relaxed text-slate-500">
        <p>
          مصادر البيانات: Yahoo Finance، Reuters، مباشر (Mubasher)، AskBorsa، TradingView، والإفصاحات الرسمية — كل قيمة تحمل مصدرها في المنصة مع تحقق آلي ومنطق توازن الميزانية.
        </p>
        <p className="mt-1 font-semibold">
          إخلاء مسؤولية: هذا التقرير أداة تعليمية/معلوماتية تعرض أوضاع مالية واقعية بأرقام متحقق منها، وليس توصية شراء أو بيع. اتخذ قراراتك الاستثمارية بمسؤوليتك أو باستشارة مرخص.
        </p>
      </footer>
    </main>
  )
}
