"use client"

// Shared small display components: demo badges, event badges, status chips,
// condition evaluation rows (the "WHY matched" explanation panel).

import { CheckCircle2, HelpCircle, MinusCircle, Star, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ConditionEval } from "@/lib/client/api"
import { useWatchlist } from "@/lib/client/watchlist"
import { useI18n } from "@/lib/i18n"

/** Star/unstar a company into the (client-side) watchlist. */
export function StarButton({ companyId, ticker, className = "" }: { companyId: string; ticker: string; className?: string }) {
  const { t } = useI18n()
  const has = useWatchlist((s) => s.items.some((i) => i.id === companyId))
  const toggle = useWatchlist((s) => s.toggle)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        toggle({ id: companyId, ticker })
      }}
      aria-label={has ? `${t("watchlist.remove")} ${ticker}` : `${t("watchlist.add")} ${ticker}`}
      title={has ? t("watchlist.remove") : t("watchlist.add")}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${className} ${
        has ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"
      }`}
    >
      <Star className={`h-4 w-4 ${has ? "fill-amber-400" : ""}`} />
    </button>
  )
}

export function DemoBadge({ small = false }: { small?: boolean }) {
  const { t } = useI18n()
  return (
    <Badge
      variant="outline"
      className={`border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold ${
        small ? "text-[9px] px-1 py-0" : "text-[10px]"
      }`}
    >
      {t("common.demoData")}
    </Badge>
  )
}

const toneClasses: Record<string, string> = {
  positive: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  negative: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  neutral: "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
}

export function EventBadge({ label, tone, small = false }: { label: string; tone: "positive" | "negative" | "neutral"; small?: boolean }) {
  return (
    <Badge variant="outline" className={`${toneClasses[tone]} ${small ? "text-[10px]" : "text-xs"} whitespace-nowrap`}>
      {label}
    </Badge>
  )
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    VALIDATED: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    EXTRACTED: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    VALID: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    NEEDS_REVIEW: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    NEW_DOWNLOADED: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    PROCESSING: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    FAILED: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
    REJECTED: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
    PENDING: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    PAID: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    ANNOUNCED: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    UPCOMING: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    ELIGIBLE: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    EXPIRED: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    CANCELLED: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  }
  return (
    <Badge variant="outline" className={`${map[status] ?? map.PENDING} text-[10px] whitespace-nowrap`}>
      {status.replaceAll("_", " ")}
    </Badge>
  )
}

/** The explanation panel for a scanner evaluation — every condition, ✓ or ✗, with actual values. */
export function WhyMatchedPanel({ conditions, matched }: { conditions: ConditionEval[]; matched: boolean }) {
  const { t, lang } = useI18n()

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
        {matched ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            {t("sc.whyMatched")}
          </>
        ) : (
          <>
            <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />
            {t("sc.whyNotMatched")}
          </>
        )}
      </p>
      <ul className="space-y-1.5">
        {conditions.map((c, i) => {
          const label = lang === "ar" ? c.labelAr || c.labelEn : c.labelEn
          return (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">
                {c.matched ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : c.status !== "OK" ? (
                  <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                )}
              </span>
              <span className="leading-snug">
                <span className="font-medium">{label}</span>
                {c.kind === "metric" && c.operator ? (
                  <span className="text-muted-foreground"> {c.operator.replace(">=", "≥").replace("<=", "≤")} {formatThreshold(c.threshold)}</span>
                ) : null}
                {": "}
                <span className={c.matched ? "text-emerald-700 dark:text-emerald-400 font-medium" : c.status !== "OK" ? "text-slate-500" : "text-red-600 dark:text-red-400"}>
                  {c.actualDisplay}
                </span>
                {c.note && !c.matched ? <span className="block text-[11px] text-muted-foreground mt-0.5">{c.note}</span> : null}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function formatThreshold(v?: number): string {
  if (v === undefined) return ""
  if (Math.abs(v) >= 1e9) return `EGP ${(v / 1e9).toFixed(0)}B`
  if (Math.abs(v) >= 1e6) return `EGP ${(v / 1e6).toFixed(0)}M`
  return String(v)
}
