"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Clock, History, Play, Plus, Save, Trash2, TriangleAlert, Wand2, X } from "lucide-react"
import { parsePeriodKey } from "@/lib/financial/periods"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { api, type CompanyScanResult, type ConditionEval, type ScanCondition, type ScanOutput, type ScannerRule } from "@/lib/client/api"
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
/* Period basis helpers                                                */
/* ------------------------------------------------------------------ */

type Basis = "LATEST_ANNUAL" | "LATEST_QUARTERLY" | "LATEST_TTM"

function basisShortLabel(basis: string, lang: "en" | "ar"): string {
  if (basis === "LATEST_TTM") return lang === "ar" ? "متداول" : "TTM"
  if (basis === "LATEST_QUARTERLY") return lang === "ar" ? "ربعي" : "Q"
  return lang === "ar" ? "سنوي" : "FY"
}

function basisKeyLabel(basis: string): "sc.basisAnnual" | "sc.basisQuarterly" | "sc.basisTtm" {
  if (basis === "LATEST_TTM") return "sc.basisTtm"
  if (basis === "LATEST_QUARTERLY") return "sc.basisQuarterly"
  return "sc.basisAnnual"
}

/* ------------------------------------------------------------------ */
/* Preset scanners                                                     */
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
  const [result, setResult] = useState<ScanOutput | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: ruleData, isLoading } = useQuery({ queryKey: ["scanners"], queryFn: api.scanners })
  const presets = useMemo(() => ruleData?.rules.filter((r) => r.isPreset) ?? [], [ruleData])
  const custom = useMemo(() => ruleData?.rules.filter((r) => !r.isPreset) ?? [], [ruleData])

  // pendingRuleId (from dashboard / company badges) may be a rule id OR a presetKey —
  // resolved as a derived value; local selection always wins once the user clicks.
  const resolvedPending = pendingRuleId
    ? (presets.find((r) => r.id === pendingRuleId)?.id ?? presets.find((r) => r.presetKey === pendingRuleId)?.id ?? null)
    : null
  const effectiveRuleId = selectedRuleId ?? resolvedPending

  const runMutation = useMutation({
    mutationFn: (rule: ScannerRule) => api.runScanner({ ruleId: rule.id, periodBasis: basis }),
    onSuccess: (output) => {
      setResult(output)
      setExpanded(null)
      queryClient.invalidateQueries({ queryKey: ["scanners"] })
      queryClient.invalidateQueries({ queryKey: ["scan-history"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      return api.deleteScanner(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scanners"] })
      if (result?.ruleId) setResult(null)
    },
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
          <p className="text-sm text-muted-foreground">{pick(selectedRule?.description, selectedRule?.description)}</p>
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
            <CardContent className="max-h-[320px] space-y-1 overflow-y-auto scrollbar-thin">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-md" />)
                : presets.map((rule) => (
                    <button
                      key={rule.id}
                      onClick={() => setSelectedRuleId(rule.id)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-sm transition-colors ${
                        selectedRuleId === rule.id ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{pick(rule.name, rule.nameAr)}</span>
                      {result?.ruleId === rule.id ? (
                        <Badge variant="secondary" className="ms-2 text-[10px] tabular shrink-0">
                          {result.matched.length}
                        </Badge>
                      ) : null}
                    </button>
                  ))}
            </CardContent>
          </Card>

          {custom.length > 0 ? (
            <Card className="p-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("sc.customRules")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {custom.map((rule) => (
                  <div key={rule.id} className={`group flex items-center justify-between rounded-md px-1 transition-colors ${selectedRuleId === rule.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                    <button
                      onClick={() => setSelectedRuleId(rule.id)}
                      className={`flex-1 truncate px-2 py-2 text-start text-sm ${selectedRuleId === rule.id ? "font-medium text-primary" : ""}`}
                    >
                      {rule.name}
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(rule.id)}
                      className="p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      aria-label={`${t("common.delete")} ${rule.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
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
                <span className="font-semibold">{result.ruleName}</span>
                <Badge variant="outline">{result.periodBasis === "LATEST_ANNUAL" ? t("sc.basisAnnual") : t("sc.basisQuarterly")}</Badge>
                <Badge className="tabular">
                  {result.matched.length} / {result.results.length} {t("sc.matchingCompanies")}
                </Badge>
              </div>

              {result.validationErrors.length > 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">{t("sc.availability")}</p>
                    <ul className="list-disc ps-4 mt-1 space-y-0.5">
                      {result.validationErrors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {result.matched.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  {lang === "ar" ? "لا شركات مطابقة في هذه الفترة." : "No matching companies for this period."}
                </Card>
              ) : (
                [...result.matched].sort((a, b) => b.evaluation.matchedCount - a.evaluation.matchedCount).map((r) => <ResultRow key={r.companyId} result={r} expanded={expanded === r.companyId} onToggle={() => setExpanded(expanded === r.companyId ? null : r.companyId)} onOpenCompany={onOpenCompany} />)
              )}
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
/* Recent scanner runs (history sidebar)                               */
/* ------------------------------------------------------------------ */

function RunHistory() {
  const { t, lang, pick } = useI18n()
  const { data } = useQuery({ queryKey: ["scan-history"], queryFn: api.scanHistory, refetchInterval: 30_000 })
  const runs = data?.runs ?? []
  if (runs.length === 0) return null

  return (
    <Card className="p-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <History className="h-3.5 w-3.5 text-primary" />
          {t("rh.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin">
        {runs.slice(0, 8).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11px]">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.ruleName}</p>
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(r.ranAt, lang)} · {r.periodBasis === "LATEST_ANNUAL" ? (lang === "ar" ? "سنوي" : "FY") : lang === "ar" ? "ربعي" : "Q"}
              </p>
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
          <Button variant="ghost" size="sm" className="mt-2.5 h-7 text-xs" onClick={() => onOpenCompany(result.companyId)}>
            {t("co.profile")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Custom scanner builder                                              */
/* ------------------------------------------------------------------ */

interface BuilderRow {
  id: number
  kind: "metric" | "event" | "dividend"
  code: string
  operator: string
  value: string
  eventType: string
  statusAny: boolean
}

let rowSeq = 1

function CustomScanners({ onOpenCompany }: { onOpenCompany: (id: string) => void }) {
  const { t, lang, pick } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<BuilderRow[]>([
    { id: rowSeq++, kind: "metric", code: "profit_growth", operator: ">=", value: "30", eventType: "LOSS_TO_PROFIT", statusAny: true },
  ])
  const [name, setName] = useState("")
  const [basis, setBasis] = useState<Basis>("LATEST_ANNUAL")
  const [result, setResult] = useState<ScanOutput | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: registry } = useQuery({ queryKey: ["registry"], queryFn: api.registry })

  const conditions: ScanCondition[] = useMemo(
    () =>
      rows.map((r) => {
        if (r.kind === "metric") return { kind: "metric", code: r.code, operator: r.operator, value: Number(r.value) } as ScanCondition
        if (r.kind === "event") return { kind: "event", eventType: r.eventType } as ScanCondition
        return { kind: "dividend", statuses: r.statusAny ? ["ANNOUNCED", "UPCOMING", "ELIGIBLE"] : ["PAID"] } as ScanCondition
      }),
    [rows]
  )

  const primaryMetricCode = useMemo(
    () => conditions.find((c) => c.kind === "metric")?.code ?? null,
    [conditions]
  )

  const sortedResults = useMemo(() => {
    if (!result) return []
    const list = [...result.results].filter((r) => r.evaluation.matched)
    if (primaryMetricCode) {
      list.sort((a, b) => {
        const aKey = parsePeriodKey(a.contextPeriodKey ?? "")
        const bKey = parsePeriodKey(b.contextPeriodKey ?? "")
        const dateCmp = bKey.fiscalYear - aKey.fiscalYear || bKey.sub.localeCompare(aKey.sub)
        if (dateCmp !== 0) return dateCmp
        const aCond = a.evaluation.conditions.find((c) => c.kind === "metric" && c.code === primaryMetricCode)
        const bCond = b.evaluation.conditions.find((c) => c.kind === "metric" && c.code === primaryMetricCode)
        const aVal = aCond?.actualRaw ?? 0
        const bVal = bCond?.actualRaw ?? 0
        return bVal - aVal
      })
    }
    return list
  }, [result, primaryMetricCode])

  const runMutation = useMutation({
    mutationFn: () => api.runScanner({ conditions, periodBasis: basis, name: name || undefined }),
    onSuccess: (output) => {
      setResult(output)
      setExpanded(null)
    },
    onError: (e) => toast({ title: "Scan failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const saveMutation = useMutation({
    mutationFn: () => api.createScanner({ name: name.trim(), conditions }),
    onSuccess: () => {
      toast({ title: lang === "ar" ? "تم حفظ القاعدة" : "Rule saved", description: name })
      queryClient.invalidateQueries({ queryKey: ["scanners"] })
    },
    onError: (e) => toast({ title: lang === "ar" ? "فشل الحفظ" : "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  })

  const addRow = () =>
    setRows((rs) => [...rs, { id: rowSeq++, kind: "metric", code: "revenue_growth", operator: ">=", value: "15", eventType: "LOSS_TO_PROFIT", statusAny: true }])

  const removeRow = (id: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs))

  const updateRow = (id: number, patch: Partial<BuilderRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const metricUnavailable = (code: string) => result?.availability && result.availability[code] === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("nav.customScanner")}</h1>
          <p className="text-sm text-muted-foreground">
            {lang === "ar"
              ? "اجمع شروطاً متعددة (منطق AND) من مؤشرات وأحداث وتوزيعات. كل نتيجة تُشرح من القيم المخزنة فعلياً."
              : "Combine multiple conditions (AND logic) from metrics, events and dividends. Every result is explained from actual stored values."}
          </p>
        </div>
        <Select value={basis} onValueChange={(v) => setBasis(v as typeof basis)}>
          <SelectTrigger className="w-[230px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LATEST_ANNUAL">{t("sc.basisAnnual")}</SelectItem>
            <SelectItem value="LATEST_QUARTERLY">{t("sc.basisQuarterly")}</SelectItem>
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
            {rows.map((row) => (
              <div key={row.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[110px_1fr_90px_90px_36px] sm:items-center">
                <Select
                  value={row.kind}
                  onValueChange={(v) => updateRow(row.id, { kind: v as BuilderRow["kind"], code: v === "metric" ? "revenue_growth" : row.code })}
                >
                  <SelectTrigger className="h-9" aria-label={t("sc.condition")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">{t("sc.metric")}</SelectItem>
                    <SelectItem value="event">{t("sc.event")}</SelectItem>
                    <SelectItem value="dividend">{t("sc.dividend")}</SelectItem>
                  </SelectContent>
                </Select>

                {row.kind === "metric" ? (
                  <div className="flex items-center gap-2">
                    <Select value={row.code} onValueChange={(v) => updateRow(row.id, { code: v })}>
                      <SelectTrigger className="h-9 flex-1">
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
                    {metricUnavailable(row.code) ? (
                      <span className="text-[10px] text-amber-600 whitespace-nowrap">{t("sc.dataUnavailable")}</span>
                    ) : null}
                  </div>
                ) : row.kind === "event" ? (
                  <Select value={row.eventType} onValueChange={(v) => updateRow(row.id, { eventType: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(registry?.eventTypes ?? []).map((e) => (
                        <SelectItem key={e.type} value={e.type}>
                          {lang === "ar" ? e.labelAr : e.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={row.statusAny ? "active" : "paid"}
                    onValueChange={(v) => updateRow(row.id, { statusAny: v === "active" })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">ANNOUNCED / UPCOMING / ELIGIBLE</SelectItem>
                      <SelectItem value="paid">PAID</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {row.kind === "metric" ? (
                  <>
                    <Select value={row.operator} onValueChange={(v) => updateRow(row.id, { operator: v })}>
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
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="any"
                      className="h-9 tabular"
                      value={row.value}
                      onChange={(e) => updateRow(row.id, { value: e.target.value })}
                      aria-label={t("sc.value")}
                    />
                  </>
                ) : (
                  <div className="sm:col-span-2" />
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 justify-self-end text-muted-foreground hover:text-red-500"
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1}
                  aria-label={t("common.delete")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-4 w-4" />
                {t("sc.addCondition")}
              </Button>
              <Input
                className="h-9 flex-1"
                placeholder={t("sc.ruleName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
                <Play className="h-4 w-4" />
                {t("common.run")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>
                <Save className="h-4 w-4" />
                {t("sc.saveRule")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* results */}
        <div className="space-y-3">
          {runMutation.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : result ? (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-semibold text-foreground">{t("sc.results")}</span>
                <Badge variant="outline" className="tabular">
                  {result.periodBasis === "LATEST_ANNUAL" ? t("sc.basisAnnual") : t("sc.basisQuarterly")}
                </Badge>
                <Badge className="tabular">
                  {result.matched.length} / {result.results.length} {t("sc.matchingCompanies")}
                </Badge>
              </div>

              {result.validationErrors.length > 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">{t("sc.availability")}</p>
                    <ul className="list-disc ps-4 mt-1 space-y-0.5">
                      {result.validationErrors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {result.matched.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  {lang === "ar" ? "لا شركات مطابقة في هذه الفترة." : "No matching companies for this period."}
                </Card>
              ) : (
                <div className="max-h-[560px] space-y-2 overflow-y-auto scrollbar-thin pe-1">
                  {sortedResults.map((r) => (
                    <div
                      key={r.companyId}
                      className={`group rounded-xl border border-border/60 bg-card p-4 shadow-sm shadow-black/[0.02] transition-all duration-200 hover:border-primary/30 hover:shadow-md hover:shadow-black/5 ${
                        r.evaluation.matched ? "" : "opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setExpanded(expanded === r.companyId ? null : r.companyId)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-xs font-bold tabular transition-colors hover:bg-primary/10 hover:text-primary"
                          aria-label={t("common.viewWhy")}
                          aria-expanded={!!expanded}
                        >
                          {r.evaluation.matchedCount}/{r.evaluation.conditions.length}
                        </button>
                        <button onClick={() => onOpenCompany(r.companyId)} className="min-w-0 flex-1 text-start">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold">{r.ticker}</span>
                            <span className="truncate text-xs text-muted-foreground">{pick(r.nameEn, r.nameAr)}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>{r.sector}</span>
                            {r.contextPeriodLabel ? (
                              <>
                                <span className="text-muted-foreground/50">·</span>
                                <span>{t("sc.contextPeriod")}: {r.contextPeriodLabel}</span>
                              </>
                            ) : null}
                          </div>
                        </button>
                        {r.evaluation.matched && primaryMetricCode ? (() => {
                          const metricCond = r.evaluation.conditions.find((c) => c.kind === "metric" && c.code === primaryMetricCode)
                          const display = metricCond?.actualDisplay ?? ""
                          return (
                            <span className="shrink-0 text-xs font-semibold tabular text-foreground">
                              {display}
                            </span>
                          )
                        })() : null}
                        <button
                          onClick={() => setExpanded(expanded === r.companyId ? null : r.companyId)}
                          className="p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                          aria-expanded={!!expanded}
                          aria-label={t("common.details")}
                        >
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
                      {expanded === r.companyId && (
                        <div className="mt-3 rounded-lg border border-border/40 bg-muted/20 p-3">
                          <WhyMatchedPanel conditions={r.evaluation.conditions} matched={r.evaluation.matched} />
                          <div className="mt-2.5 flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenCompany(r.companyId)}>
                              {t("co.profile")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
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
