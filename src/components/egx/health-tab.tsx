"use client"

import { useQuery } from "@tanstack/react-query"
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts"
import { HeartPulse, Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { PremiumGate } from "@/components/egx/premium-gate"
import { api } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"
import { useSubscriptionGate } from "@/lib/client/subscription-gate"

type ScoreComponent = { key: string; score: number | null; inputs: { label: string; value: number | null; unit: string }[] }
type ScoresData = {
  overall: number | null
  components: ScoreComponent[]
  valuation: {
    price: number | null; pe: number | null; pb: number | null
    sectorMedianPe: number | null; sectorMedianPb: number | null
    peDiscountPct: number | null; pbDiscountPct: number | null
    verdict: "undervalued" | "fair" | "expensive" | "no-price" | null
  } | null
}

const scoreColor = (v: number | null) =>
  v === null ? "text-muted-foreground" : v >= 70 ? "text-emerald-600 dark:text-emerald-400" : v >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
const scoreBg = (v: number | null) =>
  v === null ? "bg-muted" : v >= 70 ? "bg-emerald-500" : v >= 40 ? "bg-amber-500" : "bg-red-500"

const LABELS: Record<string, { en: string; ar: string }> = {
  profitability: { en: "Profitability", ar: "الربحية" },
  growth: { en: "Growth", ar: "النمو" },
  liquidity: { en: "Liquidity", ar: "السيولة" },
  leverage: { en: "Leverage", ar: "الرفع المالي" },
  cash: { en: "Cash quality", ar: "جودة النقد" },
}

export function HealthTab({ companyId }: { companyId: string }) {
  const { lang } = useI18n()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["scores", companyId],
    queryFn: () => fetch(`/api/v1/companies/${companyId}/scores`).then((r) => (r.ok ? (r.json() as Promise<ScoresData>) : null)),
  })

  if (isError) return <Skeleton className="h-72 rounded-xl" />
  if (isLoading || !data) return <Skeleton className="h-72 rounded-xl" />

  const overall = data.overall
  const radarData = data.components.map((c) => ({
    axis: LABELS[c.key] ? (lang === "ar" ? LABELS[c.key].ar : LABELS[c.key].en) : c.key,
    score: c.score ?? 0,
  }))
  const verdictLabel =
    data.valuation?.verdict === "undervalued"
      ? lang === "ar" ? "أقل من قيمتها القطاعية" : "Below sector valuation"
      : data.valuation?.verdict === "expensive"
        ? lang === "ar" ? "أعلى من قيمتها القطاعية" : "Above sector valuation"
        : data.valuation?.verdict === "fair"
          ? lang === "ar" ? "متوافقة مع القطاع" : "In line with sector"
          : null

  return (
    <div className="space-y-4">
      {/* overall gauge */}
      <Card className="border-border/60">
        <CardContent className="flex items-center gap-5 p-5">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
            <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted" />
              <circle
                cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round"
                className={scoreColor(overall).replace("text-", "stroke-")}
                strokeDasharray={`${((overall ?? 0) / 100) * 264} 264`}
              />
            </svg>
            <span className={`absolute text-xl font-bold tabular ${scoreColor(overall)}`}>{overall ?? "—"}</span>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <HeartPulse className="h-4 w-4 text-red-500" aria-hidden />
              {lang === "ar" ? "مؤشر الصحة المالية" : "Financial Health Score"}
            </p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              {lang === "ar"
                ? "درجة من 100 محسوبة من المقاييس المالية الموثقة (الربحية، النمو، السيولة، الرفع، جودة النقد). المكوّنات غير المتاحة لا تُقدَّر."
                : "A 0-100 score from verified financial metrics (profitability, growth, liquidity, leverage, cash quality). Unavailable components are never estimated."}
            </p>
            {verdictLabel ? (
              <Badge variant="outline" className={`mt-2 text-[10px] ${data.valuation?.verdict === "undervalued" ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : data.valuation?.verdict === "expensive" ? "border-red-500/40 text-red-600 dark:text-red-400" : ""}`}>
                {lang === "ar" ? "التقييم القطاعي: " : "Sector valuation: "}{verdictLabel}
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* component bars — free */}
      <div className="grid gap-3 sm:grid-cols-2">
        {data.components.map((c) => (
          <Card key={c.key} className="border-border/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{LABELS[c.key] ? (lang === "ar" ? LABELS[c.key].ar : LABELS[c.key].en) : c.key}</span>
              <span className={`text-sm font-bold tabular ${scoreColor(c.score)}`}>{c.score ?? "—"}</span>
            </div>
            <Progress value={c.score ?? 0} className="mt-2 h-1.5" />
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              {c.inputs.filter((i) => i.value !== null).map((i) => (
                <span key={i.label}>
                  {i.label}: <span className="tabular">{Math.abs(i.value ?? 0) >= 1000 ? (i.value ?? 0).toLocaleString("en", { notation: "compact" }) : i.value?.toFixed(2)}</span>
                  {i.unit === "PERCENT" ? "%" : i.unit === "RATIO" ? "x" : ""}
                </span>
              ))}
              {c.inputs.every((i) => i.value === null) ? (
                <span className="italic">{lang === "ar" ? "بيانات غير متاحة" : "data unavailable"}</span>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      {/* snowflake radar — Pro */}
      <Card className="border-border/60">
        <CardHeader className="pb-1">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            {lang === "ar" ? "ندفة الثلج — الصورة الكاملة" : "Snowflake — the full picture"}
            <Badge variant="secondary" className="text-[9px]">{lang === "ar" ? "بريميوم" : "Pro"}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PremiumBody kind="radar" data={radarData as { axis?: string; score?: number; median?: number }[]} overall={overall} lang={lang} />
        </CardContent>
      </Card>

      {/* valuation detail — Pro */}
      {data.valuation && data.valuation.verdict !== "no-price" ? (
        <Card className="border-border/60">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold">{lang === "ar" ? "التقييم مقابل القطاع" : "Valuation vs sector"}</CardTitle>
          </CardHeader>
          <CardContent>
            <PremiumBody
              kind="valuation"
              lang={lang}
              data={[
                { k: lang === "ar" ? "مكرر الربحية P/E" : "P/E", v: data.valuation.pe, median: data.valuation.sectorMedianPe },
                { k: lang === "ar" ? "مضاعف القيمة الدفترية P/B" : "P/B", v: data.valuation.pb, median: data.valuation.sectorMedianPb },
              ]}
              overall={overall}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function PremiumBody({ lang, data, overall, kind }: { lang: string; data: { axis?: string; k?: string; score?: number; v?: number | null; median?: number | null }[]; overall: number | null; kind: "radar" | "valuation" }) {
  const { isPremium } = useSubscriptionGate()
  if (!isPremium) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center">
        <Lock className="h-5 w-5 text-amber-500" aria-hidden />
        <p className="text-xs font-medium">{lang === "ar" ? "الرسم التفصيلي متاح لمشتركي Pro" : "The full visual is available on Pro"}</p>
        <a href="/premium" className="text-xs text-primary underline underline-offset-2">
          {lang === "ar" ? "ترقية إلى Pro" : "Upgrade to Pro"}
        </a>
        <p className="text-[10px] text-muted-foreground">{lang === "ar" ? `الدرجة الإجمالية: ${overall ?? "—"}` : `Overall score: ${overall ?? "—"}`}</p>
      </div>
    )
  }
  if (kind === "radar") {
    return (
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data as { axis: string; score: number }[]} outerRadius="72%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="score" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {data.map((row) => (
        <div key={row.k} className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium">{row.k}</span>
          <span className="flex items-center gap-3 tabular">
            <span className="font-semibold">{row.v !== null && row.v !== undefined ? row.v.toFixed(1) + "x" : "—"}</span>
            <span className="text-muted-foreground">{lang === "ar" ? "وسيط القطاع" : "sector median"}: {row.median !== null && row.median !== undefined ? row.median.toFixed(1) + "x" : "—"}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
