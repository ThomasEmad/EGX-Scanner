"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ClipboardCheck, ChevronDown, ChevronRight, CheckCircle2, Trash2, Undo2, Ban, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { toast } from "sonner"

interface QueueRow {
  id: string
  ticker: string
  nameEn: string
  nameAr: string | null
  periodType: string
  periodLabel: string
  fiscalYear: number
  sourceName: string
  processingStatus: string
  valuesTotal: number
  valuesValid: number
  valuesReview: number
  topReasons: { reason: string; count: number }[]
}

interface DetailValue {
  id: string
  metricCode: string
  originalLabel: string
  value: number
  normalizedValue: number
  unit: string
  currency: string
  subPeriod: string | null
  statementType: string
  validationStatus: string
  validationNotes: string | null
}

interface ReportDetail {
  report: {
    id: string
    ticker: string
    periodLabel: string
    fiscalYear: number
    sourceName: string
    sourceUrl: string | null
    processingStatus: string
    createdAt: string
    values: DetailValue[]
  }
}

type Action = "approve_report" | "delete_review_values" | "promote_values" | "reject_report"

const fmt = (v: number) => Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(2)

export default function AdminReviewPage() {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-review-queue"],
    queryFn: () => fetch("/api/v1/admin/review", { credentials: "include" }).then((r) => (r.ok ? (r.json() as Promise<{ queue: QueueRow[]; total: number }>) : { queue: [], total: 0 })),
  })

  const detail = useQuery({
    queryKey: ["admin-review-detail", expanded],
    enabled: !!expanded,
    queryFn: () => fetch(`/api/v1/admin/review?reportId=${expanded}`, { credentials: "include" }).then((r) => (r.ok ? (r.json() as Promise<ReportDetail>) : null)),
  })

  const act = useMutation({
    mutationFn: (payload: { reportId: string; action: Action; valueIds?: string[] }) =>
      fetch("/api/v1/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })),
    onSuccess: ({ status, body }) => {
      if (status >= 400) {
        toast.error(ar ? `فشل الإجراء: ${JSON.stringify(body)}` : `Action failed: ${JSON.stringify(body)}`)
        return
      }
      const b = body as { promoted?: number; deletedValues?: number; reportRemoved?: boolean }
      const msg = b.promoted ? (ar ? `تم ترحيل ${b.promoted} قيمة` : `Promoted ${b.promoted} values`)
        : b.deletedValues !== undefined ? (ar ? `حذف ${b.deletedValues} قيمة${b.reportRemoved ? " وأزيل التقرير الفاضي" : ""}` : `Deleted ${b.deletedValues} values${b.reportRemoved ? " (report removed)" : ""}`)
        : ar ? "تم" : "Done"
      toast.success(msg)
      qc.invalidateQueries({ queryKey: ["admin-review-queue"] })
      qc.invalidateQueries({ queryKey: ["admin-review-detail"] })
    },
  })

  const btn = "inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            {ar ? "مراجعة الداتا — موافقة/حذف/ترحيل" : "Data review — approve / delete / promote"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {ar
              ? "التقارير اللي فيها قيم معزولة (منسوخة/مشبوهة). اعتمد التقرير، امسح القيم المخترعة عشان السكريبت يعيد استيرادها، أو رحّل قيمة متحقق منها لـ VALID."
              : "Reports holding quarantined values (copies/suspect). Approve the report, delete the invented values so the importer can re-fill them, or promote a verified value back to VALID."}
          </p>
        </div>
        <button onClick={() => refetch()} className={btn}>
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          {ar ? "تحديث" : "Refresh"}
        </button>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{ar ? "جارٍ التحميل…" : "Loading…"}</CardContent></Card>
      ) : !data?.queue.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-semibold">{ar ? "مفيش حاجة محتاجة مراجعة" : "Nothing needs review"}</p>
            <p className="text-xs text-muted-foreground">{ar ? "كل القيم المعزولة اتصلحت أو اتحذفت." : "All quarantined values are resolved or deleted."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.queue.map((r) => {
            const open = expanded === r.id
            return (
              <Card key={r.id} className="p-0">
                <div className="flex flex-col gap-2 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setExpanded(open ? null : r.id)} className="flex items-center gap-1 text-sm font-bold hover:text-primary">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {r.ticker}
                    </button>
                    <span className="text-xs text-muted-foreground">{r.nameEn ?? r.nameAr}</span>
                    <Badge variant="outline" className="text-[10px]">{r.periodLabel}</Badge>
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600">
                      {ar ? `${r.valuesReview} قيمة معزولة من ${r.valuesTotal}` : `${r.valuesReview}/${r.valuesTotal} values quarantined`}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{r.processingStatus}</Badge>
                    <span className="text-[10px] text-muted-foreground">{r.sourceName}</span>
                    <div className="ms-auto flex flex-wrap items-center gap-1.5">
                      <button className={`${btn} hover:border-emerald-500/50 hover:text-emerald-600`} disabled={act.isPending}
                        onClick={() => act.mutate({ reportId: r.id, action: "approve_report" })}>
                        <CheckCircle2 className="h-3.5 w-3.5" />{ar ? "اعتماد" : "Approve"}
                      </button>
                      <button className={`${btn} hover:border-sky-500/50 hover:text-sky-600`} disabled={act.isPending}
                        onClick={() => { if (confirm(ar ? "ترحيل كل القيم المعزولة للتقرير ده لـ VALID؟ الستاتس هيبقى معتمد من الأدمن." : "Promote ALL quarantined values of this report to VALID? They will be admin-approved.")) act.mutate({ reportId: r.id, action: "promote_values" }) }}>
                        <Undo2 className="h-3.5 w-3.5" />{ar ? "ترحيل الكل" : "Promote all"}
                      </button>
                      <button className={`${btn} hover:border-amber-500/50 hover:text-amber-600`} disabled={act.isPending}
                        onClick={() => { if (confirm(ar ? "حذف القيم المخترعة من التقرير ده؟ الأماكن هتفضى ويمكن للسكريبت يعيد استيرادها من askborsa." : "Delete the quarantined values? The slots free up for the AskBorsa importer to re-fill.")) act.mutate({ reportId: r.id, action: "delete_review_values" }) }}>
                        <Trash2 className="h-3.5 w-3.5" />{ar ? "حذف المعزول" : "Delete quarantined"}
                      </button>
                      <button className={`${btn} hover:border-red-500/50 hover:text-red-600`} disabled={act.isPending}
                        onClick={() => { if (confirm(ar ? "رفض التقرير بالكامل؟ مش هيظهر في الموقع خالص." : "Reject the whole report? It disappears from the site entirely.")) act.mutate({ reportId: r.id, action: "reject_report" }) }}>
                        <Ban className="h-3.5 w-3.5" />{ar ? "رفض" : "Reject"}
                      </button>
                    </div>
                  </div>
                  {r.topReasons.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 ps-6">
                      {r.topReasons.map((t) => (
                        <span key={t.reason} className="rounded-full border border-border/50 bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {t.reason} ×{t.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {open && (
                  <div className="border-t border-border/40 p-3.5">
                    {detail.isLoading ? (
                      <p className="text-center text-xs text-muted-foreground">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
                    ) : detail.data ? (
                      <>
                        <p className="mb-2 text-[11px] text-muted-foreground">
                          {detail.data.report.sourceUrl
                            ? <a href={detail.data.report.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{ar ? "مصدر التقرير ↗" : "report source ↗"}</a>
                            : detail.data.report.sourceName}
                          {" · "}{new Date(detail.data.report.createdAt).toLocaleDateString(ar ? "ar-EG" : "en-GB")}
                        </p>
                        <div className="max-h-96 overflow-auto rounded-lg border border-border/40">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                              <tr className="text-start text-[10px] uppercase text-muted-foreground">
                                <th className="p-2 text-start font-medium">{ar ? "البند" : "Metric"}</th>
                                <th className="p-2 text-start font-medium">{ar ? "القيمة" : "Value"}</th>
                                <th className="p-2 text-start font-medium">{ar ? "الحالة" : "Status"}</th>
                                <th className="p-2 text-start font-medium">{ar ? "ملاحظة" : "Note"}</th>
                                <th className="p-2 text-start font-medium"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.data.report.values.map((v) => (
                                <tr key={v.id} className={`border-t border-border/30 ${v.validationStatus === "NEEDS_REVIEW" ? "bg-amber-500/5" : ""}`}>
                                  <td className="p-2 font-semibold">{v.metricCode}</td>
                                  <td className="p-2 tabular">{fmt(v.normalizedValue)} <span className="text-[9px] text-muted-foreground">{v.unit}</span></td>
                                  <td className="p-2">
                                    <Badge variant="outline" className={`text-[9px] ${v.validationStatus === "VALID" ? "border-emerald-500/40 text-emerald-600" : "border-amber-500/40 text-amber-600"}`}>
                                      {v.validationStatus}
                                    </Badge>
                                  </td>
                                  <td className="max-w-72 truncate p-2 text-[10px] text-muted-foreground" title={v.validationNotes ?? undefined}>{v.validationNotes ?? "—"}</td>
                                  <td className="p-2">
                                    {v.validationStatus === "NEEDS_REVIEW" ? (
                                      <button className={btn} disabled={act.isPending}
                                        onClick={() => act.mutate({ reportId: r.id, action: "promote_values", valueIds: [v.id] })}>
                                        {ar ? "رحّل" : "Promote"}
                                      </button>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <p className="text-center text-xs text-muted-foreground">{ar ? "تعذر تحميل التفاصيل" : "Failed to load detail"}</p>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
