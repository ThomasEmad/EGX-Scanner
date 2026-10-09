"use client"

import { useQuery } from "@tanstack/react-query"
import { Building2, Sparkles, ScanSearch, FileCheck2, ShieldCheck, Gauge } from "lucide-react"
import { AppFooter } from "@/components/egx/app-footer"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import Link from "next/link"
import { Button } from "@/components/ui/button"

type DashStats = {
  stats?: { companies?: number; validValues?: number; events?: number }
}

export default function AboutPage() {
  const { t, lang } = useI18n()
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/v1/dashboard").then((r) => (r.ok ? (r.json() as Promise<DashStats>) : null)),
    staleTime: 60_000,
  })

  const stats = [
    { icon: <Building2 className="h-4 w-4" />, label: lang === "ar" ? "شركات متتبعة" : "Companies tracked", value: data?.stats?.companies ?? 0 },
    { icon: <Sparkles className="h-4 w-4" />, label: lang === "ar" ? "قيمة مالية موثقة" : "Verified values", value: data?.stats?.validValues ?? 0 },
    { icon: <ScanSearch className="h-4 w-4" />, label: lang === "ar" ? "حدث مالي مكتشف" : "Financial events", value: data?.stats?.events ?? 0 },
    { icon: <FileCheck2 className="h-4 w-4" />, label: lang === "ar" ? "قائمة موثقة" : "Verified filings", value: data?.stats?.validValues ?? 0 },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Gauge className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold">EGX Scanner</span>
          </Link>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="h-8 text-xs">
              {lang === "ar" ? "لوحة التحكم" : "Dashboard"}
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{lang === "ar" ? "من نحن" : "About"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "ar" ? "منصة ماسح البيانات المالية للبورصة المصرية" : "EGX Financial Scanner platform"}
          </p>
        </div>

        <Card className="border-border/60">
          <CardContent className="space-y-4 p-5 text-sm leading-relaxed text-muted-foreground">
            <p className="text-foreground">
              {lang === "ar"
                ? "منصة تحليل مالية للمستثمر في البورصة المصرية: ماسحات أحداث استثمارية، مقارنة أقران بنفس القطاع، أسعار ومضاعفات، وتتبع توزيعات — مع مبدأ ثابت: كل رقم يظهر على المنصة مرتبط بمصدره، والبيانات الناقصة تعرض كـ«غير متاح» ولا تُقدَّر أبداً."
                : "A financial analysis platform for Egyptian Exchange investors: investment-event scanners, same-sector peer comparison, prices and valuation multiples, and dividend tracking — with one fixed principle: every figure shown is tied to its source, and missing data is shown as unavailable, never estimated."}
            </p>
            <p>
              {lang === "ar"
                ? "البيانات تُجمع من الإفصاحات الرسمية للشركات ومصادر عامة موثوقة (قوائم منشورة، جداول أرباح معلنة، صفحات مالية رسمية) وتُوحد وحداتها وتُدقق حسابياً قبل العرض، مع إسناد كل قيمة لمصدرها وتاريخها."
                : "Data is gathered from companies' official disclosures and trusted public sources (published statements, announced earnings tables, official financial pages), unit-normalized and arithmetically checked before display, with per-value source and date attribution."}
            </p>
          </CardContent>
        </Card>

        <section aria-label={lang === "ar" ? "أرقام المنصة" : "Platform numbers"}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            {lang === "ar" ? "أرقام المنصة الآن" : "Platform numbers today"}
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((s) => (
              <Card key={s.label} className="relative overflow-hidden border-border/60 p-4">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary/80 via-primary/30 to-transparent" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{s.icon}</span>
                  <span className="leading-tight">{s.label}</span>
                </div>
                <p className="mt-2.5 text-2xl font-bold tabular tracking-tight">{s.value.toLocaleString()}</p>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  )
}
