"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ShieldCheck, ShieldAlert, ShieldMinus, ShieldQuestion, Clock3 } from "lucide-react"
import { useI18n } from "@/lib/i18n"

// Public data-confidence badge — shows how trustworthy a company's financial
// data is, based on the latest full audit. Accuracy is the certification
// dimension; completeness/freshness/provenance are shown in the tooltip.
// Degrades silently to nothing when no audit data exists yet.

interface ConfidenceData {
  ticker: string
  auditedAt: string | null
  confidence: { score: number; rating: string; breakdownJson: string; computedAt: string } | null
  dimensions: {
    accuracy: number | null
    completeness: number | null
    freshness: number | null
    provenance: number | null
    certification: string
    blockerCount: number
    coverageGapCount: number
  }
  topIssues: { severity: string; category: string; description: string; descriptionAr: string | null }[]
}

const RATING_LABELS: Record<string, { en: string; ar: string }> = {
  high: { en: "High", ar: "عالية" },
  medium: { en: "Medium", ar: "متوسطة" },
  low: { en: "Low", ar: "منخفضة" },
  critical: { en: "Very low", ar: "منخفضة جداً" },
}

const RATING_STYLES: Record<string, string> = {
  high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  low: "border-orange-500/40 bg-orange-500/10 text-orange-600",
  critical: "border-red-500/40 bg-red-500/10 text-red-600",
}

const CERT_LABELS: Record<string, { en: string; ar: string }> = {
  certified: { en: "Certified", ar: "معتمد" },
  provisional: { en: "Provisional", ar: "مؤقت" },
  review_required: { en: "Review", ar: "مراجعة" },
}

const CERT_STYLES: Record<string, string> = {
  certified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  provisional: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  review_required: "border-red-500/40 bg-red-500/10 text-red-600",
}

function ratingFor(score: number): string {
  if (score >= 80) return "high"
  if (score >= 60) return "medium"
  if (score >= 30) return "low"
  return "critical"
}

export function ConfidenceBadge({ ticker, size = "sm" }: { ticker: string; size?: "sm" | "md" }) {
  const { lang } = useI18n()
  const ar = lang === "ar"

  const { data } = useQuery({
    queryKey: ["confidence", ticker],
    queryFn: () =>
      fetch(`/api/v1/companies/${ticker}/confidence`)
        .then((r) => (r.ok ? (r.json() as Promise<ConfidenceData>) : null))
        .catch(() => null),
    staleTime: 300_000,
    retry: false,
  })

  const score = data?.confidence?.score
  if (score === undefined || score === null || !data) return null
  const rating = data.confidence?.rating ?? ratingFor(score)
  const style = RATING_STYLES[rating] ?? RATING_STYLES.critical
  const label = RATING_LABELS[rating] ?? RATING_LABELS.critical
  const cert = data.dimensions?.certification ?? "provisional"
  const certLabel = CERT_LABELS[cert] ?? CERT_LABELS.provisional

  const Icon = rating === "high" ? ShieldCheck : rating === "medium" ? ShieldMinus : rating === "low" ? ShieldAlert : ShieldQuestion
  const CertIcon = cert === "certified" ? ShieldCheck : cert === "review_required" ? ShieldAlert : Clock3
  const auditedAt = data.auditedAt
  const title = ar
    ? `ثقة البيانات: ${score}/100 — ${label.ar}\nالاعتماد: ${certLabel.ar}\nالدقة: ${data.dimensions?.accuracy ?? "—"} · الاكتمال: ${data.dimensions?.completeness ?? "—"} · الحداثة: ${data.dimensions?.freshness ?? "—"} · سلامة السجل: ${data.dimensions?.provenance ?? "—"}\nمشاكل حاجزة: ${data.dimensions?.blockerCount ?? 0} (آخر تدقيق: ${auditedAt ? new Date(auditedAt).toLocaleDateString("ar-EG") : "—"})`
    : `Data confidence: ${score}/100 — ${label.en}\nCertification: ${certLabel.en}\nAccuracy: ${data.dimensions?.accuracy ?? "—"} · Completeness: ${data.dimensions?.completeness ?? "—"} · Freshness: ${data.dimensions?.freshness ?? "—"} · Integrity: ${data.dimensions?.provenance ?? "—"}\nBlockers: ${data.dimensions?.blockerCount ?? 0} (audited: ${auditedAt ? new Date(auditedAt).toLocaleDateString() : "—"})`

  return (
    <Link
      href={`/data-quality?ticker=${encodeURIComponent(ticker)}`}
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold transition-opacity hover:opacity-80 ${style} ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span className="tabular">{score}</span>
      <span className={`inline-flex items-center gap-0.5 rounded-full border px-1 py-px text-[8px] ${CERT_STYLES[cert] ?? ""}`}>
        <CertIcon className="h-2.5 w-2.5" />
        {ar ? certLabel.ar : certLabel.en}
      </span>
    </Link>
  )
}
