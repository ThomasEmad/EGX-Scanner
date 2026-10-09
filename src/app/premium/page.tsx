"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Check, Crown, Loader2, ShieldCheck, MessageCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { getUserToken } from "@/lib/client/api"

export default function PremiumPage() {
  const { t, lang } = useI18n()

  const { data: settingsData } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => fetch("/api/v1/settings/public").then((r) => (r.ok ? r.json() : Promise.resolve({}))),
  })

  const { data: subStatus, isLoading: subLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => fetch("/api/v1/subscription/me", { headers: { "x-session-token": getUserToken() ?? "" } }).then((r) => (r.ok ? r.json() : Promise.resolve({ isPremium: false, subscription: null, smartAnalysisUsage: null }))),
    enabled: typeof window !== "undefined",
  })

  const qc = useQueryClient()
  const requestSub = useMutation({
    mutationFn: async (notes?: string) => {
      const res = await fetch("/api/v1/subscription/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": getUserToken() ?? "" },
        body: JSON.stringify({ notes }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "Failed to request subscription" }))).error)
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-subscription"] })
    },
  })

  const settings = (settingsData ?? {}) as Record<string, unknown>

  const price = typeof settings.PREMIUM_PRICE === "number" ? settings.PREMIUM_PRICE : 99
  const currency = typeof settings.PREMIUM_CURRENCY === "string" ? settings.PREMIUM_CURRENCY : "EGP"
  const durationDays = typeof settings.PREMIUM_DURATION_DAYS === "number" ? settings.PREMIUM_DURATION_DAYS : 30
  const phone = typeof settings.PAYMENT_PHONE === "string" ? settings.PAYMENT_PHONE : ""
  const whatsapp = typeof settings.WHATSAPP_NUMBER === "string" ? settings.WHATSAPP_NUMBER : ""
  const instructions = typeof settings.PAYMENT_INSTRUCTIONS === "string" ? settings.PAYMENT_INSTRUCTIONS : ""

  const subscription = subStatus?.subscription
  const isPremium = !!subStatus?.isPremium
  const status = subscription?.status

  const openWhatsApp = () => {
    const number = whatsapp.replace(/\D/g, "")
    const message = lang === "ar"
      ? `مرحباً، أريد الاشتراك في Premium لمدة ${durationDays} يومًا.`
      : `Hello, I would like to subscribe to Premium for ${durationDays} days.`
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer")
  }

  let statusBlock: React.ReactNode = null
  if (subLoading) {
    statusBlock = <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
  } else if (isPremium && status === "ACTIVE") {
    statusBlock = (
      <Card className="border-emerald-500/40 bg-emerald-50/50">
        <CardContent className="p-4 text-xs">
          <p className="font-medium text-emerald-700">{lang === "ar" ? "أنت مشترك في Premium" : "You are a Premium member"}</p>
          <p className="mt-1 text-muted-foreground">
            {lang === "ar" ? "ينتهي في" : "Expires"}: {subscription?.endDate ? new Date(subscription.endDate).toLocaleDateString() : "—"}
          </p>
        </CardContent>
      </Card>
    )
  } else if (status === "PENDING") {
    statusBlock = (
      <Card className="border-amber-500/40 bg-amber-50/50">
        <CardContent className="p-4 text-xs">
          <p className="font-medium text-amber-700">{lang === "ar" ? "طلبك قيد المراجعة" : "Your request is pending approval"}</p>
          <p className="mt-1 text-muted-foreground">
            {lang === "ar" ? "سيتم تفعيل اشتراكك بعد موافقة المشرف." : "Your subscription will be activated once approved by an admin."}
          </p>
        </CardContent>
      </Card>
    )
  } else if (status === "REJECTED") {
    statusBlock = (
      <Card className="border-red-500/40 bg-red-50/50">
        <CardContent className="p-4 text-xs">
          <p className="font-medium text-red-700">{lang === "ar" ? "تم رفض الطلب" : "Your request was rejected"}</p>
          <Button size="sm" className="mt-2" onClick={() => requestSub.mutate(undefined)} disabled={requestSub.isPending}>
            {requestSub.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : lang === "ar" ? "إعادة المحاولة" : "Try again"}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="text-center">
        <Badge variant="secondary" className="mb-2">
          <Crown className="me-1 h-3.5 w-3.5" />
          {lang === "ar" ? "بريميوم" : "Premium"}
        </Badge>
        <h1 className="text-2xl font-bold">{lang === "ar" ? "ترقّي إلى Premium" : "Upgrade to Premium"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {lang === "ar"
            ? `اشتراك ${durationDays} يومًا بسعر ${price} ${currency}`
            : `${durationDays}-day subscription — ${price} ${currency}`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { t: lang === "ar" ? "مؤشر الصحة المالية" : "Financial Health Score", d: lang === "ar" ? "درجة 0-100 من 5 محاور موثقة + ندفة الثلج البصرية" : "0-100 score across 5 verified axes + snowflake visual" },
          { t: lang === "ar" ? "أطروحة استثمار بالـ AI" : "AI Investment Thesis", d: lang === "ar" ? "قوة/ضعف/فرص/مخاطر من البيانات الموثقة فقط" : "Strengths/weaknesses/opportunities/risks from verified data only" },
          { t: lang === "ar" ? "فرص التقييم القطاعي" : "Sector Valuation Screen", d: lang === "ar" ? "الشركات الأقل من متوسط قطاعها (P/E وP/B)" : "Companies below their sector median P/E & P/B" },
          { t: lang === "ar" ? "أحدث النتائج المعلنة" : "Latest Announced Results", d: lang === "ar" ? "آخر صافي ربح معلن لكل شركة — الأحدث أولاً" : "Most recent announced net profit per company — newest first" },
          { t: lang === "ar" ? "أحداث استثمارية" : "Investment Events", d: lang === "ar" ? "انقلاب أرباح، نمو، تخفيض دين — مع الشرح" : "Profit turns, growth, debt cuts — with explanations" },
          { t: lang === "ar" ? "أرباع 2026 موثقة" : "Verified 2026 quarters", d: lang === "ar" ? "قوائم ربعية بسلاسل زمنية كاملة لكل شركة" : "Quarterly statements with full time series per company" },
        ].map((f) => (
          <div key={f.t} className="rounded-xl border border-border/60 bg-card p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Check className="h-4 w-4 text-emerald-500" aria-hidden />
              {f.t}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </div>

      {statusBlock}

      {!isPremium && status !== "PENDING" && status !== "REJECTED" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{lang === "ar" ? "اطلب اشتراك Premium" : "Request Premium Subscription"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <p className="text-muted-foreground">
              {lang === "ar"
                ? "أرسل طلب اشتراك وسيتم مراجعته من قبل المشرف. بعد الموافقة، سيتم تفعيل اشتراكك."
                : "Submit a subscription request for admin review. Once approved, your subscription will be activated."}
            </p>
            <Button size="sm" className="w-full gap-2" onClick={() => requestSub.mutate(undefined)} disabled={requestSub.isPending}>
              {requestSub.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {lang === "ar" ? "إرسال طلب الاشتراك" : "Submit Subscription Request"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{lang === "ar" ? "مجاني" : "Free"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>{lang === "ar" ? "معلومات أساسية عن الشركات" : "Basic company information"}</p>
            <p>{lang === "ar" ? "بيانات مالية أساسية" : "Basic financial data"}</p>
            <p>{lang === "ar" ? "3 تحليلات ذكية شهرياً" : "3 Smart Analyses per month"}</p>
            <p>{lang === "ar" ? "فحوصات مالية" : "Financial scanning"}</p>
            <p className="font-medium text-foreground">{lang === "ar" ? "+ إعلانات" : "+ Ads"}</p>
          </CardContent>
        </Card>
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              {lang === "ar" ? "بريميوم" : "Premium"}
              <Badge variant="outline" className="text-[10px]">
                <ShieldCheck className="me-1 h-3 w-3" />
                {lang === "ar" ? "موصى به" : "Recommended"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <p className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {lang === "ar" ? "كل مميزات المجاني" : "All Free features"}</p>
            <p className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {lang === "ar" ? "تحليلات ذكية غير محدودة" : "Unlimited Smart Analyses"}</p>
            <p className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {lang === "ar" ? "أحداث الشركات" : "Company Events"}</p>
            <p className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {lang === "ar" ? "تحليل مالي متقدم" : "Advanced financial analysis"}</p>
            <p className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {lang === "ar" ? "بدون إعلانات" : "No ads"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{lang === "ar" ? "طرق الدفع" : "Payment methods"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="font-medium">{lang === "ar" ? "تحويل بنكي / محفظة" : "Bank transfer / wallet"}</p>
            {phone ? <p className="mt-1 tabular">{lang === "ar" ? "رقم التحويل:" : "Payment number:"} {phone}</p> : null}
            {whatsapp ? (
              <Button size="sm" variant="outline" className="mt-3 w-full gap-2" onClick={openWhatsApp}>
                <MessageCircle className="h-4 w-4" />
                {lang === "ar" ? "تواصل عبر واتساب للدفع" : "Contact via WhatsApp for payment"}
              </Button>
            ) : null}
          </div>
          {instructions ? (
            <div className="rounded-lg border p-3">
              <p className="whitespace-pre-wrap text-muted-foreground">{instructions}</p>
            </div>
          ) : null}
          <p className="text-muted-foreground">
            {lang === "ar"
              ? "بعد إتمام التحويل، أرسل طلب اشتراك أعلاه وسيقوم المشرف بتفعيل اشتراكك بعد التحقق من الدفع."
              : "After completing the transfer, submit the subscription request above. An admin will verify payment and activate your subscription."}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
