"use client"

// Reports & Review — admin financial-document ingestion UI.
// Flow: analyze (dry-run detection) → confirm fields → upload (versioned) → auto-process
// (5-stage pipeline: parse → extract → normalize → validate → finalize) → approve / reject.

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck2,
  History,
  Inbox,
  Loader2,
  Lock,
  LogOut,
  Minus,
  PenLine,
  RefreshCcw,
  ScanSearch,
  ScrollText,
  Trash2,
  Upload,
  UploadCloud,
  Workflow,
  X,
  XCircle,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import {
  api,
  type AnalyzeResult,
  type ExtractionLogRow,
  type ProcessResult,
  type ReportDetail,
  type ReportListItem,
  type ReviewData,
  type ValidationCheckRow,
} from "@/lib/client/api"
import { useI18n, type DictKey } from "@/lib/i18n"
import { UNITS, formatEgp } from "@/lib/financial/units"
import { DemoBadge, StatusChip } from "./shared"

// ---- constants -------------------------------------------------------------

const PIPELINE_STAGES: DictKey[] = [
  "rp.stageUpload",
  "rp.stageParse",
  "rp.stageExtract",
  "rp.stageNormalize",
  "rp.stageValidate",
  "rp.stageDone",
]

const METRIC_SUGGESTIONS = [
  "REVENUE",
  "COGS",
  "GROSS_PROFIT",
  "OPERATING_INCOME",
  "NET_PROFIT",
  "EPS",
  "TOTAL_ASSETS",
  "TOTAL_LIABILITIES",
  "TOTAL_EQUITY",
  "TOTAL_DEBT",
  "PROFIT_BEFORE_TAX",
  "INCOME_TAX",
  "FINANCE_COST",
  "NET_PROFIT_PARENT",
  "TOTAL_EQUITY_AND_LIABILITIES",
  "EQUITY_PARENT",
  "NON_CONTROLLING_INTERESTS",
  "CURRENT_ASSETS",
  "NON_CURRENT_ASSETS",
  "CURRENT_LIABILITIES",
  "NON_CURRENT_LIABILITIES",
  "CASH_AND_EQUIVALENTS",
  "ACCOUNTS_RECEIVABLE",
  "INVENTORY",
  "INVESTMENTS",
  "SHORT_TERM_DEBT",
  "LONG_TERM_DEBT",
  "RETAINED_EARNINGS",
  "SHARES_OUTSTANDING",
  "BOOK_VALUE_PER_SHARE",
  "DIVIDEND_PER_SHARE",
  "NET_CHANGE_IN_CASH",
  "CUSTOMER_DEPOSITS",
  "DEPOSITS",
  "LOANS_NET",
  "OPERATING_CASH_FLOW",
  "INVESTING_CASH_FLOW",
  "FINANCING_CASH_FLOW",
]

const REVIEWABLE_STATUSES = ["VALIDATED", "NEEDS_REVIEW", "FAILED"]

// The list endpoint returns these fields (verified backend) but the shared
// ReportListItem type predates them — extend locally without touching api.ts.
type ReportRow = ReportListItem & {
  statementType?: string | null
  language?: string | null
  extractionConfidence?: number | null
  parserVersion?: string | null
  errorMessage?: string | null
}

function pct(conf?: number | null): string {
  if (conf === null || conf === undefined || Number.isNaN(conf)) return "—"
  const v = conf <= 1 ? conf * 100 : conf
  return `${v.toFixed(0)}%`
}

function pctValue(conf?: number | null): number {
  if (conf === null || conf === undefined || Number.isNaN(conf)) return 0
  return Math.max(0, Math.min(100, conf <= 1 ? conf * 100 : conf))
}

// ---- tiny building blocks --------------------------------------------------

function LabelValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`truncate text-xs font-semibold ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </p>
    </div>
  )
}

function StatementChip({ value }: { value?: string | null }) {
  const { t } = useI18n()
  if (value !== "CONSOLIDATED" && value !== "STANDALONE") return null
  return (
    <Badge variant="outline" className="text-[10px] whitespace-nowrap">
      {t(value === "CONSOLIDATED" ? "rp.consolidated" : "rp.standalone")}
    </Badge>
  )
}

function VersionChip({ version, isRestatement }: { version: number; isRestatement?: boolean }) {
  const { lang } = useI18n()
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] tabular ${
        isRestatement ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground"
      }`}
      title={
        isRestatement
          ? lang === "ar"
            ? `إعادة عرض — تحل محل الإصدار السابق (v${version})`
            : `Restatement — supersedes previous version (v${version})`
          : undefined
      }
    >
      {isRestatement ? <RefreshCcw className="h-3 w-3" /> : null}v{version}
    </span>
  )
}

function CheckRow({ check }: { check: { checkName: string; status: string; severity: string; details?: string | null } }) {
  const Icon =
    check.status === "PASSED" ? CheckCircle2 : check.status === "WARNING" ? AlertTriangle : check.status === "FAILED" ? XCircle : Minus
  const tone =
    check.status === "PASSED"
      ? "text-emerald-600"
      : check.status === "WARNING"
        ? "text-amber-600"
        : check.status === "FAILED"
          ? "text-red-600"
          : "text-muted-foreground"
  const sevCls =
    check.severity === "CRITICAL"
      ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
      : check.severity === "WARNING"
        ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300"
  const stCls =
    check.status === "PASSED"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      : check.status === "WARNING"
        ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : check.status === "FAILED"
          ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
          : "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300"
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border bg-background/60 px-2.5 py-1.5 transition-colors hover:bg-muted/40">
      <div className="flex min-w-0 items-start gap-2">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium" title={check.checkName}>
            {check.checkName}
          </p>
          {check.details ? (
            <p className="truncate text-[11px] text-muted-foreground" title={check.details}>
              {check.details}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Badge variant="outline" className={`text-[9px] ${sevCls}`}>
          {check.severity}
        </Badge>
        <Badge variant="outline" className={`text-[9px] ${stCls}`}>
          {check.status}
        </Badge>
      </div>
    </div>
  )
}

// ---- pipeline stepper ------------------------------------------------------

function PipelineStepper({ stage, failed }: { stage: number; failed: boolean }) {
  const { t } = useI18n()
  return (
    <ol className="flex w-full items-start">
      {PIPELINE_STAGES.map((key, i) => {
        const isDone = failed ? i < stage : i < stage
        const isActive = !failed && i === stage
        const isFailed = failed && i === stage
        const circleCls = isFailed
          ? "border-red-500/60 bg-red-500/10 text-red-600"
          : isDone
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600"
            : isActive
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border bg-muted/40 text-muted-foreground/60"
        const labelCls = isFailed
          ? "text-red-600 dark:text-red-400"
          : isDone || isActive
            ? "text-foreground"
            : "text-muted-foreground/60"
        const lineLeftCls =
          i === 0
            ? "invisible"
            : failed
              ? i <= stage
                ? "bg-red-500/40"
                : "bg-border"
              : i <= stage
                ? "bg-emerald-500/50"
                : "bg-border"
        const lineRightCls =
          i === PIPELINE_STAGES.length - 1
            ? "invisible"
            : failed
              ? i < stage
                ? "bg-red-500/40"
                : "bg-border"
              : i < stage
                ? "bg-emerald-500/50"
                : "bg-border"
        return (
          <li key={key} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span className={`h-px flex-1 ${lineLeftCls}`} />
              <span className={`mx-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${circleCls}`}>
                {isFailed ? (
                  <XCircle className="h-4 w-4" />
                ) : isDone ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="text-[10px] font-bold tabular">{i + 1}</span>
                )}
              </span>
              <span className={`h-px flex-1 ${lineRightCls}`} />
            </div>
            <span className={`mt-1 truncate px-0.5 text-[10px] ${labelCls}`}>{t(key)}</span>
          </li>
        )
      })}
    </ol>
  )
}

// ---- detection panel -------------------------------------------------------

function DetectionPanel({ result }: { result: AnalyzeResult }) {
  const { t, lang } = useI18n()
  const d = result.detection
  const scanned = d.looksScanned || d.warnings.some((w) => w.toLowerCase().includes("scanned"))
  const otherWarnings = d.warnings.filter((w) => !w.toLowerCase().includes("scanned"))
  const visibleCodes = d.candidateCodes.slice(0, 12)

  return (
    <div className="space-y-2.5 rounded-lg border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <ScanSearch className="h-3.5 w-3.5 text-primary" />
          {t("rp.detectTitle")}
        </p>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {t("rp.confirmFields")}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-8">
        <LabelValue
          label={t("rp.detectPeriod")}
          value={d.period ? `${d.period.periodLabel} · ${pct(d.period.confidence)}` : "—"}
        />
        <LabelValue label={t("rp.detectStatement")} value={d.statementType ?? "—"} />
        <LabelValue label={t("rp.detectLang")} value={d.language ?? "—"} />
        <LabelValue label={t("rp.detectUnit")} value={d.reportUnit ?? "—"} />
        <LabelValue label={t("rp.detectPages")} value={d.pageCount != null ? String(d.pageCount) : "—"} />
        <LabelValue label={t("rp.detectEngine")} value={d.engine ?? "—"} />
        <LabelValue label={t("rp.detectMetrics")} value={String(d.candidateCount)} />
        <LabelValue label={t("rp.detectHash")} value={(d.fileHash ?? "").slice(0, 12) || "—"} mono />
      </div>

      {d.candidateCodes.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {visibleCodes.map((c) => (
            <Badge key={c} variant="outline" className="font-mono text-[9px]">
              {c}
            </Badge>
          ))}
          {d.candidateCodes.length > visibleCodes.length ? (
            <Badge variant="outline" className="text-[9px] text-muted-foreground">
              +{d.candidateCodes.length - visibleCodes.length}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {scanned ? (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-xs">{t("rp.scannedWarning")}</AlertTitle>
        </Alert>
      ) : null}
      {otherWarnings.length > 0 ? (
        <ul className="space-y-0.5">
          {otherWarnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      {result.error || result.message ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          {lang === "ar" ? "تحذير التحليل:" : "Analysis warning:"} {result.error ?? result.message}
        </p>
      ) : null}
    </div>
  )
}

// ---- extraction summary ----------------------------------------------------

function ExtractionSummary({
  result,
  unit,
  onViewExtracted,
  onDownload,
  onApprove,
  onReject,
  busy,
}: {
  result: ProcessResult
  unit: string | null
  onViewExtracted: () => void
  onDownload: () => void
  onApprove: () => void
  onReject: () => void
  busy: boolean
}) {
  const { t, lang } = useI18n()
  const stats = [
    { label: lang === "ar" ? "مستخرجة" : "Extracted", value: result.extractedCount ?? 0, cls: "text-emerald-700 dark:text-emerald-400" },
    { label: lang === "ar" ? "صالحة" : "Valid", value: result.validCount ?? 0, cls: "text-emerald-700 dark:text-emerald-400" },
    { label: lang === "ar" ? "تحتاج مراجعة" : "Needs review", value: result.needsReviewCount ?? 0, cls: "text-amber-700 dark:text-amber-400" },
    { label: lang === "ar" ? "فاشلة" : "Failed", value: result.failedCount ?? 0, cls: "text-red-600 dark:text-red-400" },
  ]

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={result.status} />
        <span className="text-sm font-semibold">{t("rp.extractionSummary")}</span>
        {result.status === "VALIDATED" ? (
          <Badge
            variant="outline"
            className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-400"
          >
            {t("rp.readyToApprove")}
          </Badge>
        ) : null}
        {result.notes ? (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground" title={result.notes}>
            {result.notes}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border bg-background/60 p-2.5 text-center">
            <p className={`text-lg font-bold tabular ${s.cls}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-md border bg-background/60 p-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <FileCheck2 className="h-3.5 w-3.5 text-primary" />
            {t("rp.overallConfidence")}
          </span>
          <span className="font-bold tabular">{pct(result.confidence)}</span>
        </div>
        <Progress value={pctValue(result.confidence)} className="mt-1.5 h-2" />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <LabelValue label={t("rp.language")} value={result.language ?? "—"} />
        <LabelValue label={t("rp.statementType")} value={result.statementType ?? "—"} />
        <LabelValue label={lang === "ar" ? "العملة" : "Currency"} value={t("common.egp")} />
        <LabelValue label={t("rp.detectUnit")} value={unit ?? "—"} />
      </div>

      {result.checks && result.checks.length > 0 ? (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <ClipboardList className="h-3.5 w-3.5 text-primary" />
            {t("rp.validationChecks")}
          </p>
          <div className="max-h-56 space-y-1 overflow-y-auto scrollbar-thin pe-1">
            {result.checks.map((c, i) => (
              <CheckRow key={`${c.checkName}-${i}`} check={c} />
            ))}
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t("rp.noValidationIssues")}
        </p>
      )}

      {result.message && result.status === "FAILED" ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">{result.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onViewExtracted} disabled={busy}>
          <ScrollText className="h-3.5 w-3.5" />
          {t("rp.viewExtracted")}
        </Button>
        <Button size="sm" variant="outline" onClick={onDownload} disabled={busy}>
          <Download className="h-3.5 w-3.5" />
          {t("rp.viewOriginal")}
        </Button>
        {result.status === "VALIDATED" ? (
          <Button size="sm" onClick={onApprove} disabled={busy}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("rp.approve")}
          </Button>
        ) : null}
        {REVIEWABLE_STATUSES.includes(result.status) ? (
          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-600" onClick={onReject} disabled={busy}>
            <XCircle className="h-3.5 w-3.5" />
            {t("rp.rejectReport")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

// ---- extracted-data dialog --------------------------------------------------

function ReportDetailDialog({
  reportId,
  open,
  onOpenChange,
  token,
}: {
  reportId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
  token: string | null
}) {
  const { t, lang } = useI18n()
  const { data, isLoading } = useQuery({
    queryKey: ["report-detail", reportId],
    queryFn: () => api.reportDetail(reportId as string, token),
    enabled: open && !!reportId,
  })
  const r: ReportDetail["report"] | undefined = data?.report

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-thin sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-primary" />
            {t("rp.viewExtracted")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {r ? `${r.company.ticker} — ${r.periodLabel}` : t("common.loading")}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !r ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : (
          <div className="space-y-4">
            {/* meta */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold">{r.company.ticker}</span>
              <span className="text-muted-foreground">{r.periodLabel}</span>
              <StatusChip status={r.processingStatus} />
              <StatementChip value={r.statementType} />
              <Badge variant="outline" className="text-[10px]">
                {r.language}
              </Badge>
              {r.parserVersion ? <Badge variant="outline" className="font-mono text-[9px]">{r.parserVersion}</Badge> : null}
              <VersionChip version={r.version} isRestatement={r.isRestatement} />
              {r.extractionConfidence != null ? (
                <span className="text-[10px] text-muted-foreground tabular">
                  {t("co.confidence")}: {pct(r.extractionConfidence)}
                </span>
              ) : null}
              {r.fileHash ? (
                <span className="font-mono text-[10px] text-muted-foreground/70" title={t("co.fileHash")}>
                  {r.fileHash.slice(0, 12)}
                </span>
              ) : null}
              {r.errorMessage ? (
                <span className="w-full text-[11px] text-red-600 dark:text-red-400">{r.errorMessage}</span>
              ) : null}
            </div>

            {/* values table */}
            {r.values.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
            ) : (
              <div className="max-h-96 overflow-auto rounded-md border scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-xs">{t("rp.detectMetrics")}</TableHead>
                      <TableHead className="h-8 text-xs">{t("co.originalLabel")}</TableHead>
                      <TableHead className="h-8 text-end text-xs">{lang === "ar" ? "القيمة" : "Value"}</TableHead>
                      <TableHead className="h-8 text-end text-xs">{t("rp.detectUnit")} (EGP)</TableHead>
                      <TableHead className="h-8 text-end text-xs">{t("co.confidence")}</TableHead>
                      <TableHead className="h-8 text-end text-xs">{t("co.page")}</TableHead>
                      <TableHead className="h-8 text-xs">{t("common.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.values.map((v) => (
                      <Fragment key={v.id}>
                        <TableRow className="hover:bg-muted/40">
                          <TableCell className="py-1.5">
                            <Badge variant="outline" className="font-mono text-[9px]">
                              {v.metricCode}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-40 truncate py-1.5 text-xs" title={v.originalLabel}>
                            <em>{v.originalLabel}</em>
                          </TableCell>
                          <TableCell className="py-1.5 text-end text-xs tabular">
                            {v.value.toLocaleString()}
                            <span className="text-[9px] text-muted-foreground">
                              {" "}
                              {v.unit} {v.currency}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 text-end text-xs tabular">
                            {formatEgp(v.normalizedValue, { withCurrency: false })}
                          </TableCell>
                          <TableCell className="py-1.5 text-end text-xs tabular">{pct(v.confidence)}</TableCell>
                          <TableCell className="py-1.5 text-end text-xs tabular text-muted-foreground">
                            {v.sourcePage != null ? `${t("co.page")} ${v.sourcePage}` : "—"}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <StatusChip status={v.validationStatus} />
                          </TableCell>
                        </TableRow>
                        {v.isManuallyCorrected ? (
                          <TableRow className="bg-amber-500/5 hover:bg-amber-500/5">
                            <TableCell colSpan={7} className="py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                              <span className="inline-flex items-center gap-1.5">
                                <PenLine className="h-3 w-3 shrink-0" />
                                <span className="tabular">
                                  {v.originalValue != null ? v.originalValue.toLocaleString() : "—"} → {v.value.toLocaleString()}
                                </span>
                                <span className="text-muted-foreground">· {v.correctedBy ?? "admin"}</span>
                                {v.correctionReason ? <span>· {v.correctionReason}</span> : null}
                              </span>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* validation checks (admin only) */}
            {r.validationResults && r.validationResults.length > 0 ? (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <ClipboardList className="h-3.5 w-3.5 text-primary" />
                  {t("rp.validationChecks")}
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto scrollbar-thin pe-1">
                  {r.validationResults.map((c: ValidationCheckRow) => (
                    <CheckRow key={c.id ?? c.checkName} check={c} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* pipeline log (admin only) */}
            {r.extractionLogs && r.extractionLogs.length > 0 ? (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Workflow className="h-3.5 w-3.5 text-primary" />
                  {t("rp.pipelineLog")}
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto scrollbar-thin pe-1">
                  {r.extractionLogs.map((l: ExtractionLogRow, i) => {
                    const levelCls =
                      l.level === "ERROR"
                        ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                        : l.level === "WARN" || l.level === "WARNING"
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300"
                    return (
                      <div key={l.id ?? i} className="flex items-start justify-between gap-2 rounded-md border bg-background/60 px-2.5 py-1.5 hover:bg-muted/40">
                        <div className="flex min-w-0 items-start gap-2">
                          <Badge variant="outline" className="mt-0.5 shrink-0 font-mono text-[9px] uppercase">
                            {l.stage}
                          </Badge>
                          <div className="min-w-0">
                            <p className="text-xs leading-snug">{l.message}</p>
                            {l.details ? (
                              <p className="truncate text-[10px] text-muted-foreground" title={l.details}>
                                {l.details}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge variant="outline" className={`text-[9px] ${levelCls}`}>
                            {l.level}
                          </Badge>
                          {l.createdAt ? (
                            <span className="text-[10px] text-muted-foreground tabular">
                              {new Date(l.createdAt).toLocaleTimeString()}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---- review queue row -------------------------------------------------------

function ReviewValueRow({
  v,
  onAction,
  pending,
}: {
  v: ReviewData["values"][number]
  onAction: (body: { action: string; value?: number; metricCode?: string; unit?: string; reason?: string }) => void
  pending: boolean
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(v.value))
  const [metricCode, setMetricCode] = useState(v.metricCode)
  const [unit, setUnit] = useState(v.unit)
  const [reason, setReason] = useState("")

  const codeOptions = METRIC_SUGGESTIONS.includes(v.metricCode) ? METRIC_SUGGESTIONS : [v.metricCode, ...METRIC_SUGGESTIONS]

  return (
    <div className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">{v.company.ticker}</span>
            <span className="text-muted-foreground">{v.report.periodLabel}</span>
            <Badge variant="outline" className="font-mono text-[9px]">
              {v.metricCode}
            </Badge>
            {v.sourcePage != null ? (
              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                {t("co.page")} {v.sourcePage}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs">
            <span className="text-muted-foreground">{t("co.originalLabel")}:</span> <em>{v.originalLabel}</em>
          </p>
          {v.sourceText ? (
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/80" title={v.sourceText}>
              “{v.sourceText}”
            </p>
          ) : null}
          {v.validationNotes ? (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {v.validationNotes}
            </p>
          ) : null}
        </div>
        <div className="text-end">
          <p className="text-sm font-bold tabular">
            {v.value.toLocaleString()}{" "}
            <span className="text-[10px] font-normal text-muted-foreground">
              {v.unit} {v.currency}
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground tabular">
            {t("co.confidence")}: {pct(v.confidence)} · {formatEgp(v.normalizedValue, { withCurrency: false })}
          </p>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={metricCode} onValueChange={setMetricCode}>
              <SelectTrigger className="h-8 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {codeOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="any"
              className="h-8 w-36 tabular"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={t("rp.editValue")}
            />
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="shrink-0 text-[10px] text-muted-foreground">{t("rp.correctionReason")}</Label>
            <Input
              className="h-8 min-w-40 flex-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="—"
              aria-label={t("rp.correctionReason")}
            />
            <Button
              size="sm"
              className="h-8"
              disabled={pending}
              onClick={() => {
                onAction({
                  action: "edit",
                  value: Number(value),
                  metricCode,
                  unit,
                  ...(reason.trim() ? { reason: reason.trim() } : {}),
                })
                setEditing(false)
                setReason("")
              }}
            >
              {t("common.save")}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={() => onAction({ action: "approve" })}>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            {t("rp.approveValue")}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={() => setEditing(true)}>
            <PenLine className="h-3.5 w-3.5" />
            {t("rp.editValue")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-red-600 hover:text-red-600"
            disabled={pending}
            onClick={() => onAction({ action: "reject" })}
          >
            <XCircle className="h-3.5 w-3.5" />
            {t("rp.reject")}
          </Button>
        </div>
      )}
    </div>
  )
}

// ---- main view --------------------------------------------------------------

export function ReportsView({ onOpenCompany }: { onOpenCompany: (id: string) => void }) {
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return localStorage.getItem("egx-admin-token") || localStorage.getItem("egx-user-token") || null
  })
  const [passcode, setPasscode] = useState("")

  // upload form
  const [file, setFile] = useState<File | null>(null)
  const [companyId, setCompanyId] = useState("")
  const [reportType, setReportType] = useState("INTERIM")
  const [periodType, setPeriodType] = useState("QUARTERLY")
  const [fiscalYear, setFiscalYear] = useState("2025")
  const [periodLabel, setPeriodLabel] = useState("")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [statementType, setStatementType] = useState("CONSOLIDATED")
  const [language, setLanguage] = useState("UNKNOWN")
  const [sourceName, setSourceName] = useState("Manual upload")
  const [sourceUrl, setSourceUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [detection, setDetection] = useState<AnalyzeResult | null>(null)

  // pipeline panel state (stepper + outcome)
  const [pipeStage, setPipeStage] = useState(-1)
  const [pipeError, setPipeError] = useState<string | null>(null)
  const [pipeResult, setPipeResult] = useState<ProcessResult | null>(null)
  const [pipeReportId, setPipeReportId] = useState<string | null>(null)
  const [pipeUnit, setPipeUnit] = useState<string | null>(null)
  const stageTimerRef = useRef<number | null>(null)

  // dialogs
  const [detailId, setDetailId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ id: string } | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const clearStageTimer = useCallback(() => {
    if (stageTimerRef.current !== null) {
      window.clearInterval(stageTimerRef.current)
      stageTimerRef.current = null
    }
  }, [])

  // clear the animation timer on unmount
  useEffect(() => clearStageTimer, [clearStageTimer])

  const startStageAnimation = useCallback(() => {
    clearStageTimer()
    setPipeStage(1)
    let s = 1
    stageTimerRef.current = window.setInterval(() => {
      if (s < 4) {
        s += 1
        setPipeStage(s)
      }
    }, 900)
  }, [clearStageTimer])

  const resetPipeline = useCallback(() => {
    clearStageTimer()
    setPipeStage(-1)
    setPipeError(null)
    setPipeResult(null)
    setPipeReportId(null)
    setPipeUnit(null)
  }, [clearStageTimer])

  const invalidateAll = useCallback(() => {
    for (const key of ["uploaded-reports", "review", "dashboard", "company", "metrics", "report-detail"]) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }, [queryClient])

  // ---- data ----

  const { data: companies } = useQuery({ queryKey: ["companies-all"], queryFn: () => api.companies({ pageSize: 50, page: 1 }) })
  const { data: review, refetch: refetchReview } = useQuery({
    queryKey: ["review"],
    queryFn: api.review,
    enabled: !!token,
  })
  const { data: pendingReports, isLoading: pendingLoading } = useQuery({
    queryKey: ["uploaded-reports", "NEW_DOWNLOADED"],
    queryFn: () => api.reports({ status: "NEW_DOWNLOADED" }),
    enabled: !!token,
  })
  const { data: allReports, isLoading: allLoading } = useQuery({
    queryKey: ["uploaded-reports", "ALL"],
    queryFn: () => api.reports({ page: 1 }),
    enabled: !!token,
  })
  const pendingRows = (pendingReports?.reports ?? []) as ReportRow[]
  const allRows = (allReports?.reports ?? []) as ReportRow[]

  // ---- mutations ----

  const loginMutation = useMutation({
    mutationFn: () => api.adminLogin(passcode),
    onSuccess: (res) => {
      localStorage.setItem("egx-admin-token", res.token)
      setToken(res.token)
      setPasscode("")
      toast({ title: lang === "ar" ? "تم دخول المشرف" : "Admin unlocked" })
    },
    onError: (e) => toast({ title: t("rp.adminLogin"), description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const analyzeMutation = useMutation({
    mutationFn: (f: File) => api.analyzeReport(f, token as string),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({
          title: t("rp.analyzeBtn"),
          description: res.message ?? (lang === "ar" ? "تعذر تحليل المستند" : "Could not analyze the document"),
          variant: "destructive",
        })
        return
      }
      setDetection(res)
      const d = res.detection
      if (d.period) {
        const pt = ["QUARTERLY", "SEMIANNUAL", "NINE_MONTH", "ANNUAL", "OTHER"].includes(d.period.periodType)
          ? d.period.periodType
          : "OTHER"
        setPeriodType(pt)
        setReportType(pt === "ANNUAL" ? "ANNUAL" : "INTERIM")
        setFiscalYear(String(d.period.fiscalYear))
        setPeriodLabel(d.period.periodLabel)
        setPeriodStart(d.period.periodStart ? d.period.periodStart.slice(0, 10) : "")
        setPeriodEnd(d.period.periodEnd ? d.period.periodEnd.slice(0, 10) : "")
      }
      if (d.statementType === "CONSOLIDATED" || d.statementType === "STANDALONE") setStatementType(d.statementType)
      if (["EN", "AR", "MIXED"].includes(d.language)) setLanguage(d.language)
      setPipeUnit(d.reportUnit ?? null)
    },
    onError: (e) =>
      toast({ title: t("rp.analyzeBtn"), description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const processMutation = useMutation({
    mutationFn: (id: string) => api.processReport(id, token as string),
    onMutate: (id: string) => {
      setPipeReportId(id)
      setPipeError(null)
      setPipeResult(null)
      startStageAnimation()
    },
    onSuccess: (res) => {
      clearStageTimer()
      setPipeStage(PIPELINE_STAGES.length - 1)
      setPipeResult(res)
      invalidateAll()
      const summary = `${res.extractedCount ?? 0} extracted · ${res.validCount ?? 0} valid · ${res.needsReviewCount ?? 0} review`
      const title =
        res.status === "VALIDATED"
          ? lang === "ar"
            ? "تمت المعالجة"
            : "Processed"
          : res.status === "NEEDS_REVIEW"
            ? lang === "ar"
              ? "يحتاج مراجعة"
              : "Needs review"
            : lang === "ar"
              ? "فشلت المعالجة"
              : "Processing failed"
      toast({
        title,
        description: res.message ? `${summary} — ${res.message}` : summary,
        variant: res.status === "VALIDATED" ? "default" : res.status === "NEEDS_REVIEW" ? "default" : "destructive",
      })
    },
    onError: (e) => {
      clearStageTimer()
      const msg = e instanceof Error ? e.message : String(e)
      setPipeError(msg)
      toast({ title: lang === "ar" ? "فشل خط المعالجة" : "Pipeline failed", description: msg, variant: "destructive" })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error(lang === "ar" ? "اختر ملفاً أولاً" : "Choose a file first")
      const form = new FormData()
      form.set("file", file)
      form.set("companyId", companyId)
      form.set("reportType", reportType)
      form.set("periodType", periodType)
      form.set("fiscalYear", fiscalYear)
      form.set("periodLabel", periodLabel)
      if (periodStart) form.set("periodStart", periodStart)
      if (periodEnd) form.set("periodEnd", periodEnd)
      form.set("statementType", statementType)
      form.set("language", language)
      form.set("sourceName", sourceName || "Manual upload")
      if (sourceUrl.trim()) form.set("sourceUrl", sourceUrl.trim())
      if (notes.trim()) form.set("notes", notes.trim())
      return api.uploadReport(form, token as string)
    },
    onMutate: () => {
      setPipeStage(0)
      setPipeError(null)
      setPipeResult(null)
      setPipeReportId(null)
    },
    onSuccess: (res) => {
      const ver = res.version ?? res.report.version
      toast({
        title: lang === "ar" ? "تم الرفع" : "Uploaded",
        description: res.superseded
          ? lang === "ar"
            ? `إعادة عرض v${ver} — تحل محل الإصدار السابق`
            : `Restatement v${ver} — supersedes previous version`
          : `${res.report.periodLabel} — ${res.report.processingStatus}`,
      })
      invalidateAll()
      setFile(null)
      setDetection(null)
      setNotes("")
      if (fileRef.current) fileRef.current.value = ""
      // chain: analyze → upload → process automatically
      processMutation.mutate(res.report.id)
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e)
      const status = (e as Error & { status?: number }).status
      if (status === 409) {
        // exact duplicate — informational, not destructive
        toast({ title: t("rp.duplicate"), description: msg })
        resetPipeline()
      } else {
        setPipeError(msg)
        toast({ title: lang === "ar" ? "فشل الرفع" : "Upload failed", description: msg, variant: "destructive" })
      }
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveReport(id, token as string),
    onSuccess: () => {
      toast({
        title: lang === "ar" ? "تم اعتماد التقرير" : "Report approved",
        description: lang === "ar" ? "أعيد حساب المؤشرات والأحداث." : "Metrics & events recomputed.",
      })
      invalidateAll()
    },
    onError: (e) =>
      toast({ title: lang === "ar" ? "فشل الاعتماد" : "Approve failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const rejectMutation = useMutation({
    mutationFn: (args: { id: string; reason: string }) => api.rejectReport(args.id, args.reason, token as string),
    onSuccess: () => {
      toast({
        title: lang === "ar" ? "تم رفض المستند" : "Document rejected",
        description: lang === "ar" ? "سُجل السبب في سجل التدقيق." : "Reason recorded in the audit trail.",
      })
      setRejectTarget(null)
      setRejectReason("")
      invalidateAll()
    },
    onError: (e) =>
      toast({ title: lang === "ar" ? "فشل الرفض" : "Reject failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const downloadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(api.downloadReportUrl(id))
      if (!res.ok) throw new Error(lang === "ar" ? `تعذر التنزيل (${res.status})` : `Download failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    },
    onError: (e) =>
      toast({ title: t("rp.download"), description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const reviewActionMutation = useMutation({
    mutationFn: (args: { id: string; body: { action: string; value?: number; metricCode?: string; unit?: string; reason?: string } }) =>
      api.reviewAction(args.id, args.body, token as string),
    onSuccess: () => {
      toast({
        title: lang === "ar" ? "تم تحديث القيمة" : "Value updated",
        description: lang === "ar" ? "سُجل التعديل في سجل التدقيق." : "The correction was recorded in the audit trail.",
      })
      refetchReview()
      invalidateAll()
    },
    onError: (e) =>
      toast({ title: lang === "ar" ? "فشل إجراء المراجعة" : "Review action failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const reprocessMutation = useMutation({
    mutationFn: (id: string) => api.reprocessReport(id, token as string),
    onSuccess: () => {
      toast({ title: lang === "ar" ? "تمت إعادة المعالجة" : "Reprocessing started", description: lang === "ar" ? "تم إعادة تعيين الحالة." : "Document status reset." })
      invalidateAll()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteReport(id, token as string),
    onSuccess: () => {
      toast({ title: lang === "ar" ? "تم الحذف" : "Document deleted", description: lang === "ar" ? "تم حذف المستند من القائمة النشطة." : "Document removed from active lists." })
      invalidateAll()
    },
  })

  // ---- handlers ----

  const onFileChange = (f: File | null) => {
    setFile(f)
    setDetection(null)
  }

  const openDetail = (id: string) => setDetailId(id)

  const approveBusyFor = (id: string) => approveMutation.isPending && approveMutation.variables === id
  const processBusyFor = (id: string) => processMutation.isPending && processMutation.variables === id

  // ---- admin gate ----

  if (!token) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-10">
        <Card className="p-6 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-bold">{t("rp.adminLogin")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "ar"
              ? "الرفع والمراجعة متاحان للمشرفين فقط (الافتراضي: egx-admin)."
              : "Upload & review are admin-gated (default passcode: egx-admin)."}
          </p>
          <div className="mt-4 flex gap-2">
            <Input
              type="password"
              placeholder={t("rp.passcode")}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && passcode) loginMutation.mutate()
              }}
            />
            <Button onClick={() => loginMutation.mutate()} disabled={loginMutation.isPending || !passcode}>
              {loginMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("rp.unlock")}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const uploadDisabled =
    uploadMutation.isPending || analyzeMutation.isPending || !file || !companyId || !periodLabel.trim() || !fiscalYear.trim()

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
            localStorage.removeItem("egx-user-token")
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
          <div className="rounded-md bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <p>{t("rp.uploadHint")}</p>
            <p className="mt-1">{t("rp.hintCsv")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">{t("nav.companies")}</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
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
              <Label className="text-xs">{t("rp.statementType")}</Label>
              <Select value={statementType} onValueChange={setStatementType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONSOLIDATED">{t("rp.consolidated")}</SelectItem>
                  <SelectItem value="STANDALONE">{t("rp.standalone")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.language")}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNKNOWN">{t("rp.autoDetect")}</SelectItem>
                  <SelectItem value="EN">EN</SelectItem>
                  <SelectItem value="AR">AR</SelectItem>
                  <SelectItem value="MIXED">MIXED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="egx-report-file">
                {t("rp.file")} · {lang === "ar" ? "يفضل PDF" : "PDF preferred"}
              </Label>
              <Input
                id="egx-report-file"
                type="file"
                ref={fileRef}
                accept=".pdf,.csv,.txt"
                className="h-9"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.reportType")}</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANNUAL">ANNUAL</SelectItem>
                  <SelectItem value="INTERIM">INTERIM</SelectItem>
                  <SelectItem value="OTHER">OTHER</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "ar" ? "نوع الفترة" : "Period type"}</Label>
              <Select value={periodType} onValueChange={setPeriodType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QUARTERLY">QUARTERLY</SelectItem>
                  <SelectItem value="SEMIANNUAL">SEMIANNUAL</SelectItem>
                  <SelectItem value="NINE_MONTH">NINE_MONTH</SelectItem>
                  <SelectItem value="ANNUAL">ANNUAL</SelectItem>
                  <SelectItem value="OTHER">OTHER</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.fiscalYear")}</Label>
              <Input className="h-9 tabular" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="2025" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.periodLabel")}</Label>
              <Input className="h-9" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="Q3 2025" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.periodStart")}</Label>
              <Input type="date" className="h-9" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.periodEnd")}</Label>
              <Input type="date" className="h-9" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.sourceName")}</Label>
              <Input className="h-9" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder={t("rp.sourceName")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.sourceUrl")}</Label>
              <Input className="h-9" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rp.notesField")}</Label>
              <Input className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="—" />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => file && analyzeMutation.mutate(file)}
              disabled={!file || analyzeMutation.isPending || uploadMutation.isPending}
            >
              {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
              {analyzeMutation.isPending ? t("rp.analyzing") : t("rp.analyzeBtn")}
            </Button>
            {file ? (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </span>
            ) : null}
            <div className="sm:ms-auto">
              <Button className="gap-1.5" onClick={() => uploadMutation.mutate()} disabled={uploadDisabled}>
                {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadMutation.isPending ? t("rp.processing") : t("rp.upload")}
              </Button>
            </div>
          </div>

          {detection ? <DetectionPanel result={detection} /> : null}
        </CardContent>
      </Card>

      {/* Pipeline panel: stepper + outcome */}
      {pipeStage >= 0 || pipeError || pipeResult ? (
        <Card className="p-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Workflow className="h-4 w-4 shrink-0 text-primary" />
                {pipeReportId ? (
                  <span className="truncate font-mono text-xs text-muted-foreground">#{pipeReportId.slice(0, 8)}</span>
                ) : (
                  <span className="truncate">{t("rp.processing")}</span>
                )}
              </span>
              {!uploadMutation.isPending && !processMutation.isPending ? (
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={resetPipeline} aria-label={t("common.close")}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PipelineStepper stage={pipeStage} failed={!!pipeError} />
            {pipeError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-xs">{lang === "ar" ? "فشل خط المعالجة" : "Pipeline failed"}</AlertTitle>
                <AlertDescription className="text-xs">{pipeError}</AlertDescription>
              </Alert>
            ) : null}
            {pipeResult && pipeReportId ? (
              <ExtractionSummary
                result={pipeResult}
                unit={pipeUnit}
                busy={approveMutation.isPending || rejectMutation.isPending || downloadMutation.isPending}
                onViewExtracted={() => openDetail(pipeReportId as string)}
                onDownload={() => downloadMutation.mutate(pipeReportId as string)}
                onApprove={() => approveMutation.mutate(pipeReportId as string)}
                onReject={() => setRejectTarget({ id: pipeReportId as string })}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Reports to process (NEW_DOWNLOADED) */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Inbox className="h-4 w-4 text-primary" />
            {t("rp.pendingReports")}
            {pendingReports && pendingReports.total > 0 ? <Badge className="tabular">{pendingReports.total}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pendingLoading ? (
            <Skeleton className="h-20 rounded-lg" />
          ) : pendingRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto scrollbar-thin pe-1">
              {pendingRows.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col justify-between gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <button
                        className="font-bold hover:underline"
                        onClick={() => r.companyId && onOpenCompany(r.companyId)}
                        title={r.company?.nameEn}
                      >
                        {r.company?.ticker}
                      </button>
                      <span>{r.periodLabel}</span>
                      <StatusChip status={r.processingStatus} />
                      <StatementChip value={r.statementType} />
                      <VersionChip version={r.version} isRestatement={r.isRestatement} />
                      {r.isDemoData ? <DemoBadge small /> : null}
                    </div>
                    {r.notes ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{r.notes}</p> : null}
                    {r.fileHash ? (
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70" title={r.fileHash}>
                        sha256: {r.fileHash.slice(0, 16)}…
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    onClick={() => processMutation.mutate(r.id)}
                    disabled={processMutation.isPending}
                  >
                    {processBusyFor(r.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Workflow className="h-3.5 w-3.5" />}
                    {processBusyFor(r.id) ? t("rp.processing") : t("rp.process")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review queue */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4 text-primary" />
            {t("rp.reviewQueue")}
            {review && review.values.length > 0 ? <Badge className="tabular">{review.values.length}</Badge> : null}
            {review ? (
              <span className="text-xs font-normal text-muted-foreground">
                — {review.values.length} {t("rp.pendingValues")}
              </span>
            ) : null}
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
                <ReviewValueRow
                  key={v.id}
                  v={v}
                  pending={reviewActionMutation.isPending && reviewActionMutation.variables?.id === v.id}
                  onAction={(body) => reviewActionMutation.mutate({ id: v.id, body })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploaded reports (history / audit) */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4 text-primary" />
            {t("rp.uploadedFiles")}
            {allReports && allReports.total > 0 ? <Badge variant="outline" className="tabular">{allReports.total}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : allRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
          ) : (
            <div className="max-h-96 space-y-1.5 overflow-y-auto scrollbar-thin pe-1">
              {allRows.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col justify-between gap-2 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-muted/40 lg:flex-row lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        className="font-semibold hover:underline"
                        onClick={() => r.companyId && onOpenCompany(r.companyId)}
                        title={r.company?.nameEn}
                      >
                        {r.company?.ticker}
                      </button>
                      <span>{r.periodLabel}</span>
                      <StatusChip status={r.processingStatus} />
                      <StatementChip value={r.statementType} />
                      <VersionChip version={r.version} isRestatement={r.isRestatement} />
                      {r.extractionMethod ? (
                        <Badge variant="outline" className="font-mono text-[9px]">
                          {r.extractionMethod}
                        </Badge>
                      ) : null}
                      {r.extractionConfidence != null ? (
                        <span className="text-[10px] text-muted-foreground tabular">{pct(r.extractionConfidence)}</span>
                      ) : null}
                      <span className="text-muted-foreground tabular">
                        {r.valueCount} {t("co.values")}
                      </span>
                      {r.isDemoData ? <DemoBadge small /> : null}
                    </div>
                    {r.processingStatus === "NEEDS_REVIEW" ? (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {lang === "ar"
                          ? "توجد قيم تحتاج مراجعة — افتح قائمة المراجعة أدناه."
                          : "Has values needing review — open the review queue below."}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {r.processingStatus === "NEW_DOWNLOADED" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() => processMutation.mutate(r.id)}
                        disabled={processMutation.isPending}
                      >
                        {processBusyFor(r.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3" />}
                        {processBusyFor(r.id) ? t("rp.processing") : t("rp.process")}
                      </Button>
                    ) : null}
                    {r.processingStatus === "VALIDATED" && !r.isDemoData ? (
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => approveMutation.mutate(r.id)}
                        disabled={approveMutation.isPending}
                      >
                        {approveBusyFor(r.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {t("rp.approve")}
                      </Button>
                    ) : null}
                    {REVIEWABLE_STATUSES.includes(r.processingStatus) && !r.isDemoData ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs text-red-600 hover:text-red-600"
                        onClick={() => setRejectTarget({ id: r.id })}
                        disabled={rejectMutation.isPending}
                      >
                        <XCircle className="h-3 w-3" />
                        {t("rp.rejectReport")}
                      </Button>
                    ) : null}
                    {["FAILED", "REJECTED", "NEEDS_REVIEW", "NEW_DOWNLOADED", "EXTRACTED", "VALIDATED"].includes(r.processingStatus) && !r.isDemoData ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        onClick={() => reprocessMutation.mutate(r.id)}
                        disabled={reprocessMutation.isPending}
                      >
                        {reprocessMutation.isPending && reprocessMutation.variables === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3" />}
                        {t("rp.reprocess")}
                      </Button>
                    ) : null}
                    {["FAILED", "REJECTED", "NEEDS_REVIEW", "NEW_DOWNLOADED", "VALIDATED"].includes(r.processingStatus) && !r.isDemoData ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs text-red-600 hover:text-red-600"
                        onClick={() => {
                          if (confirm(lang === "ar" ? "حذف المستند؟ لا يمكن التراجع." : "Delete this document? This cannot be undone.")) {
                            deleteMutation.mutate(r.id)
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending && deleteMutation.variables === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        {t("common.delete")}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => openDetail(r.id)}>
                      <ScrollText className="h-3 w-3" />
                      {t("common.details")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => downloadMutation.mutate(r.id)}
                      disabled={downloadMutation.isPending}
                    >
                      <Download className="h-3 w-3" />
                      {t("rp.download")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extracted data dialog */}
      <ReportDetailDialog reportId={detailId} open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)} token={token} />

      {/* Reject reason dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <XCircle className="h-4 w-4 text-red-600" />
              {t("rp.rejectReport")}
            </DialogTitle>
            <DialogDescription className="text-xs">{t("rp.rejectReason")}</DialogDescription>
          </DialogHeader>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("rp.reasonPlaceholder")}
            aria-label={t("rp.rejectReason")}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })}
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("rp.rejectReport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
