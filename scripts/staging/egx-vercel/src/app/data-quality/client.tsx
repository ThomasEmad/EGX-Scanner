"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ShieldCheck, ShieldAlert, ShieldQuestion, Download, Search, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

interface Label { en: string; ar: string }
interface RootCauseLabel extends Label { action: Label }

interface CompanyRow {
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string | null
  score: number
  rating: string
  accuracy: number | null
  completeness: number | null
  freshness: number | null
  provenance: number | null
  certification: string
  blockerCount: number
  coverageGapCount: number
  rootCauses: string[]
}

interface IssueRow {
  id: string
  ticker: string
  metricCode: string | null
  period: string | null
  category: string
  severity: string
  description: string
  descriptionAr: string | null
  issueClass: string
  rootCause: string
  rootCauseLabel: RootCauseLabel | null
  issueClassLabel: Label | null
}

interface Report {
  run: { id: string; startedAt: string; durationSec: number; companiesChecked: number; issuesFound: number }
  summary: {
    totalIssues: number
    byClass: Record<string, number>
    bySeverity: Record<string, number>
    byRootCause: Record<string, number>
    certification: Record<string, number>
    certified: number
    provisional: number
    reviewRequired: number
  }
  totalFiltered: number
  companies: CompanyRow[]
  totalCompanies: number
  issues: IssueRow[]
  certificationLabels: Record<string, Label>
  rootCauseLabels: Record<string, RootCauseLabel>
  issueClassLabels: Record<string, Label>
}

const SEV_AR: Record<string, string> = { critical: "حرج", high: "عالي", medium: "متوسط", low: "منخفض" }
const CLASS_STYLE: Record<string, string> = {
  blocker: "border-red-500/40 bg-red-500/10 text-red-600",
  coverage: "border-sky-500/40 bg-sky-500/10 text-sky-600",
  advisory: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  metadata: "border-slate-500/40 bg-slate-500/10 text-slate-600",
}
const CERT_STYLE: Record<string, string> = {
  certified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  provisional: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  review_required: "border-red-500/40 bg-red-500/10 text-red-600",
}
const CERT_ICON: Record<string, typeof ShieldCheck> = {
  certified: ShieldCheck,
  provisional: Clock3,
  review_required: ShieldAlert,
}

function scoreColor(n: number | null) {
  if (n === null) return "text-muted-foreground"
  if (n >= 95) return "text-emerald-600"
  if (n >= 80) return "text-amber-600"
  return "text-red-600"
}

export default function DataQualityPage() {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const [ticker, setTicker] = useState("")
  const [issueClass, setIssueClass] = useState("")
  const [certification, setCertification] = useState("")
  const [rootCause, setRootCause] = useState("")
  const [q, setQ] = useState("")

  // Deep-link support: /data-quality?ticker=FWRY (used by the confidence badge).
  // Read after mount so the page stays statically renderable.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("ticker")
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time URL hydration
    if (t) setTicker(t.toUpperCase())
  }, [])

  const query = useMemo(() => {
    const sp = new URLSearchParams()
    if (ticker.trim()) sp.set("ticker", ticker.trim().toUpperCase())
    if (issueClass) sp.set("class", issueClass)
    if (certification) sp.set("certification", certification)
    if (rootCause) sp.set("rootCause", rootCause)
    if (q.trim()) sp.set("q", q.trim())
    return sp.toString()
  }, [ticker, issueClass, certification, rootCause, q])

  const { data, isLoading } = useQuery({
    queryKey: ["data-quality-page", query],
    queryFn: () => fetch(`/api/v1/data-quality?${query}`).then((r) => (r.ok ? (r.json() as Promise<Report>) : null)),
    staleTime: 60_000,
  })

  const rootCauses = data ? Object.entries(data.summary.byRootCause).sort((a, b) => b[1] - a[1]) : []
  const csvHref = `/api/v1/data-quality?${query}${query ? "&" : ""}format=csv`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            {ar ? "جودة البيانات والاعتماد" : "Data Quality & Certification"}
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            {ar
              ? "كل رقم مالي في المنصة يخضع لتدقيق محاسبي آلي. الدقة تُقيَّم منفصلة عن الاكتمال والحداثة وسلامة السجل: المشاكل الحاجزة فقط تخفض الدقة. الاعتماد \"معتمد\" يعني عدم وجود أي تعارض جوهري."
              : "Every financial figure is machine-audited. Accuracy is scored separately from completeness, freshness and record integrity: only blockers reduce accuracy. “Certified” means no material contradiction remains."}
          </p>
          {data ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {ar
                ? `آخر تدقيق: ${new Date(data.run.startedAt).toLocaleString("ar-EG")} — ${data.run.companiesChecked} شركة في ${data.run.durationSec} ثانية`
                : `Last run: ${new Date(data.run.startedAt).toLocaleString("en-GB")} — ${data.run.companiesChecked} companies in ${data.run.durationSec}s`}
            </p>
          ) : null}
        </div>
        <a
          href={csvHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold hover:bg-muted/60"
        >
          <Download className="h-3.5 w-3.5" />
          {ar ? "تصدير CSV" : "Export CSV"}
        </a>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 text-xs">
          <p className="font-semibold text-amber-700 dark:text-amber-400">
            {ar ? "تغطية معلّقة" : "Coverage suspended"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {ar
              ? "لا تتوفر قوائم مالية موثوقة للشركات التالية، لذا لا تظهر في التصنيفات أو خريطة الموقع: ECCW، EFOOD، MESF، PSFL، RPCO، VODE. شركة KORA مدرجة حديثاً ولم تنشر قوائم مالية بعد؛ تظهر بيانات السعر فقط."
              : "No authoritative financial statements are available for the following companies, so they are excluded from rankings and the sitemap: ECCW, EFOOD, MESF, PSFL, RPCO, VODE. KORA is a recent listing and has not published statements yet; only its price data is shown."}
          </p>
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{ar ? "جارٍ التحميل…" : "Loading…"}</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-0 border-emerald-500/30"><CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{ar ? "معتمد" : "Certified"}</p>
              <p className="text-2xl font-bold tabular text-emerald-600">{data.summary.certified}</p>
              <p className="text-[10px] text-muted-foreground">{ar ? "لا توجد مشاكل حاجزة" : "no blockers"}</p>
            </CardContent></Card>
            <Card className="p-0 border-amber-500/30"><CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground"><Clock3 className="h-3.5 w-3.5 text-amber-500" />{ar ? "مؤقت" : "Provisional"}</p>
              <p className="text-2xl font-bold tabular text-amber-600">{data.summary.provisional}</p>
              <p className="text-[10px] text-muted-foreground">{ar ? "دقة عالية مع نواقص تغطية" : "accurate, coverage gaps"}</p>
            </CardContent></Card>
            <Card className="p-0 border-red-500/30"><CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground"><ShieldAlert className="h-3.5 w-3.5 text-red-500" />{ar ? "يتطلب مراجعة" : "Review required"}</p>
              <p className="text-2xl font-bold tabular text-red-600">{data.summary.reviewRequired}</p>
              <p className="text-[10px] text-muted-foreground">{ar ? "تعارض جوهري واحد على الأقل" : "≥1 material blocker"}</p>
            </CardContent></Card>
            <Card className="p-0"><CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" />{ar ? "مشاكل حاجزة" : "Blockers"}</p>
              <p className="text-2xl font-bold tabular">{data.summary.byClass.blocker ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">{ar ? `من ${data.summary.totalIssues} ملاحظة` : `of ${data.summary.totalIssues} findings`}</p>
            </CardContent></Card>
          </div>

          <Card className="p-0">
            <CardContent className="flex flex-wrap items-center gap-2 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={ar ? "بحث بالرمز أو الاسم…" : "Search ticker or name…"}
                  className="h-8 w-48 rounded-lg border border-border/60 bg-background ps-8 pe-2 text-xs outline-none focus:border-primary"
                />
              </div>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder={ar ? "الرمز" : "Ticker"}
                className="h-8 w-24 rounded-lg border border-border/60 bg-background px-2 text-xs uppercase outline-none focus:border-primary"
              />
              <select value={issueClass} onChange={(e) => setIssueClass(e.target.value)} className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs">
                <option value="">{ar ? "كل الفئات" : "All classes"}</option>
                <option value="blocker">{ar ? "حاجز" : "Blocker"}</option>
                <option value="coverage">{ar ? "تغطية" : "Coverage"}</option>
                <option value="advisory">{ar ? "إرشادي" : "Advisory"}</option>
                <option value="metadata">{ar ? "بيانات وصفية" : "Metadata"}</option>
              </select>
              <select value={certification} onChange={(e) => setCertification(e.target.value)} className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs">
                <option value="">{ar ? "كل درجات الاعتماد" : "All certifications"}</option>
                <option value="certified">{ar ? "معتمد" : "Certified"}</option>
                <option value="provisional">{ar ? "مؤقت" : "Provisional"}</option>
                <option value="review_required">{ar ? "يتطلب مراجعة" : "Review required"}</option>
              </select>
              <select value={rootCause} onChange={(e) => setRootCause(e.target.value)} className="h-8 max-w-[230px] rounded-lg border border-border/60 bg-background px-2 text-xs">
                <option value="">{ar ? "كل الأسباب" : "All root causes"}</option>
                {rootCauses.map(([k, n]) => (
                  <option key={k} value={k}>{ar ? (data.rootCauseLabels[k]?.ar ?? k) : (data.rootCauseLabels[k]?.en ?? k)} ({n})</option>
                ))}
              </select>
              <span className="ms-auto text-[11px] text-muted-foreground">
                {ar ? `${data.totalFiltered} نتيجة` : `${data.totalFiltered} results`}
              </span>
            </CardContent>
          </Card>

          <Card className="p-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{ar ? "بطاقات الشركات" : "Company scorecards"} <span className="text-muted-foreground">({data.totalCompanies})</span></CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className="border-y border-border/50 bg-muted/30 text-[10px] uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-start">{ar ? "الرمز" : "Ticker"}</th>
                    <th className="px-3 py-2 text-start">{ar ? "الشركة" : "Company"}</th>
                    <th className="px-3 py-2 text-start">{ar ? "الاعتماد" : "Certification"}</th>
                    <th className="px-3 py-2 text-end">{ar ? "الدقة" : "Accuracy"}</th>
                    <th className="px-3 py-2 text-end">{ar ? "الاكتمال" : "Completeness"}</th>
                    <th className="px-3 py-2 text-end">{ar ? "الحداثة" : "Freshness"}</th>
                    <th className="px-3 py-2 text-end">{ar ? "سلامة السجل" : "Integrity"}</th>
                    <th className="px-3 py-2 text-end">{ar ? "حاجز" : "Blockers"}</th>
                    <th className="px-3 py-2 text-start">{ar ? "الأسباب" : "Root causes"}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.companies.map((c) => {
                    const Icon = CERT_ICON[c.certification] ?? ShieldQuestion
                    return (
                      <tr key={c.ticker} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="px-3 py-2 font-bold"><Link href={`/company/${c.ticker}`} className="hover:underline">{c.ticker}</Link></td>
                        <td className="px-3 py-2 text-muted-foreground">{ar ? (c.nameAr ?? c.nameEn) : c.nameEn}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CERT_STYLE[c.certification] ?? ""}`}>
                            <Icon className="h-3 w-3" />
                            {ar ? (data.certificationLabels[c.certification]?.ar ?? c.certification) : (data.certificationLabels[c.certification]?.en ?? c.certification)}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-end font-bold tabular ${scoreColor(c.accuracy)}`}>{c.accuracy ?? "—"}</td>
                        <td className="px-3 py-2 text-end tabular">{c.completeness ?? "—"}</td>
                        <td className="px-3 py-2 text-end tabular">{c.freshness ?? "—"}</td>
                        <td className="px-3 py-2 text-end tabular">{c.provenance ?? "—"}</td>
                        <td className="px-3 py-2 text-end tabular font-bold">{c.blockerCount}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {c.rootCauses.slice(0, 3).map((rc) => (
                              <Badge key={rc} variant="outline" className="text-[9px]" title={ar ? data.rootCauseLabels[rc]?.action?.ar : data.rootCauseLabels[rc]?.action?.en}>
                                {ar ? (data.rootCauseLabels[rc]?.ar ?? rc) : (data.rootCauseLabels[rc]?.en ?? rc)}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="p-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{ar ? "الملاحظات" : "Findings"} <span className="text-muted-foreground">({data.totalFiltered})</span></CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.issues.map((i) => (
                <div key={i.id} className="rounded-lg border border-border/40 p-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={`text-[9px] ${CLASS_STYLE[i.issueClass] ?? ""}`}>
                      {ar ? (i.issueClassLabel?.ar ?? i.issueClass) : (i.issueClassLabel?.en ?? i.issueClass)}
                    </Badge>
                    <Badge variant="outline" className="text-[9px]">{ar ? SEV_AR[i.severity] ?? i.severity : i.severity}</Badge>
                    <Link href={`/company/${i.ticker}`} className="font-bold hover:underline">{i.ticker}</Link>
                    {i.period ? <span className="text-muted-foreground">{i.period}</span> : null}
                    {i.metricCode ? <span className="font-mono text-[10px] text-muted-foreground">{i.metricCode}</span> : null}
                    <span className="ms-auto text-[10px] text-muted-foreground">{ar ? (i.rootCauseLabel?.ar ?? i.rootCause) : (i.rootCauseLabel?.en ?? i.rootCause)}</span>
                  </div>
                  <p className="mt-1">{ar ? (i.descriptionAr ?? i.description) : i.description}</p>
                  {i.rootCauseLabel ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      <span className="font-semibold">{ar ? "الإجراء: " : "Action: "}</span>
                      {ar ? i.rootCauseLabel.action.ar : i.rootCauseLabel.action.en}
                    </p>
                  ) : null}
                </div>
              ))}
              {data.issues.length === 0 ? <p className="p-4 text-center text-xs text-muted-foreground">{ar ? "لا توجد نتائج مطابقة." : "No matching findings."}</p> : null}
              {data.totalFiltered > data.issues.length ? (
                <p className="pt-1 text-center text-[10px] text-muted-foreground">
                  {ar
                    ? `يتم عرض ${data.issues.length} من ${data.totalFiltered} ملاحظة — استخدم تصدير CSV للقائمة الكاملة.`
                    : `Showing ${data.issues.length} of ${data.totalFiltered} findings — use CSV export for the full list.`}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
