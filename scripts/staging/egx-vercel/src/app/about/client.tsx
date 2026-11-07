"use client"

import { useQuery } from "@tanstack/react-query"
import { Building2, Sparkles, ScanSearch, FileCheck2, ShieldCheck, Gauge } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import Link from "next/link"
import { Button } from "@/components/ui/button"

type DashStats = {
  stats?: { companies?: number; reports?: number; validValues?: number; events?: number }
}

export default function AboutPage() {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/v1/dashboard").then((r) => (r.ok ? (r.json() as Promise<DashStats>) : null)),
    staleTime: 60_000,
  })

  const n = (v: number | undefined) => (typeof v === "number" ? v.toLocaleString() : "—")
  const stats = [
    { icon: <Building2 className="h-4 w-4" />, label: ar ? "شركات متتبعة" : "Companies tracked", value: n(data?.stats?.companies) },
    { icon: <FileCheck2 className="h-4 w-4" />, label: ar ? "قوائم مالية" : "Financial reports", value: n(data?.stats?.reports) },
    { icon: <Sparkles className="h-4 w-4" />, label: ar ? "نقطة بيانات مالية" : "Financial data points", value: n(data?.stats?.validValues) },
    { icon: <ScanSearch className="h-4 w-4" />, label: ar ? "حدث مالي مكتشف" : "Detected events", value: n(data?.stats?.events) },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Gauge className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold">Meza</span>
          </Link>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="h-8 text-xs">
              {ar ? "لوحة التحكم" : "Dashboard"}
            </Button>
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "من نحن" : "About"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ar ? "منصة ماسح البيانات المالية للبورصة المصرية" : "Meza platform"}
          </p>
        </div>

        <Card className="border-border/60">
          <CardContent className="space-y-4 p-5 text-sm leading-relaxed text-muted-foreground">
            <p className="text-foreground">
              {ar
                ? "منصة تحليل مالية للمستثمر في البورصة المصرية: ماسحات لأحداث مالية، مقارنة أقران بنفس القطاع، وأسعار ومضاعفات — مع مبدأ ثابت: أرقام فعلية من القوائم المنشورة، والبيانات الناقصة تعرض كـ«غير متاح» ولا تُقدَّر أبداً."
                : "A financial analysis platform for Egyptian Exchange investors: financial-event scanners, same-sector peer comparison, and prices and valuation multiples — with one fixed principle: real figures from published statements, and missing data is shown as unavailable, never estimated."}
            </p>
            <p>
              {ar
                ? "تُجمع البيانات من القوائم المالية المنشورة للشركات، ثم تُوحَّد وحداتها وتُفحص حسابياً قبل العرض. البيانات الناقصة تظهر كـ«غير متاح» ولا تُقدَّر أبداً."
                : "Data is collected from companies' published financial statements, then unit-normalized and arithmetically checked before display. Missing data is shown as unavailable, never estimated."}
            </p>
          </CardContent>
        </Card>

        <section aria-label={ar ? "أرقام المنصة" : "Platform numbers"}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            {ar ? "أرقام المنصة الآن" : "Platform numbers today"}
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((s) => (
              <Card key={s.label} className="relative overflow-hidden border-border/60 p-4">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary/80 via-primary/30 to-transparent" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{s.icon}</span>
                  <span className="leading-tight">{s.label}</span>
                </div>
                <p className="mt-2.5 text-2xl font-bold tabular tracking-tight">{s.value}</p>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {ar
              ? "«—» تعني أن الإحصائية غير متاحة مؤقتاً، وليست صفراً."
              : "“—” means the statistic is temporarily unavailable — it is not zero."}
          </p>
        </section>
      </main>

    </div>
  )
}
