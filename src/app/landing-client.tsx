"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Building2,
  Gauge,
  ScanSearch,
  CalendarDays,
  FileCheck2,
  Crown,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Scale,
  Search,
  Activity,
  Layers,
  CheckCircle2,
  ArrowUpRight,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AppHeader } from "@/components/egx/app-header"
import { AppFooter } from "@/components/egx/app-footer"
import { useQuery } from "@tanstack/react-query"
import { useI18n } from "@/lib/i18n"
import { api } from "@/lib/client/api"

export default function LandingClient() {
  const { t, lang } = useI18n()
  const router = useRouter()
  const ar = lang === "ar"

  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard,
    staleTime: 120_000,
  })

  const stats = dashboardData?.stats ?? {
    companies: 103,
    reports: 399,
    validValues: 15200,
    events: 674,
  }

  const sampleCompanies = [
    { ticker: "COMI", nameEn: "Commercial International Bank", nameAr: "البنك التجاري الدولي", sector: "Banks", highlight: "ROE 31.4%" },
    { ticker: "ETEL", nameEn: "Telecom Egypt", nameAr: "المصرية للاتصالات", sector: "Telecom", highlight: "EGP 44B Rev" },
    { ticker: "ABUK", nameEn: "Abu Qir Fertilizers", nameAr: "أبو قير للأسمدة", sector: "Basic Materials", highlight: "Zero Debt" },
    { ticker: "TMGH", nameEn: "Talaat Moustafa Group", nameAr: "مجموعة طلعت مصطفى", sector: "Real Estate", highlight: "Margin 24%" },
    { ticker: "EAST", nameEn: "Eastern Company", nameAr: "الشرقية للدخان", sector: "Consumer", highlight: "Div Yield 11%" },
    { ticker: "MOPCO", nameEn: "Misr Fertilizers Production", nameAr: "مصر لإنتاج الأسمدة", sector: "Basic Materials", highlight: "Turnaround" },
  ]

  const strategyPresets = [
    {
      title: ar ? "تحول جذري للربحية" : "Loss-to-Profit Turnaround",
      desc: ar ? "شركات تحولت من صافي خسارة إلى صافي أرباح مؤكدة على أساس المقارنة السنوية." : "Companies transitioning from net losses into verified net profits year-over-year.",
      ruleId: "preset-turnaround",
      tag: ar ? "قيمة عالية" : "High Alpha",
    },
    {
      title: ar ? "تسارع نمو الأرباح" : "Profit Growth Champions",
      desc: ar ? "نمو صافي الأرباح بنسبة لا تقل عن 30% مدعوم بتدفقات نقدية تشغيلية إيجابية." : "Net profit growth ≥ 30% supported by positive operating cash flows.",
      ruleId: "preset-profit-growth-30",
      tag: ar ? "نمو متسارع" : "Accelerating",
    },
    {
      title: ar ? "قيمة منخفضة وملاءة آمنة" : "Deep Value & Solvency",
      desc: ar ? "مضاعف ربحية أقل من وسيط القطاع مع نسبة دين إلى حقوق الملكية أقل من 0.5." : "P/E below sector median combined with conservative Debt/Equity < 0.5.",
      ruleId: "preset-debt-reduction",
      tag: ar ? "أمان وملاءة" : "Defensive",
    },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20 selection:text-primary">
      <AppHeader onViewChange={(v) => router.push(`/dashboard#/${v}`)} />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-16 md:py-24 border-b border-border/50">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
          <div className="absolute top-1/4 start-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-6 backdrop-blur-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {ar ? "منظومة استخبارات مالية رسمية · البورصة المصرية EGX" : "Official Financial Intelligence Platform · Egyptian Exchange"}
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-balance leading-[1.15]">
                {ar ? (
                  <>
                    اكتشف فرص البورصة المصرية <br />
                    <span className="bg-gradient-to-r from-primary to-teal-500 bg-clip-text text-transparent">
                      بحقائق مالية موثقة 100%
                    </span>
                  </>
                ) : (
                  <>
                    Discover EGX opportunities <br />
                    <span className="bg-gradient-to-r from-primary to-teal-500 bg-clip-text text-transparent">
                      with 100% audited financial facts
                    </span>
                  </>
                )}
              </h1>

              <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
                {ar
                  ? "ماسح ذكي لأنماط الشركات: تحولات الخسارة إلى ربح، تسارع الإيرادات، خفض الديون، وتدفقات النقد — كل رقم موثق من القوائم الرسمية مع بصمة SHA-256 وبدون افتراضات."
                  : "Institutional-grade pattern scanner: loss-to-profit turnarounds, revenue acceleration, deleveraging, and cash flows. Every single figure traced to official filings with SHA-256 cryptographic verification."}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/dashboard">
                  <Button size="lg" className="h-12 px-6 gap-2 btn-primary font-semibold text-sm shadow-md">
                    {ar ? "فتح المنصة والماسحات" : "Open Financial Terminal"}
                    <ArrowRight className="h-4 w-4 rtl-flip" />
                  </Button>
                </Link>
                <Link href="/dashboard#/custom">
                  <Button size="lg" variant="outline" className="h-12 px-5 gap-2 text-sm border-border/80 hover:bg-muted/60">
                    <ScanSearch className="h-4 w-4 text-primary" />
                    {ar ? "بناء ماسح مخصص" : "Build Custom Scanner"}
                  </Button>
                </Link>
                <Link href="/premium">
                  <Button size="lg" variant="ghost" className="h-12 px-4 gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <Crown className="h-4 w-4" />
                    <span>Premium</span>
                  </Button>
                </Link>
              </div>

              {/* KPI Strip */}
              <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border/60 bg-card/80 p-3.5 backdrop-blur-xs">
                  <div className="text-2xl sm:text-3xl font-extrabold tabular text-primary">
                    {stats.companies}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                    {ar ? "شركة مدرجة بالبورصة" : "Listed EGX companies"}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/80 p-3.5 backdrop-blur-xs">
                  <div className="text-2xl sm:text-3xl font-extrabold tabular text-foreground">
                    {stats.reports.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                    {ar ? "قائمة مالية معتمدة" : "Audited report filings"}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/80 p-3.5 backdrop-blur-xs">
                  <div className="text-2xl sm:text-3xl font-extrabold tabular text-emerald-600 dark:text-emerald-400">
                    {stats.validValues.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                    {ar ? "قيمة مالية موثقة" : "Verified financial values"}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/80 p-3.5 backdrop-blur-xs">
                  <div className="text-2xl sm:text-3xl font-extrabold tabular text-teal-600 dark:text-teal-400">
                    {stats.events?.toLocaleString?.() ?? "670+"}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                    {ar ? "حدث مالي مكتشف" : "Detected corporate events"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live EGX Leaders Showcase */}
        <section className="py-14 bg-muted/20 border-b border-border/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  {ar ? "شركات قيادية في البورصة المصرية" : "Featured Egyptian Exchange Leaders"}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                  {ar ? "اضغط على أي شركة لاستعراض القوائم والمؤشرات والتحليل المالي المباشر" : "Select any company to inspect balance sheets, ratios, and grounded AI analysis"}
                </p>
              </div>
              <Link href="/dashboard#/companies">
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  {ar ? "استعراض جميع الشركات" : "View all 103 companies"}
                  <ArrowRight className="h-3.5 w-3.5 rtl-flip" />
                </Button>
              </Link>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {sampleCompanies.map((c) => (
                <div
                  key={c.ticker}
                  onClick={() => router.push(`/company/${c.ticker}`)}
                  className="group cursor-pointer rounded-xl border border-border/60 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-11 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                        {c.ticker}
                      </span>
                      <div>
                        <div className="text-xs font-bold group-hover:text-primary transition-colors">
                          {ar ? c.nameAr : c.nameEn}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{c.sector}</div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-semibold tabular">
                      {c.highlight}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/40">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-500" />
                      {ar ? "قوائم موثقة" : "Official filings"}
                    </span>
                    <span className="flex items-center gap-0.5 text-primary font-medium group-hover:translate-x-0.5 rtl-flip transition-transform">
                      {ar ? "فتح الملف" : "Inspect"}
                      <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4 Pillars of Institutional Trust */}
        <section className="py-16 md:py-20 border-b border-border/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
                {ar ? "معايير النزاهة المؤسسية" : "Institutional Integrity"}
              </Badge>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {ar ? "لماذا يعتمد المستثمرون على EGX Scanner؟" : "Engineered for Serious Financial Research"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {ar
                  ? "بنيت المنصة بأعلى معايير الدقة والشفافية لإلغاء التقديرات غير المؤكدة وتقديم أرقام يمكنك الاعتماد عليها."
                  : "Built from first principles to eliminate hallucinations, enforce accounting identities, and deliver decision-grade data."}
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border/60 bg-card transition-all duration-200 hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-2">
                    <ScanSearch className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base font-bold">
                    {ar ? "ماسح أنماط مالي" : "Deterministic Scanner"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground leading-relaxed">
                  {ar
                    ? "قواعد منطقية صريحة تفحص تحولات الأرباح، الرفع المالي، ونمو المبيعات مع تفسير مفصل لكل شرط مطابق."
                    : "Explicit Boolean logic testing profit transitions, debt changes, and cash quality with step-by-step condition auditing."}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card transition-all duration-200 hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-2">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base font-bold">
                    {ar ? "تدقيق المصدر والبصمة" : "Cryptographic Provenance"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground leading-relaxed">
                  {ar
                    ? "كل رقم مستخرج يرتبط مباشرة بملف الإفصاح الأصلي وبصمة SHA-256 مع فحص توازن الميزانية بنسبة 1%."
                    : "Every metric links back to its exact filing PDF page, original unit scale, and cryptographic hash with automated balance sheet validation."}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card transition-all duration-200 hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 mb-2">
                    <Scale className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base font-bold">
                    {ar ? "مقارنة قطاعية منضبطة" : "Strict Sector Benchmarking"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground leading-relaxed">
                  {ar
                    ? "مقارنة الشركات داخل قطاعها فقط لتفادي تشويه النسب. البنوك تقارن على ROE والودائع، والصناعة على الهوامش."
                    : "Compares companies strictly within their peer universe. Banks are compared on ROE and BVPS; real estate on inventory and margins."}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card transition-all duration-200 hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 mb-2">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base font-bold">
                    {ar ? "ذكاء اصطناعي موثق" : "Grounded AI Synthesis"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground leading-relaxed">
                  {ar
                    ? "توليد تقارير مالية نوعية تستند حصرياً إلى القيم المعتمدة في قاعدة البيانات، بدون اختلاق أرقام أو توصيات مضللة."
                    : "Generates qualitative investor profiles grounded exclusively in database-verified metrics without fabricated numbers."}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Popular Scanner Strategies */}
        <section className="py-16 md:py-20 bg-muted/15 border-b border-border/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {ar ? "استراتيجيات المسح الجاهزة" : "Popular Pre-Built Scanner Strategies"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {ar ? "شغّل استراتيجيات استثمارية مثبتة بنقرة واحدة واحصل على قائمة الشركات المطابقة" : "Execute institutional financial screens with one click and see full explanation trails"}
                </p>
              </div>
              <Link href="/dashboard#/scanners">
                <Button className="btn-primary gap-1 text-xs">
                  {ar ? "استعراض كل الماسحات" : "Browse all scanners"}
                  <ArrowRight className="h-3.5 w-3.5 rtl-flip" />
                </Button>
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {strategyPresets.map((strat, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border/70 bg-card p-5 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary text-[10px] font-bold">
                        {strat.tag}
                      </Badge>
                      <span className="text-[10px] font-medium text-muted-foreground">FY & TTM</span>
                    </div>
                    <h3 className="text-base font-bold text-foreground">{strat.title}</h3>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{strat.desc}</p>
                  </div>
                  <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{ar ? "تفسير مفصل لكل شرط" : "With proof panel"}</span>
                    <Link href={`/dashboard#/scanners`}>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-primary font-semibold gap-1 p-0 hover:bg-transparent">
                        {ar ? "تشغيل الآن" : "Run scan"}
                        <ArrowRight className="h-3 w-3 rtl-flip" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Banner */}
        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8 md:p-12 text-center shadow-lg">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-4 shadow-md shadow-primary/25">
                <Crown className="h-6 w-6" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {ar ? "ابدأ فحص أسهم البورصة المصرية الآن" : "Take Command of Egyptian Market Fundamentals"}
              </h2>
              <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
                {ar
                  ? "تصفح القوائم المالية والمؤشرات والماسحات مجاناً بالكامل. قم بالترقية لفتح تحليلات الذكاء الاصطناعي والتنبيهات الحية."
                  : "Explore comprehensive financial statements and scanner discovery free. Upgrade to Premium for grounded AI analysis and custom screening."}
              </p>
              <div className="mt-8 flex flex-wrap justify-center items-center gap-3">
                <Link href="/dashboard">
                  <Button size="lg" className="h-11 px-6 btn-primary font-semibold text-sm">
                    {ar ? "فتح لوحة التحكم" : "Launch Dashboard"}
                    <ArrowRight className="h-4 w-4 rtl-flip" />
                  </Button>
                </Link>
                <Link href="/premium">
                  <Button size="lg" variant="outline" className="h-11 px-5 text-sm border-border/80">
                    <Crown className="h-4 w-4 text-amber-500" />
                    {ar ? "عرض باقات Premium" : "View Premium Plans"}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  )
}
