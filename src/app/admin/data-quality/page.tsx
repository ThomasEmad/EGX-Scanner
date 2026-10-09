"use client"

import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

interface AuditData {
  run: { id: string; startedAt: string; endedAt: string; durationSec: number; companiesChecked: number; issuesFound: number }
  bySeverity: Record<string, number>
  byCategory: Record<string, number>
  distribution: { high: number; medium: number; low: number; critical: number }
  worst: { ticker: string; score: number; rating: string; breakdownJson: string }[]
  topIssues: { id: string; ticker: string; metricCode: string | null; period: string | null; category: string; severity: string; description: string }[]
}

const SEV_AR: Record<string, string> = { critical: "حرج", high: "عالي", medium: "متوسط", low: "منخفض" }
const CAT_AR: Record<string, string> = {
  accounting: "هوية محاسبية", logical: "منطق مالي", temporal: "زمني", cross_source: "تعارض مصادر",
  missing: "بيانات ناقصة", outlier: "قيم شاذة", provenance: "مصدر/هوية", sector: "خصائص القطاع",
}

export default function DataQualityAdminPage() {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["data-quality"],
    queryFn: () => fetch("/api/v1/admin/data-quality").then((r) => (r.ok ? (r.json() as Promise<AuditData>) : null)),
    refetchInterval: 300_000,
  })

  const ratingColor: Record<string, string> = { high: "bg-emerald-500/15 text-emerald-600", medium: "bg-amber-500/15 text-amber-600", low: "bg-orange-500/15 text-orange-600", critical: "bg-red-500/15 text-red-600" }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            {ar ? "جودة البيانات — التدقيق الشامل" : "Data Quality — Full Audit"}
          </h1>
          {data ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {ar ? `آخر تدقيق: ${new Date(data.run.startedAt).toLocaleString("ar-EG")} — ${data.run.companiesChecked} شركة في ${data.run.durationSec} ثانية` : `Last run: ${new Date(data.run.startedAt).toLocaleString()} — ${data.run.companiesChecked} companies in ${data.run.durationSec}s`}
            </p>
          ) : null}
        </div>
        <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold hover:bg-muted/60">
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          {ar ? "تحديث" : "Refresh"}
        </button>
      </div>

      {isLoading || !data ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{ar ? "جارٍ التحميل…" : "Loading…"}</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="p-0"><CardContent className="p-4">
              <p className="text-[10px] uppercase text-muted-foreground">{ar ? "إجمالي المشاكل" : "Total issues"}</p>
              <p className="text-2xl font-bold tabular">{data.run.issuesFound}</p>
            </CardContent></Card>
            {["critical", "high", "medium"].map((sev) => (
              <Card key={sev} className={`p-0 ${sev === "critical" ? "border-red-500/40" : sev === "high" ? "border-amber-500/40" : ""}`}>
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase text-muted-foreground">{ar ? SEV_AR[sev] : sev}</p>
                  <p className={`text-2xl font-bold tabular ${sev === "critical" ? "text-red-600" : sev === "high" ? "text-amber-600" : ""}`}>{data.bySeverity[sev] ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-0">
              <CardHeader className="pb-2"><CardTitle className="text-sm">{ar ? "حسب الفئة" : "By category"}</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {Object.entries(data.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
                  <div key={cat} className="flex items-center justify-between text-xs">
                    <span>{ar ? CAT_AR[cat] ?? cat : cat}</span>
                    <span className="font-bold tabular">{n}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="p-0">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><ShieldAlert className="h-4 w-4 text-red-500" />{ar ? "أقل 15 شركة ثقة" : "15 lowest-confidence companies"}</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {data.worst.map((w) => (
                  <div key={w.ticker} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold">{w.ticker}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${w.score >= 80 ? "bg-emerald-500" : w.score >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${w.score}%` }} />
                      </div>
                      <span className="w-8 text-end font-bold tabular">{w.score}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="p-0">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-500" />{ar ? "أهم المشاكل الحرجة والعالية" : "Top critical & high issues"}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.topIssues.slice(0, 40).map((iss) => (
                <div key={iss.id} className="flex items-start gap-2 rounded-lg border border-border/40 p-2.5 text-xs">
                  <Badge variant="outline" className={`shrink-0 text-[9px] ${iss.severity === "critical" ? "border-red-500/40 text-red-600" : "border-amber-500/40 text-amber-600"}`}>{ar ? SEV_AR[iss.severity] : iss.severity}</Badge>
                  <span className="shrink-0 font-bold">{iss.ticker}</span>
                  <span className="text-muted-foreground">{iss.description}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
