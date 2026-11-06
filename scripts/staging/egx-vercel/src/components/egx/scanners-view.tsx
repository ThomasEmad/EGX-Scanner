"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  Clock,
  Copy,
  History,
  Play,
  Plus,
  Save,
  Trash2,
  Wand2,
  X,
} from "lucide-react"
import { parsePeriodKey } from "@/lib/financial/periods"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { api, type CompanyScanResult, type ConditionEval, type ScanCondition, type ScannerRule } from "@/lib/client/api"
import { isOperator, type Operator, type MetricRange } from "@/lib/financial/scanner"
import { useI18n } from "@/lib/i18n"
import { WhyMatchedPanel } from "./shared"

export function ScannersView({
  mode,
  pendingRuleId,
  onOpenCompany,
  onOpenCustom,
}: {
  mode: "presets" | "custom"
  pendingRuleId: string | null
  onOpenCompany: (id: string) => void
  onOpenCustom: () => void
}) {
  return mode === "presets" ? (
    <PresetScanners
      key={pendingRuleId ?? "none"}
      pendingRuleId={pendingRuleId}
      onOpenCompany={onOpenCompany}
      onOpenCustom={onOpenCustom}
    />
  ) : (
    <CustomScanners onOpenCompany={onOpenCompany} />
  )
}

/* ------------------------------------------------------------------ */
/* Period basis helpers                                               */
/* ------------------------------------------------------------------ */

type Basis = "LATEST_ANNUAL" | "LATEST_QUARTERLY" | "LATEST_TTM"

function basisShortLabel(basis: string, lang: "en" | "ar"): string {
  if (basis === "LATEST_TTM") return lang === "ar" ? "متداول (TTM)" : "TTM"
  if (basis === "LATEST_QUARTERLY") return lang === "ar" ? "ربعي (YoY)" : "Quarterly"
  return lang === "ar" ? "سنوي (FY)" : "Annual"
}

function basisKeyLabel(basis: string): "sc.basisAnnual" | "sc.basisQuarterly" | "sc.basisTtm" {
  if (basis === "LATEST_TTM") return "sc.basisTtm"
  if (basis === "LATEST_QUARTERLY") return "sc.basisQuarterly"
  return "sc.basisAnnual"
}

/* ------------------------------------------------------------------ */
/* Preset scanners                                                    */
/* ------------------------------------------------------------------ */

function PresetScanners({
  pendingRuleId,
  onOpenCompany,
  onOpenCustom,
}: {
  pendingRuleId: string | null
  onOpenCompany: (id: string) => void
  onOpenCustom: () => void
}) {
  const { t, lang, pick } = useI18n()
  const queryClient = useQueryClient()
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [basis, setBasis] = useState<Basis>("LATEST_ANNUAL")
  const [result, setResult] = useState<{ ruleId: string; matched: number; total: number; periodBasis: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: ruleData, isLoading } = useQuery({ queryKey: ["scanners"], queryFn: api.scanners })
  const { data: history } = useQuery({ queryKey: ["scan-history"], queryFn: api.scanHistory })
  const presets = useMemo(() => ruleData?.rules.filter((r) => r.isPreset) ?? [], [ruleData])
  const custom = useMemo(() => ruleData?.rules.filter((r) => !r.isPreset) ?? [], [ruleData])

  // pendingRuleId (from dashboard / company badges) may be a rule id OR a presetKey —
  // resolved as a derived value; local selection always wins once the user clicks.
  const resolvedPending = pendingRuleId
    ? (presets.find((r) => r.id === pendingRuleId)?.id ?? presets.find((r) => r.presetKey === pendingRuleId)?.id ?? null)
    : null
  const effectiveRuleId = selectedRuleId ?? resolvedPending

  const lastRunFor = useMemo(() => {
    const map = new Map<string, { matchedCount: number; ranAt: string }>()
    for (const r of history?.runs ?? []) {
      if (r.ruleId && (!map.get(r.ruleId) || new Date(r.ranAt) > new Date(map.get(r.ruleId)!.ranAt))) {
        map.set(r.ruleId, { matchedCount: r.matchedCount, ranAt: r.ranAt })
      }
    }
    return map
  }, [history])

  const runMutation = useMutation({
    mutationFn: (rule: ScannerRule) => api.runScanner({ ruleId: rule.id, periodBasis: basis }),
    onSuccess: (output) => {
      setResult({ ruleId: output.ruleId ?? effectiveRuleId!, matched: output.matched.length, total: output.results.length, periodBasis: output.periodBasis })
      setExpanded(null)
      queryClient.invalidateQueries({ queryKey: ["scanners"] })
      queryClient.invalidateQueries({ queryKey: ["scan-history"] })
    },
  })

  const { toast } = useToast()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteScanner(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scanners"] })
    },
    onError: (e) => toast({ title: lang === "ar" ? "فشل الحذف" : "Delete failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const selectedRule = presets.find((r) => r.id === effectiveRuleId) ?? custom.find((r) => r.id === effectiveRuleId) ?? null

  // auto-run when a rule becomes selected or the basis changes
  useEffect(() => {
    if (selectedRule) runMutation.mutate(selectedRule)
  }, [effectiveRuleId, basis])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("nav.scanners")}</h1>
          <p className="text-sm text-muted-foreground">{pick(selectedRule?.description, selectedRule?.description ?? "")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="basis" className="text-xs text-muted-foreground whitespace-nowrap">{t("sc.basis")}</Label>
          <Select value={basis} onValueChange={(v) => setBasis(v as typeof basis)}>
            <SelectTrigger id="basis" className="w-[230px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LATEST_ANNUAL">{t("sc.basisAnnual")}</SelectItem>
              <SelectItem value="LATEST_QUARTERLY">{t("sc.basisQuarterly")}</SelectItem>
              <SelectItem value="LATEST_TTM">{t("sc.basisTtm")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* rule list */}
        <div className="space-y-4">
          <Card className="p-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("sc.presets")}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[340px] space-y-1 overflow-y-auto scrollbar-thin">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-md" />)
                : presets.map((rule) => {
                    const last = lastRunFor.get(rule.id)
                    return (
                      <button
                        key={rule.id}
                        onClick={() => setSelectedRuleId(rule.id)}
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-sm transition-colors ${
                          selectedRuleId === rule.id ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="block truncate">{pick(rule.name, rule.nameAr)}</span>
                          {rule.description ? (
                            <span className="block truncate text-[11px] text-muted-foreground">{rule.description}</span>
                          ) : null}
                          {last ? (
                            <span className="block text-[10px] text-muted-foreground mt-0.5">
                              {t("sc.lastRan")}: {new Date(last.ranAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
                                day: "numeric",
                                month: "short",
                              })} — {last.matchedCount} {t("rh.matches")}
                            </span>
                          ) : null}
                        </div>
                        <Badge variant="secondary" className="text-[10px] tabular shrink-0">
                          {result?.ruleId === rule.id ? result.matched : last?.matchedCount ?? "—"}
                        </Badge>
                      </button>
                    )
                  })}
            </CardContent>
          </Card>

          {custom.length > 0 ? (
            <Card className="p-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("sc.customRules")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {custom.map((rule) => {
                  const last = lastRunFor.get(rule.id)
                  return (
                    <div key={rule.id} className={`group flex items-center justify-between rounded-md px-1 transition-colors ${selectedRuleId === rule.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                      <button
                        onClick={() => setSelectedRuleId(rule.id)}
                        className={`flex-1 truncate px-2 py-2 text-start text-sm ${selectedRuleId === rule.id ? "font-medium text-primary" : ""}`}
                      >
                        {rule.name}
                        {rule.nameAr ? ` · ${rule.nameAr}` : null}
                      </button>
                      <Badge variant="secondary" className="text-[10px] tabular shrink-0">
                        {result?.ruleId === rule.id ? result.matched : last?.matchedCount ?? "—"}
                      </Badge>
                      <button
                        onClick={() => deleteMutation.mutate(rule.id)}
                        className="p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        aria-label={`${t("common.delete")} ${rule.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ) : null}

          <Button variant="outline" className="w-full" onClick={onOpenCustom}>
            <Wand2 className="h-4 w-4" />
            {t("nav.customScanner")}
          </Button>

          <RunHistory />
        </div>

        {/* results */}
        <div className="space-y-3">
          {runMutation.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : result ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{selectedRule?.name ?? t("sc.results")}</span>
                <Badge variant="outline">{basisShortLabel(basis, lang)}</Badge>
                <Badge className="tabular">
                  {result.matched} / {result.total} {t("sc.matchingCompanies")}
                </Badge>
              </div>

              {result.matched === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  {lang === "ar" ? "لا شركات مطابقة في هذه الفترة." : "No matching companies for this period."}
                </Card>
              ) : null}
            </>
          ) : (
            <Card className="flex h-64 items-center justify-center p-6 text-center">
              <div className="space-y-2 text-muted-foreground">
                <Play className="mx-auto h-8 w-8 opacity-30" />
                <p className="text-sm">{t("sc.noResults")}</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Recent scanner runs (history sidebar)                              */
/* ------------------------------------------------------------------ */

function RunHistory() {
  const { t, lang } = useI18n()
  const { data } = useQuery({ queryKey: ["scan-history"], queryFn: api.scanHistory, refetchInterval: 30_000 })
  const runs = data?.runs ?? []
  if (runs.length === 0) return null

  return (
    <Card className="p-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <History className="h-3.5 w-3.5 text-primary" />
          {t("sc.runsHistory")}
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin">
        {runs.slice(0, 8).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11px]">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.ruleName}</p>
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(r.ranAt, lang)} · {basisShortLabel(r.periodBasis, lang)}
              </p>
              {r.matchedCompanyIds.slice(0, 6).length > 0 ? (
                <p className="flex flex-wrap gap-1 mt-0.5">
                  {r.matchedCompanyIds.slice(0, 6).map((tid) => (
                    <span key={tid} className="inline-flex items-center rounded border border-border/40 bg-muted/20 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      {tid}
                    </span>
                  ))}
                  {r.matchedCompanyIds.length > 6 && <span className="text-[9px] text-muted-foreground">+{r.matchedCompanyIds.length - 6}</span>}
                </p>
              ) : null}
            </div>
            <Badge variant="secondary" className="shrink-0 tabular text-[10px]">
              {r.matchedCount} {t("rh.matches")}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function timeAgo(iso: string, lang: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return lang === "ar" ? "الآن" : "just now"
  if (mins < 60) return lang === "ar" ? `قبل ${mins} د` : `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return lang === "ar" ? `قبل ${hours} س` : `${hours}h ago`
  return lang === "ar" ? `قبل ${Math.floor(hours / 24)} ي` : `${Math.floor(hours / 24)}d ago`
}

/* ------------------------------------------------------------------ */
/* Result row                                                         */
/* ------------------------------------------------------------------ */

function ResultRow({
  result,
  expanded,
  onToggle,
  onOpenCompany,
  alwaysDim = false,
}: {
  result: CompanyScanResult
  expanded: boolean
  onToggle: () => void
  onOpenCompany: (id: string) => void
  alwaysDim?: boolean
}) {
  const { t, lang, pick } = useI18n()
  const metricCond = result.evaluation.conditions.find((c) => c.kind === "metric")
  const metricDisplay = metricCond?.actualDisplay ?? ""
  return (
    <div className={`group rounded-xl border border-border/60 bg-card p-4 shadow-sm shadow-black/[0.02] transition-all duration-200 hover:border-primary/30 hover:shadow-md hover:shadow-black/5 ${result.evaluation.matched ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-xs font-bold tabular transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label={t("common.viewWhy")}
          aria-expanded={!!expanded}
        >
          {result.evaluation.matchedCount}/{result.evaluation.conditions.length}
        </button>
        <button onClick={() => onOpenCompany(result.companyId)} className="min-w-0 flex-1 text-start">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{result.ticker}</span>
            <span className="truncate text-xs text-muted-foreground">{pick(result.nameEn, result.nameAr)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{result.sector}</span>
            {result.contextPeriodLabel ? (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span>{t("sc.contextPeriod")}: {result.contextPeriodLabel}</span>
              </>
            ) : null}
          </div>
        </button>
        {result.evaluation.matched && metricDisplay ? (
          <span className="shrink-0 text-xs font-semibold tabular text-foreground">
            {metricDisplay}
          </span>
        ) : alwaysDim ? null : (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">—</span>
        )}
        <button onClick={onToggle} className="p-1.5 text-muted-foreground transition-colors hover:text-foreground" aria-expanded={!!expanded} aria-label={t("common.details")}>
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 rounded-lg border border-border/40 bg-muted/20 p-3">
          <WhyMatchedPanel conditions={result.evaluation.conditions} matched={result.evaluation.matched} />
          <div className="mt-2.5 flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenCompany(result.companyId)}>
              {t("co.profile")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Custom scanner builder                                             */
/* ------------------------------------------------------------------ */

interface BuilderRow {
  id: number
  kind: "metric" | "event" | "dividend" | "sector"
  code: string
  operator: string
  value: string       // single threshold or range min
  maxValue: string    // range max (only when operator === "between")
  eventType: string
  sector: string
  statusAny: boolean
}

let rowSeq = 1

function emptyRow(kind: BuilderRow["kind"] = "metric"): BuilderRow {
  return {
    id: rowSeq++,
    kind,
    code: kind === "sector" ? "" : "roe",
    operator: kind === "sector" ? "==" : ">=",
    value: kind === "sector" ? "" : "15",
    maxValue: "",
    eventType: "LOSS_TO_PROFIT",
    sector: "",
    statusAny: true,
  }
}

const EXAMPLE_RULES: Array<{ label: string; ar: string; basis: Basis; rows: BuilderRow[]; name: string; nameAr: string }> = [
  {
    label: "ROE ≥ 15%",
    ar: "عائد حقوق ≥ 15%",
    basis: "LATEST_ANNUAL",
    name: "Strong ROE",
    nameAr: "عائد حقوق قوي",
    rows: [emptyRow("metric")],
  },
  {
    label: "Margin ≥ 10% & D/E ≤ 0.5",
    ar: "هامش ≥ 10% ودين/حقوق ≤ 0.5",
    basis: "LATEST_ANNUAL",
    name: "Quality & Low Debt",
    nameAr: "جودة ودين منخفض",
    rows: [
      { ...emptyRow("metric"), code: "net_margin", operator: ">=", value: "10" },
      { ...emptyRow("metric"), code: "debt_to_equity", operator: "<=", value: "0.5" },
    ],
  },
  {
    label: "ROE between 10 and 25 (Banks)",
    ar: "عائد حقوق بين 10 و 25 (البنوك)",
    basis: "LATEST_ANNUAL",
    name: "Bank ROE Range",
    nameAr: "نطاق عائد حقوق البنوك",
    rows: [
      { ...emptyRow("metric"), code: "roe", operator: "between", value: "10", maxValue: "25" },
      { ...emptyRow("sector"), sector: "Banks" },
    ],
  },
]

function CustomScanners({ onOpenCompany }: { onOpenCompany: (id: string) => void }) {
  const { t, lang, pick } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<BuilderRow[]>([emptyRow("metric")])
  const [name, setName] = useState("")
  const [nameAr, setNameAr] = useState("")
  const [description, setDescription] = useState("")
  const [basis, setBasis] = useState<Basis>("LATEST_ANNUAL")
  const [scanOutput, setScanOutput] = useState<{ matched: number; total: number; results: CompanyScanResult[]; periodBasis: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: registry } = useQuery({ queryKey: ["registry"], queryFn: api.registry })

  // Build ScanCondition[] from rows + collect per-row validation errors
  const { conditions, rowErrors, hasErrors } = useMemo(() => {
    const conds: ScanCondition[] = []
    const errs: Record<number, string[]> = {}
    let bad = false
    for (const r of rows) {
      const e: string[] = []
      if (r.kind === "metric") {
        const def = registry?.calculatedMetrics.find((m) => m.code === r.code)
        if (!def) e.push(t("sc.dataUnavailable"))
        else if (r.operator === "between") {
          const mn = Number(r.value)
          const mx = Number(r.maxValue)
          if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn > mx) {
            e.push(`الحد الأدنى يجب أن يكون ≤ الحد الأعلى / min must be ≤ max`)
          } else {
            conds.push({ kind: "metric", code: r.code, operator: "between", value: { min: mn, max: mx } })
          }
        } else {
          if (!isOperator(r.operator)) e.push(`عامل غير صالح / invalid operator`)
          const v = Number(r.value)
          if (!Number.isFinite(v)) e.push(`قيمة غير صالحة / invalid value`)
          else conds.push({ kind: "metric", code: r.code, operator: r.operator as Operator, value: v })
        }
      } else if (r.kind === "sector") {
        if (!r.sector.trim()) e.push(`اسم القطاع مطلوب / sector name required`)
        else if (r.operator !== "==" && r.operator !== "!=") e.push(`عامل قطاع غير صالح`)
        else conds.push({ kind: "sector", sector: r.sector.trim(), operator: r.operator as "==" | "!=" })
      } else if (r.kind === "event") {
        conds.push({ kind: "event", eventType: r.eventType })
      } else {
        conds.push({ kind: "dividend", statuses: r.statusAny ? ["ANNOUNCED", "UPCOMING", "ELIGIBLE"] : ["PAID"] })
      }
      if (e.length) bad = true
      errs[r.id] = e
    }
    return { conditions: conds, rowErrors: errs, hasErrors: bad || conds.length === 0 }
  }, [rows, registry, t])

  const runMutation = useMutation({
    mutationFn: () => api.runScanner({ conditions, periodBasis: basis, name: name.trim() || undefined }),
    onSuccess: (output) => {
      setScanOutput({
        matched: output.matched.length,
        total: output.results.length,
        results: output.results,
        periodBasis: output.periodBasis,
      })
      setExpanded(null)
      toast({
        title: output.matched.length === 0 ? (lang === "ar" ? "لا نتائج" : "No matches") : (lang === "ar" ? "تم المسح" : "Scan complete"),
        description: `${output.matched.length} / ${output.results.length} ${t("sc.matchingCompanies")}`,
      })
    },
    onError: (e) => toast({ title: lang === "ar" ? "فشل المسح" : "Scan failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const saveMutation = useMutation({
    mutationFn: () => api.createScanner({ name: name.trim(), nameAr: nameAr.trim() || undefined, description: description.trim() || undefined, conditions }),
    onSuccess: () => {
      toast({ title: lang === "ar" ? "تم حفظ القاعدة" : "Rule saved", description: name })
      queryClient.invalidateQueries({ queryKey: ["scanners"] })
    },
    onError: (e) => toast({ title: lang === "ar" ? "فشل الحفظ" : "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const addRow = () => setRows((rs) => [...rs, emptyRow("metric")])

  const removeRow = (id: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs))

  const updateRow = (id: number, patch: Partial<BuilderRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const applyExample = useCallback(
    (ex: (typeof EXAMPLE_RULES)[number]) => {
      setRows(ex.rows)
      setName(ex.name)
      setNameAr(ex.nameAr)
      setBasis(ex.basis)
      setScanOutput(null)
    },
    []
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("nav.customScanner")}</h1>
          <p className="text-sm text-muted-foreground">
            {lang === "ar"
              ? "اجمع شروطاً متعددة (منطق AND) من مؤشرات وأحداث وتوزيعات وقطاعات. تُبنى كل نتيجة من القيم المخزنة فعلاً — لا تُعامل البيانات الناقصة كصفر."
              : "Combine multiple conditions (AND logic) from metrics, events, dividends and sectors. Every result is built from actual stored values — missing data is never treated as zero."}
          </p>
        </div>
        <Select value={basis} onValueChange={(v) => setBasis(v as typeof basis)}>
          <SelectTrigger className="w-[230px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LATEST_ANNUAL">{t("sc.basisAnnual")}</SelectItem>
            <SelectItem value="LATEST_QUARTERLY">{t("sc.basisQuarterly")}</SelectItem>
            <SelectItem value="LATEST_TTM">{t("sc.basisTtm")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        {/* builder */}
        <Card className="p-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              {t("sc.condition")}s <span className="text-muted-foreground font-normal">(AND)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-4 items-end">
                <Label className="text-xs text-muted-foreground">{t("sc.ruleName")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={lang === "ar" ? "اسم القاعدة" : "Rule name"}
                  className="h-9"
                />
                <Input
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder={lang === "ar" ? "الاسم بالعربية" : "Name (Arabic)"}
                  className="h-9"
                />
                <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim() || hasErrors}>
                  <Save className="h-4 w-4" />
                  {t("sc.saveRule")}
                </Button>
              </div>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={lang === "ar" ? "وصف القاعدة (اختياري)" : "Rule description (optional)"}
                className="h-9"
              />
            </div>

            {rows.map((row) => {
              const errors = rowErrors[row.id] ?? []
              const metricDef = registry?.calculatedMetrics.find((m) => m.code === row.code)
              return (
                <div
                  key={row.id}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[105px_130px_105px_110px_40px] sm:items-center"
                >
                  <Select
                    value={row.kind}
                    onValueChange={(v) => {
                      const next = emptyRow(v as BuilderRow["kind"])
                      updateRow(row.id, { kind: next.kind, code: next.code, operator: next.operator, value: next.value, sector: next.sector })
                    }}
                  >
                    <SelectTrigger className="h-9" aria-label={t("sc.condition")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="metric">{t("sc.metric")}</SelectItem>
                      <SelectItem value="event">{t("sc.event")}</SelectItem>
                      <SelectItem value="dividend">{t("sc.dividend")}</SelectItem>
                      <SelectItem value="sector">{t("sc.sector")}</SelectItem>
                    </SelectContent>
                  </Select>

                  {row.kind === "metric" ? (
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center min-w-0">
                      <Select value={row.code} onValueChange={(v) => updateRow(row.id, { code: v })}>
                        <SelectTrigger className="h-9 flex-1" aria-label={t("sc.metric")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {(registry?.calculatedMetrics ?? []).map((m) => (
                            <SelectItem key={m.code} value={m.code}>
                              {lang === "ar" ? m.labelAr : m.labelEn}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={row.operator} onValueChange={(v) => updateRow(row.id, { operator: v, maxValue: v === "between" ? "" : row.maxValue })}>
                        <SelectTrigger className="h-9" aria-label={t("sc.operator")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value=">">{'>'}</SelectItem>
                          <SelectItem value=">=">≥</SelectItem>
                          <SelectItem value="<">{'<'}</SelectItem>
                          <SelectItem value="<=">≤</SelectItem>
                          <SelectItem value="==">=</SelectItem>
                          <SelectItem value="!=">≠</SelectItem>
                          <SelectItem value="between">{t("sc.opBetween")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : row.kind === "sector" ? (
                    <Input
                      value={row.sector}
                      onChange={(e) => updateRow(row.id, { sector: e.target.value })}
                      placeholder={lang === "ar" ? "مثل: Banks" : "e.g. Banks"}
                      className="h-9"
                    />
                  ) : (
                    <div className="sm:col-span-2" />
                  )}

                  {row.kind === "metric" ? (
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center min-w-0">
                      {row.operator === "between" ? (
                        <>
                          <Input
                            type="number"
                            step="any"
                            className="h-9 tabular"
                            value={row.value}
                            onChange={(e) => updateRow(row.id, { value: e.target.value })}
                            placeholder={t("sc.rangeMin")}
                            aria-label={t("sc.rangeMin")}
                          />
                          <Input
                            type="number"
                            step="any"
                            className="h-9 tabular"
                            value={row.maxValue}
                            onChange={(e) => updateRow(row.id, { maxValue: e.target.value })}
                            placeholder={t("sc.rangeMax")}
                            aria-label={t("sc.rangeMax")}
                          />
                        </>
                      ) : (
                        <Input
                          type="number"
                          step="any"
                          className="h-9 tabular"
                          value={row.value}
                          onChange={(e) => updateRow(row.id, { value: e.target.value })}
                          placeholder={t("sc.value")}
                          aria-label={t("sc.value")}
                        />
                      )}
                      {metricDef && !errors.length ? (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {lang === "ar" ? metricDef.unit ?? "" : metricDef.unit ?? ""}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {errors.length > 0 ? (
                    <div className="flex items-start gap-1">
                      <AlertCircle className="h-4 w-4 text-warning-foreground shrink-0" />
                      <span className="text-[10px] text-warning-foreground leading-none">{errors.join(" · ")}</span>
                    </div>
                  ) : null}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 justify-self-end text-muted-foreground hover:text-destructive"
                    disabled={rows.length === 1}
                    onClick={() => {
                      if (confirmDeleteId === row.id) {
                        removeRow(row.id)
                        setConfirmDeleteId(null)
                      } else {
                        setConfirmDeleteId(row.id)
                      }
                    }}
                    aria-label={confirmDeleteId === row.id ? t("sc.deleteConfirm") : t("common.delete")}
                  >
                    {confirmDeleteId === row.id ? (
                      <X className="h-4 w-4 text-destructive" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )
            }
          )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={addRow} disabled={hasErrors}>
                <Plus className="h-4 w-4" />
                {t("sc.addCondition")}
              </Button>
              <Button size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending || hasErrors}>
                <Play className="h-4 w-4" />
                {t("common.run")}
              </Button>
            </div>

            {hasErrors ? (
              <div className="flex items-start gap-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground dark:text-warning-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {lang === "ar" ? "صحح الأخطاء في الصفوف أعلاه قبل التشغيل." : "Fix row errors above before running."}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* examples */}
        {scanOutput === null && !runMutation.isPending ? (
          <Card className="p-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Copy className="h-3.5 w-3.5" />
                {t("sc.examples")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {EXAMPLE_RULES.map((ex) => (
                <Button
                  key={ex.label}
                  variant="outline"
                  size="sm"
                  onClick={() => applyExample(ex)}
                  className="w-full text-start text-sm border border-border/40 hover:border-primary/50"
                >
                  <div className="font-medium">{ex.label}</div>
                  <div className="text-[10px] text-muted-foreground">{ex.ar}</div>
                </Button>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* results */}
        <div className="space-y-3">
          {runMutation.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : scanOutput ? (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-semibold text-foreground">{t("sc.results")}</span>
                <Badge variant="outline" className="tabular">{basisShortLabel(scanOutput.periodBasis, lang)}</Badge>
                <Badge className="tabular">
                  {scanOutput.matched} / {scanOutput.total} {t("sc.matchingCompanies")}
                </Badge>
              </div>

              {scanOutput.matched === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  {lang === "ar" ? "لا شركات مطابقة في هذه الفترة." : "No matching companies for this period."}
                </Card>
              ) : (
                <div className="max-h-[560px] space-y-2 overflow-y-auto scrollbar-thin pe-1">
                  {[...scanOutput.results].sort((a, b) => b.evaluation.matchedCount - a.evaluation.matchedCount).map((r) => (
                    <ResultRow
                      key={r.companyId}
                      result={r}
                      expanded={expanded === r.companyId}
                      onToggle={() => setExpanded(expanded === r.companyId ? null : r.companyId)}
                      onOpenCompany={onOpenCompany}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <Card className="flex h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              <div className="space-y-2">
                <Play className="mx-auto h-8 w-8 opacity-30" />
                <p>{t("sc.noResults")}</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
