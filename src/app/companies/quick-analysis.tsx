"use client"

// Quick AI analysis dialog for the /companies directory: generates (or serves
// the cached) grounded expert analysis for a company straight from the listing
// — no need to open the full company page first. The generation mutation lives
// in the parent shell so in-flight state survives closing and reopening the
// dialog; this component only renders the four states: login prompt, loading,
// error (mapped per API error), and the analysis itself.

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import ReactMarkdown, { type Components } from "react-markdown"
import { AlertTriangle, LogIn, RefreshCw, ShieldCheck, Sparkles } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/lib/i18n"
import { api, getUserToken, type AiAnalysisData } from "@/lib/client/api"

export interface QuickAiTarget {
  ticker: string
  nameEn: string
  nameAr: string | null
}

export type GenerateMutation = {
  isPending: boolean
  variables?: { ticker: string; lang: string } | undefined
  data?: (AiAnalysisData & { cached?: boolean; degraded?: boolean }) | undefined
  error: unknown
  mutate: (v: { ticker: string; lang: string }) => void
}

// Manual prose styling for markdown (matches the detail-page treatment,
// tightened for the narrower dialog column).
const mdComponents: Components = {
  h1: ({ children }) => <h2 className="mt-5 text-base font-bold first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mt-4 text-sm font-bold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 text-sm font-semibold first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 ps-5 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 ps-5 text-sm">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-s-2 border-border ps-3 text-sm italic text-muted-foreground">{children}</blockquote>
  ),
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-md border">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  th: ({ children }) => <th className="border-b p-2 text-start font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b p-2 align-top">{children}</td>,
}

type ApiError = Error & { status?: number; body?: { error?: string; message?: string; usage?: { usageCount: number; limit: number } } }

function fmtDate(iso: string, ar: boolean): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(ar ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short" })
}

export function QuickAiAnalysisDialog({
  open,
  target,
  onOpenChange,
  gen,
}: {
  open: boolean
  target: QuickAiTarget | null
  onOpenChange: (open: boolean) => void
  gen: GenerateMutation
}) {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const router = useRouter()
  const loggedIn = typeof window !== "undefined" && !!getUserToken()

  // Usage badge — only fetched while the dialog is open; the parent's
  // invalidation after a fresh generation keeps it accurate.
  const { data: subData } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => api.subscription(),
    enabled: open,
    staleTime: 30_000,
  })
  const usage = subData?.smartAnalysisUsage ?? null

  // This dialog's mutation instance is keyed by ticker: only show a result/
  // error/loading state when it belongs to the company currently opened.
  const forThisTarget = !!target && gen.variables?.ticker === target.ticker
  const err = (forThisTarget ? gen.error : null) as ApiError | null
  const errCode = err?.body?.error ?? (/NO_DATA/i.test(err?.message ?? "") ? "NO_DATA" : "")
  const usageExhausted = !!err && (err.status === 429 || /USAGE_LIMIT_EXCEEDED/i.test(err.message)) && /USAGE_LIMIT/i.test(errCode || err.message)
  const rateLimited = !!err && err.status === 429 && !usageExhausted
  const authError = !!err && err.status === 401
  const analysis = forThisTarget ? gen.data?.analysis ?? null : null
  // No token at all, or the server rejected the session (401) → sign-in CTA.
  const showLogin = !loggedIn || authError

  const title = target ? ar ? target.nameAr ?? target.nameEn : target.nameEn : ""

  function regenerate() {
    if (!target) return
    gen.mutate({ ticker: target.ticker, lang })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-start">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{title}</span>
            {target ? <Badge variant="outline" className="font-mono text-[10px]">{target.ticker}</Badge> : null}
            {subData?.isPremium ? (
              <Badge variant="secondary" className="text-[10px]">{ar ? "بريميوم — غير محدود" : "Premium — unlimited"}</Badge>
            ) : usage ? (
              <Badge variant="outline" className="text-[10px]">
                {ar ? `التحليلات الذكية: ${usage.usageCount}/${usage.limit}` : `Smart Analyses: ${usage.usageCount}/${usage.limit}`}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {ar
              ? "تحليل خبير حقيقي يتولّد لحظياً من القوائم المالية الموثقة للشركة والبيانات السوقية — نفس المحرك المستخدم في صفحة الشركة."
              : "A real expert analysis generated on the spot from the company's verified financial statements and market data — same engine as the company page."}
          </DialogDescription>
        </DialogHeader>

        {showLogin ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <LogIn className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {ar
                ? "التحليل الذكي متاح لحسابات المسجّلين. سجّل الدخول (أو أنشئ حساب مجاني) ثم جرّب الزر من جديد — الحساب المجاني يشمل 3 تحليلات شهرياً."
                : "Smart Analysis is available to registered accounts. Sign in (or create a free account) and try the button again — the free tier includes 3 analyses per month."}
            </p>
            <Button size="sm" className="gap-1.5" onClick={() => router.push("/login")}>
              <LogIn className="h-4 w-4" aria-hidden />
              {ar ? "تسجيل الدخول" : "Sign in"}
            </Button>
          </div>
        ) : forThisTarget && gen.isPending ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping" aria-hidden />
              <span className="absolute inset-2 rounded-full bg-primary/10 animate-pulse" aria-hidden />
              <Sparkles className="relative h-7 w-7 text-primary" aria-hidden />
            </div>
            <p className="text-sm font-semibold">{ar ? "بيجهّز التحليل دلوقتي…" : "Generating the analysis…"}</p>
            <div className="flex items-center gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              {ar
                ? "النموذج بيقرأ القيم المالية الموثقة من قاعدة البيانات بس — العملية ممكن تاخد حتى دقيقة. التحليل بيتخزّن، فالطلبات الجاية على نفس البيانات بترجع فوراً."
                : "The model reads only verified financial values from the database — this can take up to a minute. The analysis is stored, so repeat requests on the same data return instantly."}
            </p>
          </div>
        ) : err ? (
          <div className="space-y-3 py-2">
            {usageExhausted ? (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" aria-hidden />
                </div>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {ar
                    ? "استنفدت الحد المجاني للتحليلات الذكية لهذا الشهر (3 تحليلات). قم بالترقية للحصول على تحليلات غير محدودة، أو انتظر تجديد الحد مع بداية الشهر."
                    : "You have reached the free monthly limit for Smart Analyses (3). Upgrade for unlimited analyses, or wait for the quota to reset at the start of next month."}
                </p>
                <Button size="sm" asChild className="gap-1.5">
                  <Link href="/premium">
                    <Sparkles className="h-4 w-4" aria-hidden />
                    {ar ? "الترقية للبريميوم" : "Upgrade to Premium"}
                  </Link>
                </Button>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                <AlertTitle>
                  {errCode === "NO_DATA"
                    ? ar
                      ? "لا توجد بيانات مالية موثقة لهذه الشركة بعد"
                      : "No verified financial data for this company yet"
                    : rateLimited
                      ? ar
                        ? "محاولات كثيرة — استنى شوية وجرب تاني"
                        : "Too many attempts — wait a moment and retry"
                      : ar
                        ? "تعذّر توليد التحليل"
                        : "Failed to generate the analysis"}
                </AlertTitle>
                <AlertDescription className="text-xs leading-relaxed">
                  {errCode === "NO_DATA"
                    ? ar
                      ? "ارفع ووافق على القوائم المالية أولاً من لوحة الأدمن، ثم جرب من جديد."
                      : "Upload and approve financial statements first, then try again."
                    : rateLimited
                      ? ar
                        ? "التحليل محدود بـ 10 توليدات كل 10 دقائق."
                        : "AI analysis is limited to 10 generations per 10 minutes."
                      : err.message}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={regenerate}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {ar ? "إعادة المحاولة" : "Retry"}
              </Button>
            </div>
          </div>
        ) : analysis ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {analysis.model ? <Badge variant="secondary" className="font-mono text-[10px]">{analysis.model}</Badge> : null}
                {gen.data?.cached ? (
                  <Badge variant="outline" className="text-[10px]">{ar ? "من الكاش — نفس البيانات" : "cached — same data"}</Badge>
                ) : null}
                <span className="text-[11px] text-muted-foreground">{fmtDate(analysis.createdAt, ar)}</span>
              </div>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={regenerate}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {ar ? "تحديث" : "Refresh"}
              </Button>
            </div>

            {gen.data?.degraded ? (
              <Alert className="border-warning/40 bg-warning/5">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                <AlertDescription className="text-xs">
                  {ar
                    ? "محرك التحليل الذكي مش متاح حالياً — ده ملخص رقمي محسوب من البيانات مش تحليل LLM كامل. جرب التحديث بعد شوية."
                    : "The AI engine is currently unavailable — this is a deterministic numeric summary computed from the data, not a full LLM analysis. Try refreshing later."}
                </AlertDescription>
              </Alert>
            ) : null}

            <div dir={ar ? "rtl" : "ltr"} className="rounded-xl border border-border/60 p-4">
              <ReactMarkdown components={mdComponents}>{analysis.content}</ReactMarkdown>
            </div>

            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
              {ar
                ? "كل الأرقام من القوائم المالية الموثقة والبيانات السوقية فقط — ده تعليق سوقي مش توصية استثمارية شخصية."
                : "Every figure comes only from verified financial statements and market data — market commentary, not personalized investment advice."}
            </p>

            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
                <Link href={`/company/${target?.ticker ?? ""}`}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  {ar ? "التحليل الكامل + اسأل المحلل" : "Full analysis + ask the analyst"}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          // Target just opened and the mutation hasn't started reporting yet —
          // show a neutral skeleton instead of flashing the empty grid.
          <div className="space-y-3 py-2">
            <Skeleton className="h-6 w-1/3 rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-5/6 rounded-md" />
            <Skeleton className="h-4 w-4/6 rounded-md" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
