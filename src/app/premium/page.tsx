"use client"

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Check, Crown, Loader2, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"

export default function PremiumPage() {
  const { t, lang } = useI18n()
  const [settings, setSettings] = useState<Record<string, unknown>>({})

  useQuery({
    queryKey: ["public-settings"],
    queryFn: () => fetch("/api/v1/settings/public").then((r) => (r.ok ? r.json() : Promise.resolve({}))),
  })

  const price = typeof settings.PREMIUM_PRICE === "number" ? settings.PREMIUM_PRICE : 99
  const currency = typeof settings.PREMIUM_CURRENCY === "string" ? settings.PREMIUM_CURRENCY : "EGP"
  const durationDays = typeof settings.PREMIUM_DURATION_DAYS === "number" ? settings.PREMIUM_DURATION_DAYS : 30
  const phone = typeof settings.PAYMENT_PHONE === "string" ? settings.PAYMENT_PHONE : ""
  const whatsapp = typeof settings.WHATSAPP_NUMBER === "string" ? settings.WHATSAPP_NUMBER : ""
  const instructions = typeof settings.PAYMENT_INSTRUCTIONS === "string" ? settings.PAYMENT_INSTRUCTIONS : ""

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
            ? `الاشتراك ${durationDays} يومًا بسعر ${price} ${currency}`
            : `${durationDays}-day subscription for ${price} ${currency}`}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{lang === "ar" ? "مجاني" : "Free"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>{lang === "ar" ? "معلومات أساسية عن الشركات" : "Basic company information"}</p>
            <p>{lang === "ar" ? "بيانات مالية أساسية" : "Basic financial data"}</p>
            <p>{lang === "ar" ? "تحليل أساسي" : "Basic analysis"}</p>
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
            <p className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {lang === "ar" ? "تحليل مالي متقدم" : "Advanced financial analysis"}</p>
            <p className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {lang === "ar" ? "مقارنات أعمق" : "Deeper company comparisons"}</p>
            <p className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {lang === "ar" ? "بدون إعلانات" : "No ads"}</p>
            <p className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {lang === "ar" ? "تاريخ كامل" : "Full historical data"}</p>
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
              <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary">
                {lang === "ar" ? "تواصل عبر واتساب" : "Contact via WhatsApp"} <ArrowRight className="h-3.5 w-3.5 rtl-flip" />
              </a>
            ) : null}
          </div>
          {instructions ? (
            <div className="rounded-lg border p-3">
              <p className="whitespace-pre-wrap text-muted-foreground">{instructions}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
