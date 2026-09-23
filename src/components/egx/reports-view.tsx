"use client"

import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, FileCheck2, HardDriveDownload, History, Lock, LogOut, Upload, UploadCloud, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { api, type ReviewData } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"
import { formatEgp } from "@/lib/financial/units"
import { DemoBadge, StatusChip } from "./shared"

export function ReportsView({ onOpenCompany }: { onOpenCompany: (id: string) => void }) {
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [token, setToken] = useState<string | null>(() => (typeof window !== "undefined" ? localStorage.getItem("egx-admin-token") : null))
  const [passcode, setPasscode] = useState("")
  const [loginOpen, setLoginOpen] = useState(false)

  const [companyId, setCompanyId] = useState("")
  const [reportType, setReportType] = useState("INTERIM")
  const [periodType, setPeriodType] = useState("QUARTERLY")
  const [fiscalYear, setFiscalYear] = useState("2025")
  const [periodLabel, setPeriodLabel] = useState("")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [sourceName, setSourceName] = useState("Manual upload")

  const { data: companies } = useQuery({ queryKey: ["companies-all"], queryFn: () => api.companies({ pageSize: 50, page: 1 }) })
  const { data: review, refetch: refetchReview } = useQuery({ queryKey: ["review"], queryFn: api.review, enabled: !!token })
  const { data: reports } = useQuery({
    queryKey: ["uploaded-reports", token],
    queryFn: () => api.reports({ status: "NEW_DOWNLOADED" }),
    enabled: !!token,
  })
  const { data: auditData } = useQuery({
    queryKey: ["uploaded-reports-all", token],
    queryFn: () => api.reports({ page: 1 }),
    enabled: !!token,
  })

  const loginMutation = useMutation({
    mutationFn: () => api.adminLogin(passcode),
    onSuccess: (res) => {
      localStorage.setItem("egx-admin-token", res.token)
      setToken(res.token)
      setLoginOpen(false)
      setPasscode("")
      toast({ title: lang === "ar" ? "تم دخول المشرف" : "Admin unlocked" })
    },
    onError: (e) => toast({ title: t("rp.adminLogin"), description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!fileRef.current?.files?.[0]) throw new Error("Choose a file first")
      const form = new FormData()
      form.set("file", fileRef.current.files[0])
      form.set("companyId", companyId)
      form.set("reportType", reportType)
      form.set("periodType", periodType)
      form.set("fiscalYear", fiscalYear)
      form.set("periodLabel", periodLabel)
      form.set("periodStart", periodStart)
      form.set("periodEnd", periodEnd)
      form.set("sourceName", sourceName)
      return api.uploadReport(form, token as string)
    },
    onSuccess: (res) => {
      toast({
        title: lang === "ar" ? "تم الرفع" : "Uploaded",
        description: `${res.report.periodLabel} — ${res.report.processingStatus}`,
      })
      refetchReview()
      queryClient.invalidateQueries({ queryKey: ["uploaded-reports"] })
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e)
      const isDup = msg.includes("Duplicate")
      toast({
        title: isDup ? t("rp.duplicate") : lang === "ar" ? "فشل الرفع" : "Upload failed",
        description: msg,
        variant: isDup ? "default" : "destructive",
      })
    },
  })

  const processMutation = useMutation({
    mutationFn: (id: string) => api.processReport(id, token as string),
    onSuccess: (res) => {
      toast({
        title: res.ok ? (lang === "ar" ? "تمت المعالجة" : "Processed") : lang === "ar" ? "يحتاج مراجعة" : "Needs review",
        description: res.ok
          ? `${res.extractedCount} extracted · ${res.validCount} valid · ${res.needsReviewCount} review`
          : res.message,
        variant: res.ok ? "default" : "destructive",
      })
      refetchReview()
      queryClient.invalidateQueries({ queryKey: ["uploaded-reports"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveReport(id, token as string),
    onSuccess: () => {
      toast({
        title: lang === "ar" ? "تم اعتماد التقرير" : "Report approved",
        description: lang === "ar" ? "أعيد حساب المؤشرات والأحداث." : "Metrics & events recomputed.",
      })
      queryClient.invalidateQueries({ queryKey: ["uploaded-reports-all"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["company"] })
      queryClient.invalidateQueries({ queryKey: ["metrics"] })
    },
    onError: (e) => toast({ title: "Approve failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const reviewActionMutation = useMutation({
    mutationFn: (args: { id: string; body: { action: string; value?: number; metricCode?: string; unit?: string } }) =>
      api.reviewAction(args.id, args.body, token as string),
    onSuccess: () => {
      refetchReview()
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e) => toast({ title: "Review action failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  if (!token) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-10">
        <Card className="p-6 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-bold">{t("rp.adminLogin")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "ar" ? "الرفع والمراجعة متاحان للمشرفين فقط (الافتراضي: egx-admin)." : "Upload & review are admin-gated (default passcode: egx-admin)."}
          </p>
          <div className="mt-4 flex gap-2">
            <Input type="password" placeholder={t("rp.passcode")} value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            <Button onClick={() => loginMutation.mutate()} disabled={loginMutation.isPending}>
              {t("rp.unlock")}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <FileCheck2 className="h-5 w-5 text-primary" />
          {t("nav.reports")}
        </h1>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => {
            localStorage.removeItem("egx-admin-token")
            setToken(null)
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("rp.lock")}
        </Button>
      </div>

      {/* Upload */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <UploadCloud className="h-4 w-4 text-primary" />
            {t("rp.uploadTitle")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("rp.uploadSub")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded-md bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">{t("rp.hintCsv")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">{t("nav.companies")}</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {(companies?.companies ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.ticker} — {c.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.reportType")} / {t("common.period")}</Label>
              <div className="flex gap-1.5">
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="h-9 w-1/2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANNUAL">ANNUAL</SelectItem>
                    <SelectItem value="INTERIM">INTERIM</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={periodType} onValueChange={setPeriodType}>
                  <SelectTrigger className="h-9 w-1/2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUARTERLY">QUARTERLY</SelectItem>
                    <SelectItem value="SEMIANNUAL">SEMIANNUAL</SelectItem>
                    <SelectItem value="ANNUAL">ANNUAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.fiscalYear")} · {t("rp.periodLabel")}</Label>
              <div className="flex gap-1.5">
                <Input className="h-9 w-20 tabular" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="2025" />
                <Input className="h-9 flex-1" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="Q3 2025" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.periodStart")} → {t("rp.periodEnd")}</Label>
              <div className="flex gap-1.5">
                <Input type="date" className="h-9 w-1/2" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                <Input type="date" className="h-9 w-1/2" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Input type="file" ref={fileRef} accept=".csv,.txt,.pdf" className="h-9 flex-1" />
            <Input className="h-9 sm:w-48" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder={t("rp.sourceName")} />
            <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !companyId || !periodLabel || !periodEnd}>
              <Upload className="h-4 w-4" />
              {t("rp.upload")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reports to process */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("rp.pendingReports")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!reports || reports.total === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
          ) : (
            reports.reports.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold">{r.company?.ticker}</span>
                    <span>{r.periodLabel}</span>
                    <StatusChip status={r.processingStatus} />
                  </div>
                  {r.notes ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{r.notes}</p> : null}
                  {r.fileHash ? <p className="mt-0.5 truncate text-[10px] font-mono text-muted-foreground/70">sha256: {r.fileHash}</p> : null}
                </div>
                <Button size="sm" variant="outline" onClick={() => processMutation.mutate(r.id)} disabled={processMutation.isPending}>
                  <HardDriveDownload className="h-3.5 w-3.5" />
                  {processMutation.isPending ? t("rp.processing") : t("rp.process")}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Review queue */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            {t("rp.reviewQueue")}
            {review && review.values.length > 0 ? <Badge className="tabular">{review.values.length}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!review ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : review.values.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {lang === "ar" ? "لا عناصر بانتظار المراجعة." : "Review queue is empty."}
            </p>
          ) : (
            <div className="max-h-[480px] space-y-3 overflow-y-auto scrollbar-thin pe-1">
              {review.values.map((v) => (
                <ReviewValueRow key={v.id} v={v} onAction={(body) => reviewActionMutation.mutate({ id: v.id, body })} t={t} lang={lang} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploaded reports (approve / audit) */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4 text-primary" />
            {t("rp.uploadedFiles")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 space-y-1.5 overflow-y-auto scrollbar-thin">
            {(auditData?.reports ?? []).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.company?.ticker}</span>
                  <span>{r.periodLabel}</span>
                  <StatusChip status={r.processingStatus} />
                  {r.extractionMethod ? <Badge variant="outline" className="font-mono text-[9px]">{r.extractionMethod}</Badge> : null}
                  {r.isDemoData ? <DemoBadge small /> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground tabular">{r.valueCount} {t("co.values")}</span>
                  {r.processingStatus === "NEW_DOWNLOADED" ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => processMutation.mutate(r.id)} disabled={processMutation.isPending}>
                      {processMutation.isPending ? t("rp.processing") : t("rp.process")}
                    </Button>
                  ) : null}
                  {r.processingStatus === "VALIDATED" && !r.isDemoData ? (
                    <Button size="sm" className="h-7 text-xs" onClick={() => approveMutation.mutate(r.id)} disabled={approveMutation.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t("rp.approve")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ReviewValueRow({
  v,
  onAction,
  t,
  lang,
}: {
  v: ReviewData["values"][number]
  onAction: (body: { action: string; value?: number; metricCode?: string; unit?: string }) => void
  t: (k: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string
  lang: string
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(v.value))
  const [metricCode, setMetricCode] = useState(v.metricCode)

  const suggestionOptions = ["REVENUE", "COGS", "GROSS_PROFIT", "OPERATING_INCOME", "NET_PROFIT", "EPS", "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_DEBT", "DEPOSITS", "LOANS_NET", "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW"]

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">{v.company.ticker}</span>
            <span className="text-muted-foreground">{v.report.periodLabel}</span>
            <Badge variant="outline" className="font-mono text-[9px]">{v.metricCode}</Badge>
          </div>
          <p className="mt-1 text-xs">
            <span className="text-muted-foreground">{t("co.originalLabel")}:</span> <em>{v.originalLabel}</em>
          </p>
          {v.sourceText ? <p className="mt-0.5 truncate text-[10px] text-muted-foreground/80">“{v.sourceText}”</p> : null}
          {v.validationNotes ? (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400">
              <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
              {v.validationNotes}
            </p>
          ) : null}
        </div>
        <div className="text-end">
          <p className="text-sm font-bold tabular">
            {v.value.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{v.unit} {v.currency}</span>
          </p>
          <p className="text-[10px] text-muted-foreground tabular">
            {t("co.confidence")}: {(v.confidence * 100).toFixed(0)}% · {formatEgp(v.normalizedValue, { withCurrency: false })}
          </p>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2.5">
          <Select value={metricCode} onValueChange={setMetricCode}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-56">
              {suggestionOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" step="any" className="h-8 w-32 tabular" value={value} onChange={(e) => setValue(e.target.value)} />
          <Select value={v.unit} onValueChange={() => undefined}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="UNIT">UNIT</SelectItem>
              <SelectItem value="THOUSAND">THOUSAND</SelectItem>
              <SelectItem value="MILLION">MILLION</SelectItem>
              <SelectItem value="BILLION">BILLION</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8"
            onClick={() => {
              onAction({ action: "edit", value: Number(value), metricCode, unit: v.unit })
              setEditing(false)
            }}
          >
            {t("common.save")}
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction({ action: "approve" })}>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            {t("rp.approveValue")}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)}>
            {t("rp.editValue")}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 hover:text-red-600" onClick={() => onAction({ action: "reject" })}>
            <XCircle className="h-3.5 w-3.5" />
            {t("rp.reject")}
          </Button>
        </div>
      )}
    </div>
  )
}
