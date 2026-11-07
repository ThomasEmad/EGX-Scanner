"use client"

import Link from "next/link"
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
  Clock,
  BookOpen,
  Zap,
  BarChart3,
  Users,
  GraduationCap,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { useQuery } from "@tanstack/react-query"
import { useI18n } from "@/lib/i18n"
import { api } from "@/lib/client/api"
import { formatEgp } from "@/lib/financial/units"
import { sectorLabel } from "@/lib/sectors"

export default function LandingClient() {
  const { t, lang } = useI18n()
  const ar = lang === "ar"

  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard,
    staleTime: 120_000,
  })

  // Featured companies are live: top of the active universe by current
  // price × shares outstanding. The old version hard-coded six names and even
  // included a company (MOPCO) that is inactive in the database.
  const {
    data: featuredData,
    isLoading: featuredLoading,
    isError: featuredError,
  } = useQuery({
    queryKey: ["featured-companies"],
    queryFn: () => api.companies({ sort: "marketCap", pageSize: 8 }),
    staleTime: 120_000,
  })
  const featured = featuredData?.companies ?? []
  const scannerCards = dashboardData?.scannerCards ?? []

  // Never substitute invented numbers when the stats API is unavailable — the
  // UI renders "—" instead, so a failed fetch can never look like real data.
  const stats = dashboardData?.stats ?? null

  const howItWorks = [
    {
      step: "1",
      title: ar ? "اختر ماسحاً مالياً" : "Pick a financial screen",
      desc: ar ? "من الماسحات الجاهزة ( Turnaround، ROE قوي، قيمة منخفضة) أو أنشئ ماسحك الخاص بأي مؤشر." : "Choose from ready-made screens (turnaround, strong ROE, deep value) or build your own with any metric.",
      icon: <ScanSearch className="h-5 w-5" />,
    },
    {
      step: "2",
      title: ar ? "شاهد الشركات المطابقة" : "See matching companies",
      desc: ar ? "قائمة فورية بالشركات التي تحقق الشرط، مع تفسير مفصل لكل شرط." : "Instant list of matching companies with a per-condition explanation.",
      icon: <Users className="h-5 w-5" />,
    },
    {
      step: "3",
      title: ar ? "حلل واتخذ قرار" : "Analyze and decide",
      desc: ar ? "افتح صفحة الشركة للقوائم المالية، الأحداث المكتشفة، ومقارنة القطاع مع تحليل ذكي موثق." : "Open company page for financials, detected events, sector comparison, and grounded AI analysis.",
      icon: <BarChart3 className="h-5 w-5" />,
    },
  ]

  const faqs = [
    {
      q: ar ? "هل البيانات حقيقية أم تقديرية؟" : "Is the data real or estimated?",
      a: ar
        ? "كل رقم يخضع لفحص الفترة والهوية المحاسبية والمقياس قبل دخوله التحليلات. القيم المشتقة موسومة بوضوح، والقيم غير المتاحة تظهر «—» ولا تُقدَّر أو تُخترع."
        : "Every figure is checked for period, accounting identity and scale before it enters analytics. Derived values are labelled as derived, and unavailable values show “—” — they are never estimated or invented.",
    },
    {
      q: ar ? "ما الفرق بين النسخة المجانية والمميزة؟" : "What is the difference between Free and Premium?",
      a: ar
        ? "النسخة المجانية تتيح تصفح الشركات، القوائم المالية، الترتيب العام، والمقارنات. النسخة المميزة تضيف التحليل بالذكاء الاصطناعي، الماسحات المخصصة، التنبيهات على الأحداث المكتشفة، وتصدير البيانات."
        : "Free includes company browsing, financial statements, public rankings, and comparisons. Premium adds AI-assisted analysis, custom scanners, alerts on detected events, and data export.",
    },
    {
      q: ar ? "كيف يمكنني التأكد من صحة الميزانية؟" : "How can I verify balance sheet accuracy?",
      a: ar
        ? "تُشغّل المنصة فحوصاً محاسبية تلقائية (مثل هوية PBT − الضريبة ≈ صافي الربح) وتُظهر حالة كل قيمة: صالحة، تحتاج مراجعة، أو معزولة. لا يُعرض أي رقم غير متحقق كحقيقة."
        : "The platform runs automated accounting checks (for example PBT − tax ≈ net profit) and exposes each value's state: valid, needs review, or quarantined. No unverified figure is presented as fact.",
    },
    {
      q: ar ? "هل يدعم الموقع اللغة العربية؟" : "Does the site support Arabic?",
      a: ar
        ? "نعم، الواجهة ثنائية اللغة (عربي وإنجليزي) مع دعم كامل لاتجاه RTL. أسماء الشركات والمصطلحات المالية معروضة باللغتين حيث تتوفر الترجمة الموثوقة."
        : "Yes — the interface is bilingual (Arabic/English) with full RTL support. Company names and financial terms are shown in both languages where a reliable translation exists.",
    },
  ]

  return (
    <LayoutShell flush>
      <div className="flex flex-1 flex-col bg-background selection:bg-primary/20 selection:text-primary">

        {/* Hero Section */}
        <section className="relative overflow-hidden py-16 md:py-28 border-b border-border/50">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
          <div className="absolute top-0 start-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <div className="absolute top-1/4 start-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-10 lg:grid-cols-[1fr_340px]">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary mb-8 backdrop-blur-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {ar ? "منصة استخبارات مالية مستقلة · البورصة المصرية EGX" : "Independent Financial Intelligence Platform · Egyptian Exchange"}
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl md:text-7xl font-extrabold tracking-tight text-balance leading-[1.1]">
                {ar ? (
                  <>
                    اكتشف فرص البورصة <br />
                    <span className="bg-gradient-to-r from-primary to-teal-500 bg-clip-text text-transparent">
                      بأرقام حقيقية من القوائم المنشورة
                    </span>
                  </>
                ) : (
                  <>
                    Discover EGX opportunities <br />
                    <span className="bg-gradient-to-r from-primary to-teal-500 bg-clip-text text-transparent">
                      built on real published financials
                    </span>
                  </>
                )}
              </h1>

              <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
                {ar
                  ? "ماسح ذكي لأنماط الشركات المالية: تحولات الخسارة إلى ربح، تسارع الإيرادات، خفض الديون، وتدفقات النقد — أرقام فعلية من القوائم المالية المنشورة (سنوي وربعي)، والقيم غير المنشورة تظهر «غير متاح» بدون أي تقديرات مخفية."
                  : "Institutional-grade pattern scanner: loss-to-profit turnarounds, revenue acceleration, deleveraging, and cash flows. Real figures from published quarterly and annual statements; unreported values are shown as unavailable — never silently estimated."}
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-3 md:gap-4">
                <Link href="/dashboard">
                  <Button size="lg" className="h-12 px-8 gap-2 btn-primary font-semibold text-sm shadow-md shadow-primary/25">
                    {ar ? "فتح المنصة والماسحات" : "Open Financial Terminal"}
                    <ArrowRight className="h-4 w-4 rtl-flip" />
                  </Button>
                </Link>
                <Link href="/dashboard#/custom">
                  <Button size="lg" variant="outline" className="h-12 px-6 gap-2 text-sm border-border/80 hover:bg-muted/60">
                    <ScanSearch className="h-4 w-4 text-primary" />
                    {ar ? "بناء ماسح مخصص" : "Build Custom Scanner"}
                  </Button>
                </Link>
                <Link href="/premium">
                  <Button size="lg" variant="ghost" className="h-12 px-5 gap-2 text-sm text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/5">
                    <Crown className="h-4 w-4" />
                    <span>Premium</span>
                  </Button>
                </Link>
              </div>

              {/* KPI Strip — shows "—" when the stats API is unavailable */}
              <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border/50 pt-8">
                <div className="rounded-xl border border-border/60 bg-card/80 p-3.5 backdrop-blur-xs hover:bg-card/100 transition-colors">
                  <div className="text-2xl sm:text-3xl font-extrabold tabular text-primary">
                    {stats ? stats.companies.toLocaleString() : "—"}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                    {ar ? "شركة مدرجة" : "Listed companies"}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/80 p-3.5 backdrop-blur-xs hover:bg-card/100 transition-colors">
                  <div className="text-2xl sm:text-3xl font-extrabold tabular text-foreground">
                    {stats ? stats.reports.toLocaleString() : "—"}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                    {ar ? "قائمة مالية" : "Financial reports"}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/80 p-3.5 backdrop-blur-xs hover:bg-card/100 transition-colors">
                  <div className="text-2xl sm:text-3xl font-extrabold tabular text-emerald-600 dark:text-emerald-400">
                    {stats ? stats.validValues.toLocaleString() : "—"}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                    {ar ? "نقطة بيانات مالية" : "Financial data points"}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/80 p-3.5 backdrop-blur-xs hover:bg-card/100 transition-colors">
                  <div className="text-2xl sm:text-3xl font-extrabold tabular text-teal-600 dark:text-teal-400">
                    {stats ? stats.events.toLocaleString() : "—"}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                    {ar ? "حدث مالي" : "Detected events"}
                  </div>
                </div>
              </div>
            </div>

            {/* Right rail — the market at a glance: largest listed companies
                with their latest recorded price and day change. Same verified
                snapshot data the terminal uses; renders "—" when unavailable. */}
            <div className="hidden lg:block">
              <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-lg shadow-black/[0.03] backdrop-blur-xs">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{ar ? "الأكبر بالقيمة السوقية" : "Largest listed companies"}</p>
                  <Link href="/companies" className="text-[11px] font-medium text-primary hover:underline">
                    {ar ? "الكل" : "View all"}
                  </Link>
                </div>
                <div className="space-y-1">
                  {featured.slice(0, 6).map((c) => (
                    <Link
                      key={c.id}
                      href={`/company/${c.ticker}`}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/40"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">
                        {c.ticker.slice(0, 4)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{c.ticker}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{(ar ? c.nameAr ?? c.nameEn : c.nameEn) ?? ""}</span>
                      </span>
                      <span className="text-end">
                        <span className="block text-sm font-bold tabular" dir="ltr">
                          {c.marketPrice?.price != null ? c.marketPrice.price.toFixed(2) : "—"}
                        </span>
                        <span
                          className={`block text-[10px] font-semibold tabular ${(c.marketPrice?.changePct ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                          dir="ltr"
                        >
                          {c.marketPrice?.changePct != null
                            ? `${c.marketPrice.changePct >= 0 ? "+" : ""}${c.marketPrice.changePct.toFixed(2)}%`
                            : "—"}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
                <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] text-muted-foreground">
                  {ar ? "آخر سعر مسجل · متأخر 15 دقيقة · ليس نصيحة استثمارية" : "Latest recorded price · 15-min delayed · not investment advice"}
                </p>
              </div>
            </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 md:py-24 border-b border-border/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
                {ar ? "آلية العمل" : "How it works"}
              </Badge>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {ar ? "من الفكرة إلى القرار في ثلاث خطوات" : "From idea to decision in three steps"}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {ar ? "لا أرقام مخترعة: كل قيمة إما مستخرجة من مصدر أو تظهر «—» عند عدم توفرها." : "No invented numbers — every value is either sourced or shown as “—” when unavailable."}
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              {howItWorks.map((step) => (
                <Card key={step.step} className="border-border/60 bg-card p-6 rounded-2xl transition-all hover:shadow-lg hover:border-primary/40">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                    {step.icon}
                  </div>
                  <h3 className="text-lg font-bold tracking-tight">{step.title}</h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Live EGX Leaders Showcase */}
        <section className="py-16 md:py-24 bg-muted/20 border-b border-border/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  {ar ? "شركات مختارة من البورصة المصرية" : "Featured Egyptian Exchange Companies"}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                  {ar ? "اضغط على أي شركة لاستعراض القوائم والمؤشرات والتحليل المباشر" : "Select any company to inspect balance sheets, ratios, and grounded AI analysis"}
                </p>
                {featuredData?.marketAsOf ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {ar ? "أسعار متأخرة 15 دقيقة · آخر تحديث: " : "15-minute-delayed prices · Updated: "}
                    {new Date(featuredData.marketAsOf).toLocaleString(ar ? "ar-EG" : "en-GB")}
                  </p>
                ) : null}
              </div>
              <Link href="/dashboard#/companies">
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  {ar ? "استعراض جميع الشركات" : "View all companies"}
                  <ArrowRight className="h-3.5 w-3.5 rtl-flip" />
                </Button>
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {featuredLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-[176px] animate-pulse rounded-2xl border border-border/60 bg-muted/30" />
                ))
              ) : featuredError || featured.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
                  {ar ? "تعذر تحميل بيانات الشركات الحية الآن." : "Live company data is temporarily unavailable."}{" "}
                  <Link href="/dashboard#/companies" className="text-primary hover:underline">
                    {ar ? "استعراض القائمة الكاملة" : "Browse the full list"}
                  </Link>
                </div>
              ) : (
                featured.map((c) => {
                  const change = c.marketPrice?.changePct ?? null
                  const positive = (change ?? 0) >= 0
                  const latestFy =
                    c.snapshot?.net_profit?.fiscalYear ??
                    c.snapshot?.revenue?.fiscalYear ??
                    null
                  return (
                    <Link
                      key={c.ticker}
                      href={`/company/${c.ticker}`}
                      className="group rounded-2xl border border-border/60 bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-primary/50"
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                            {c.ticker}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold group-hover:text-primary transition-colors">
                              {ar ? (c.nameAr ?? c.nameEn) : c.nameEn}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {sectorLabel(c.sector, lang)}
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-[10px] font-semibold">
                          {c.marketPrice ? "EGP" : "—"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/40 bg-muted/20 p-2.5">
                        <div>
                          <div className="text-[10px] text-muted-foreground">{ar ? "السعر" : "Price"}</div>
                          <div className="text-sm font-bold tabular">
                            {c.marketPrice ? `${c.marketPrice.price.toFixed(2)}` : "—"}
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="text-[10px] text-muted-foreground">{ar ? "التغير اليومي" : "1D change"}</div>
                          <div className={`text-sm font-bold tabular ${positive ? "text-positive" : "text-negative"}`}>
                            {change === null ? "—" : `${positive ? "+" : ""}${change.toFixed(2)}%`}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-3 border-t border-border/40">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3 text-emerald-500" />
                          {latestFy ? `${ar ? "آخر سنة مالية" : "Latest FY"} ${latestFy}` : (ar ? "بيانات متحققة" : "Verified data")}
                        </span>
                        <span className="flex items-center gap-0.5 text-primary font-medium group-hover:translate-x-0.5 rtl-flip transition-transform">
                          {ar ? "فتح الملف" : "Inspect"}
                          <ArrowUpRight className="h-3 w-3" />
                        </span>
                      </div>
                      <div className="mt-1.5 text-[10px] text-muted-foreground">
                        {ar ? "القيمة السوقية: " : "Market cap: "}
                        {c.marketCap ? formatEgp(c.marketCap) : "—"}
                      </div>
                    </Link>
                  )
                })
              )}
            </div>
          </div>
        </section>

        {/* 4 Pillars of Institutional Trust */}
        <section className="py-16 md:py-24 border-b border-border/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
                {ar ? "معايير النزاهة المؤسسية" : "Institutional Integrity"}
              </Badge>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {ar ? "لماذا يعتمد المستثمرون على Meza؟" : "Engineered for Serious Financial Research"}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {ar ? "بنيت المنصة بأعلى معايير الدقة والشفافية لإلغاء التقديرات غير المؤكدة وتقديم أرقام يمكنك الاعتماد عليها." : "Built from first principles to eliminate hallucinations, enforce accounting identities, and deliver decision-grade data."}
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border/60 bg-card p-6 rounded-2xl transition-all hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <ScanSearch className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold tracking-tight">{ar ? "ماسح أنماط مالي" : "Deterministic Scanner"}</h3>
                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  {ar ? "قواعد منطقية صريحة تفحص تحولات الأرباح، الرفع المالي، وجودة التدفق النقدي مع تفسير مفصل لكل شرط مطابق." : "Explicit Boolean logic testing profit transitions, debt changes, and cash quality with step-by-step condition auditing."}
                </p>
              </Card>

              <Card className="border-border/60 bg-card p-6 rounded-2xl transition-all hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-4">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold tracking-tight">{ar ? "أرقام فعلية بدون تعويض" : "Real Figures, No Filler"}</h3>
                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  {ar
                    ? "البيانات مأخوذة من القوائم المالية المنشورة للشركات، وتمر بفحوص منطقية (توازن الميزانية وتماسك الفترات) قبل دخولها التحليلات. ما لم يُنشر يظهر «غير متاح» — لا نعوّضه بتقديرات مخفية."
                    : "Data comes from companies' published financial statements and passes logical checks (balance-sheet identity and period coherence) before entering analytics. Unreported values appear as unavailable — never silently estimated."}
                </p>
              </Card>

              <Card className="border-border/60 bg-card p-6 rounded-2xl transition-all hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 mb-4">
                  <Scale className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold tracking-tight">{ar ? "مقارنة قطاعية منضبطة" : "Strict Sector Benchmarking"}</h3>
                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  {ar ? "مقارنة الشركات داخل قطاعها فقط لتفادي تشويه النسب. البنوك تقارن على ROE والودائع، والصناعة على الهوامش." : "Compares companies strictly within their peer universe. Banks on ROE/BVPS; real estate on inventory and margins."}
                </p>
              </Card>

              <Card className="border-border/60 bg-card p-6 rounded-2xl transition-all hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 mb-4">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold tracking-tight">{ar ? "ذكاء اصطناعي موثق" : "Grounded AI Synthesis"}</h3>
                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  {ar ? "توليد تقارير مالية نوعية تستند حصرياً إلى الأرقام المتاحة في قاعدة البيانات، بدون اختلاق أرقام." : "Generates qualitative investor profiles grounded exclusively in the platform's database figures without fabricated numbers."}
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Popular Scanner Strategies */}
        <section className="py-16 md:py-24 bg-muted/15 border-b border-border/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {ar ? "استراتيجيات المسح الجاهزة" : "Popular Pre-Built Scanner Strategies"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {ar ? "شغّل ماسحات مالية صريحة بنقرة واحدة واطّلع على تفسير كل شرط مطابق" : "Run explicit financial screens with one click and inspect the proof for every matched condition"}
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
              {!dashboardData ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[210px] animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
                ))
              ) : scannerCards.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
                  {ar ? "لا توجد ماسحات جاهزة نشطة حالياً." : "No active pre-built screens are available right now."}{" "}
                  <Link href="/dashboard#/custom" className="text-primary hover:underline">
                    {ar ? "أنشئ ماسحك الخاص" : "Build a custom screen"}
                  </Link>
                </div>
              ) : (
                scannerCards.slice(0, 3).map((card) => {
                  const presetHref = card.presetKey
                    ? `/dashboard?preset=${encodeURIComponent(card.presetKey)}#/scanners`
                    : "/dashboard#/scanners"
                  return (
                    <div
                      key={card.id}
                      className="rounded-2xl border border-border/70 bg-card p-5 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary text-[10px] font-bold">
                            {card.presetKey ?? "Preset"}
                          </Badge>
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {card.count} {ar ? "شركة مطابقة" : "matches"}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-foreground">
                          {ar ? (card.nameAr ?? card.name) : card.name}
                        </h3>
                        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                          {card.description ?? (ar ? "ماسح مالي جاهز مع تفسير لكل شرط." : "A pre-built financial screen with per-condition proof.")}
                        </p>
                        {card.topMatches.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {card.topMatches.slice(0, 3).map((match) => (
                              <Link
                                key={match.companyId}
                                href={`/company/${match.ticker}`}
                                className="rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-foreground hover:border-primary/40 hover:text-primary"
                              >
                                {match.ticker}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">
                          {ar ? "تفسير مفصل لكل شرط" : "With proof panel"}
                        </span>
                        <Link href={presetHref}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-primary font-semibold gap-1 p-0 hover:bg-transparent">
                            {ar ? "تشغيل الآن" : "Run scan"}
                            <ArrowRight className="h-3 w-3 rtl-flip" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 md:py-24 border-b border-border/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
                {ar ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
              </Badge>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {ar ? "أي استفسار لديك؟" : "Any questions?"}
              </h2>
            </div>

            <div className="max-w-3xl mx-auto space-y-3">
              {faqs.map((faq, i) => (
                <Card key={i} className="border-border/60 bg-card p-5 rounded-xl">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">{faq.q}</h3>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary/50" aria-hidden />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Banner */}
        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8 md:p-16 text-center shadow-lg">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-6 shadow-md shadow-primary/25">
                <Crown className="h-6 w-6" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {ar ? "ابدأ فحص أسهم البورصة المصرية الآن" : "Take Command of Egyptian Market Fundamentals"}
              </h2>
              <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
                {ar
                  ? "تصفح القوائم المالية والمؤشرات والماسحات مجاناً بالكامل. قم بالترقية لفتح تحليلات الذكاء الاصطناعي والتنبيهات الحية."
                  : "Explore comprehensive financial statements and scanner discovery free. Upgrade to Premium for grounded AI analysis and custom screening."}
              </p>
              <div className="mt-10 flex flex-wrap justify-center items-center gap-3">
                <Link href="/dashboard">
                  <Button size="lg" className="h-11 px-8 btn-primary font-semibold text-sm">
                    {ar ? "فتح لوحة التحكم" : "Launch Dashboard"}
                    <ArrowRight className="h-4 w-4 rtl-flip" />
                  </Button>
                </Link>
                <Link href="/premium">
                  <Button size="lg" variant="outline" className="h-11 px-6 text-sm border-border/80">
                    <Crown className="h-4 w-4 text-amber-500" />
                    {ar ? "عرض باقات Premium" : "View Premium Plans"}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

    </LayoutShell>
  )
}
