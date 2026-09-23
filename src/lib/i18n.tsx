"use client"

// Lightweight bilingual i18n (EN / AR) with RTL support.
// Financial terminology kept clear and professional in both languages.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

export type Lang = "en" | "ar"

const dict = {
  // nav
  "nav.dashboard": { en: "Dashboard", ar: "لوحة القيادة" },
  "nav.scanners": { en: "Scanners", ar: "الماسحات" },
  "nav.customScanner": { en: "Custom Scanner", ar: "ماسح مخصص" },
  "nav.companies": { en: "Companies", ar: "الشركات" },
  "nav.dividends": { en: "Dividends", ar: "التوزيعات" },
  "nav.reports": { en: "Reports & Review", ar: "التقارير والمراجعة" },
  "nav.methodology": { en: "Methodology", ar: "المنهجية" },
  // common
  "common.run": { en: "Run", ar: "تشغيل" },
  "common.save": { en: "Save", ar: "حفظ" },
  "common.cancel": { en: "Cancel", ar: "إلغاء" },
  "common.delete": { en: "Delete", ar: "حذف" },
  "common.search": { en: "Search", ar: "بحث" },
  "common.page": { en: "Page", ar: "صفحة" },
  "common.of": { en: "of", ar: "من" },
  "common.loading": { en: "Loading…", ar: "جارٍ التحميل…" },
  "common.noData": { en: "No data available", ar: "لا توجد بيانات" },
  "common.back": { en: "Back", ar: "رجوع" },
  "common.close": { en: "Close", ar: "إغلاق" },
  "common.viewWhy": { en: "Why matched?", ar: "لماذا طابقت؟" },
  "common.matched": { en: "Matched", ar: "مطابقة" },
  "common.notMatched": { en: "Not matched", ar: "غير مطابقة" },
  "common.period": { en: "Period", ar: "الفترة" },
  "common.status": { en: "Status", ar: "الحالة" },
  "common.details": { en: "Details", ar: "التفاصيل" },
  "common.demoData": { en: "DEMO DATA", ar: "بيانات تجريبية" },
  "common.egp": { en: "EGP", ar: "ج.م" },
  // dashboard
  "dash.title": { en: "EGX Financial Scanner", ar: "ماسح البيانات المالية للبورصة المصرية" },
  "dash.subtitle": {
    en: "Discover Egyptian Exchange companies by financial conditions and changes over time — with a factual explanation for every match.",
    ar: "اكتشف شركات البورصة المصرية بناءً على الأوضاع المالية وتغيراتها عبر الزمن — مع تفسير واقعي لكل مطابقة.",
  },
  "dash.companiesTracked": { en: "Companies tracked", ar: "شركات متابعة" },
  "dash.validatedValues": { en: "Validated financial values", ar: "قيم مالية موثقة" },
  "dash.eventsDetected": { en: "Events detected", ar: "أحداث مالية مكتشفة" },
  "dash.upcomingDividends": { en: "Upcoming dividends", ar: "توزيعات قادمة" },
  "dash.scannerDiscovery": { en: "Scanner discovery", ar: "الاكتشاف بالماسحات" },
  "dash.scannerDiscoverySub": { en: "Latest annual results — click a scanner to see who matches and why.", ar: "نتائج أحدث سنة مالية — اضغط على ماسح لعرض المطابقات وسببها." },
  "dash.recentEvents": { en: "Recently detected events", ar: "أحدث الأحداث المكتشفة" },
  "dash.dividendCalendar": { en: "Dividend calendar", ar: "تقويم التوزيعات" },
  "dash.viewAll": { en: "View all", ar: "عرض الكل" },
  "dash.pendingReview": { en: "Items awaiting review", ar: "عناصر بانتظار المراجعة" },
  // scanners
  "sc.basis": { en: "Comparison basis", ar: "أساس المقارنة" },
  "sc.basisAnnual": { en: "Latest annual (FY vs FY)", ar: "أحدث سنة مالية" },
  "sc.basisQuarterly": { en: "Latest quarter (YoY)", ar: "أحدث ربع سنوي" },
  "sc.presets": { en: "Preset scanners", ar: "ماسحات جاهزة" },
  "sc.customRules": { en: "Custom rules", ar: "قواعد مخصصة" },
  "sc.runScanner": { en: "Run scanner", ar: "تشغيل الماسح" },
  "sc.whyMatched": { en: "Why did this company match?", ar: "لماذا طابقت هذه الشركة؟" },
  "sc.whyNotMatched": { en: "Why did it not match?", ar: "لماذا لم تطابق؟" },
  "sc.condition": { en: "Condition", ar: "الشرط" },
  "sc.actual": { en: "Actual", ar: "الفعلي" },
  "sc.threshold": { en: "Threshold", ar: "الحد" },
  "sc.dataUnavailable": { en: "Data unavailable — not treated as zero", ar: "البيانات غير متوفرة — لا تعتبر صفراً" },
  "sc.availability": { en: "Companies with data", ar: "شركات لديها بيانات" },
  "sc.saveRule": { en: "Save rule", ar: "حفظ القاعدة" },
  "sc.ruleName": { en: "Rule name", ar: "اسم القاعدة" },
  "sc.addCondition": { en: "Add condition", ar: "إضافة شرط" },
  "sc.metric": { en: "Metric", ar: "المؤشر" },
  "sc.event": { en: "Financial event", ar: "حدث مالي" },
  "sc.dividend": { en: "Dividend status", ar: "حالة التوزيعات" },
  "sc.operator": { en: "Operator", ar: "المعامل" },
  "sc.value": { en: "Value", ar: "القيمة" },
  "sc.eventType": { en: "Event type", ar: "نوع الحدث" },
  "sc.noResults": { en: "Run a scanner to see results.", ar: "شغّل ماسحاً لعرض النتائج." },
  "sc.matchingCompanies": { en: "Matching companies", ar: "الشركات المطابقة" },
  "sc.allCompanies": { en: "All companies", ar: "جميع الشركات" },
  "sc.contextPeriod": { en: "Evaluated period", ar: "الفترة المُقيَّمة" },
  // companies
  "co.searchPlaceholder": { en: "Search by name or ticker…", ar: "ابحث بالاسم أو الرمز…" },
  "co.allSectors": { en: "All sectors", ar: "كل القطاعات" },
  "co.sector": { en: "Sector", ar: "القطاع" },
  "co.revenue": { en: "Revenue", ar: "الإيرادات" },
  "co.netProfit": { en: "Net profit", ar: "صافي الربح" },
  "co.roe": { en: "ROE", ar: "العائد على حقوق الملكية" },
  "co.assets": { en: "Total assets", ar: "إجمالي الأصول" },
  "co.reports": { en: "Reports", ar: "التقارير" },
  "co.events": { en: "Events", ar: "الأحداث" },
  "co.profile": { en: "Company profile", ar: "ملف الشركة" },
  "co.statements": { en: "Statements", ar: "القوائم المالية" },
  "co.growth": { en: "Growth & ratios", ar: "النمو والنسب" },
  "co.dividends": { en: "Dividends", ar: "التوزيعات" },
  "co.matchedScanners": { en: "Scanner matches", ar: "مطابقات الماسحات" },
  "co.incomeStatement": { en: "Income statement", ar: "قائمة الدخل" },
  "co.balanceSheet": { en: "Balance sheet", ar: "قائمة المركز المالي" },
  "co.cashFlow": { en: "Cash flow", ar: "قائمة التدفقات النقدية" },
  "co.keyMetrics": { en: "Key metrics", ar: "المؤشرات الرئيسية" },
  "co.source": { en: "Source", ar: "المصدر" },
  "co.originalLabel": { en: "Original label", ar: "التسمية الأصلية" },
  "co.confidence": { en: "Confidence", ar: "الثقة" },
  "co.page": { en: "Page", ar: "صفحة" },
  "co.extraction": { en: "Extraction", ar: "الاستخراج" },
  "co.validation": { en: "Validation", ar: "التحقق" },
  "co.fileHash": { en: "File hash (SHA-256)", ar: "بصمة الملف" },
  "co.version": { en: "Version", ar: "الإصدار" },
  "co.noDividends": { en: "No dividend records for this company.", ar: "لا توجد سجلات توزيعات لهذه الشركة." },
  "co.noEvents": { en: "No financial events detected.", ar: "لم يتم اكتشاف أحداث مالية." },
  "co.values": { en: "values", ar: "قيمة" },
  "co.shares": { en: "Shares outstanding", ar: "عدد الأسهم" },
  // dividends
  "dv.announcement": { en: "Announcement", ar: "الإعلان" },
  "dv.eligibility": { en: "Eligibility", ar: "الاستحقاق" },
  "dv.exDate": { en: "Ex-dividend", ar: "تاريخ السابق" },
  "dv.distribution": { en: "Distribution", ar: "الصرف" },
  "dv.dps": { en: "Per share", ar: "للسهم" },
  "dv.notAnnounced": { en: "Not officially announced", ar: "لم يُعلن رسمياً" },
  "dv.filterAll": { en: "All statuses", ar: "كل الحالات" },
  // reports
  "rp.uploadTitle": { en: "Upload a financial report", ar: "رفع تقرير مالي" },
  "rp.uploadSub": {
    en: "Pipeline: checksum → duplicate check → extraction → normalization → validation → review. Only admins can upload.",
    ar: "خط المعالجة: البصمة → فحص التكرار → الاستخراج → التوحيد → التحقق → المراجعة. الرفع للمشرفين فقط.",
  },
  "rp.file": { en: "Document (CSV / text / PDF)", ar: "المستند (CSV / نص / PDF)" },
  "rp.reportType": { en: "Report type", ar: "نوع التقرير" },
  "rp.fiscalYear": { en: "Fiscal year", ar: "السنة المالية" },
  "rp.periodLabel": { en: "Period label (e.g. Q3 2025)", ar: "تسمية الفترة (مثل Q3 2025)" },
  "rp.periodStart": { en: "Period start", ar: "بداية الفترة" },
  "rp.periodEnd": { en: "Period end", ar: "نهاية الفترة" },
  "rp.sourceName": { en: "Source name", ar: "اسم المصدر" },
  "rp.upload": { en: "Upload", ar: "رفع" },
  "rp.process": { en: "Process", ar: "معالجة" },
  "rp.approve": { en: "Approve", ar: "اعتماد" },
  "rp.reviewQueue": { en: "Human review queue", ar: "قائمة المراجعة البشرية" },
  "rp.pendingValues": { en: "Values needing review", ar: "قيم تحتاج مراجعة" },
  "rp.pendingReports": { en: "Reports to process", ar: "تقارير待 المعالجة" },
  "rp.editValue": { en: "Edit & correct", ar: "تعديل وتصحيح" },
  "rp.reject": { en: "Reject", ar: "رفض" },
  "rp.approveValue": { en: "Approve as-is", ar: "اعتماد كما هو" },
  "rp.auditLog": { en: "Audit trail", ar: "سجل التدقيق" },
  "rp.duplicate": { en: "Duplicate detected", ar: "تم اكتشاف تكرار" },
  "rp.adminLogin": { en: "Admin access", ar: "دخول المشرف" },
  "rp.passcode": { en: "Admin passcode", ar: "رمز المشرف" },
  "rp.unlock": { en: "Unlock", ar: "فتح" },
  "rp.lock": { en: "Lock admin", ar: "قفل" },
  "rp.uploadedFiles": { en: "Uploaded reports", ar: "التقارير المرفوعة" },
  "rp.processing": { en: "Processing…", ar: "جارٍ المعالجة…" },
  "rp.hintCsv": { en: "CSV format: label, value, unit — e.g. “Revenue, 1234.5, MILLION”. Arabic labels are recognized too.", ar: "صيغة CSV: التسمية، القيمة، الوحدة — مثال: «الإيرادات، 1234.5، MILLION». تُدرك التسميات العربية أيضاً." },
  // methodology
  "md.title": { en: "Methodology & data integrity", ar: "المنهجية ونزاهة البيانات" },
  "md.body": {
    en: "Every financial value keeps its original label, unit, source and validation status. Derived metrics are stored separately with a formula version. Missing data is never treated as zero. Sign transitions (loss→profit, profit→loss) are detected as events rather than misleading percentages. Market-dependent ratios (P/B, P/E) report DATA_UNAVAILABLE until market price data is connected. Scanner results are factual financial conditions — never investment advice.",
    ar: "تحتفظ كل قيمة مالية بتسميتها الأصلية ووحدتها ومصدرها وحالة تحققها. تُخزن المؤشرات المشتقة منفصلة مع إصدار المعادلة. لا تُعامل البيانات المفقودة كصفر أبداً. تُكتشف التحولات السلبية/الإيجابية كأحداث بدلاً من نسب مضللة. تقارير النسب السوقية تظهر «بيانات غير متوفرة» حتى ربط بيانات الأسعار. نتائج الماسحات أوضاع مالية واقعية — وليست توصية استثمارية.",
  },
  // watchlist
  "watchlist.add": { en: "Add to watchlist", ar: "أضف إلى قائمة المتابعة" },
  "watchlist.remove": { en: "Remove from watchlist", ar: "إزالة من قائمة المتابعة" },
  "watchlist.title": { en: "Watchlist", ar: "قائمة المتابعة" },
  "watchlist.only": { en: "Watchlist only", ar: "قائمة المتابعة فقط" },
  "watchlist.empty": { en: "Star companies to build your watchlist.", ar: "ميّز الشركات بنجمة لبناء قائمة المتابعة." },
  // peers
  "peers.tab": { en: "Peers", ar: "المقارنة بالأقران" },
  "peers.title": { en: "Sector peer comparison", ar: "مقارنة مع شركات القطاع" },
  "peers.median": { en: "Sector median", ar: "وسيط القطاع" },
  "peers.you": { en: "This company", ar: "هذه الشركة" },
  "peers.basis": { en: "Comparison basis", ar: "أساس المقارنة" },
  "peers.noData": { en: "No peer data for this period.", ar: "لا توجد بيانات أقران لهذه الفترة." },
  "peers.roe": { en: "ROE", ar: "العائد على حقوق الملكية" },
  "peers.net_margin": { en: "Net margin", ar: "هامش صافي الربح" },
  "peers.revenue_growth": { en: "Revenue growth", ar: "نمو الإيرادات" },
  "peers.debt_to_equity": { en: "Debt / Equity", ar: "الدين إلى حقوق الملكية" },
  "peers.net_profit": { en: "Net profit", ar: "صافي الربح" },
  // run history
  "rh.title": { en: "Recent scanner runs", ar: "آخر عمليات المسح" },
  "rh.empty": { en: "No scanner runs yet.", ar: "لا توجد عمليات مسح بعد." },
  "rh.matches": { en: "matches", ar: "مطابقة" },
  // reports
  "rp.download": { en: "Download source", ar: "تنزيل المستند" },
  // disclaimer
  "ft.disclaimer": {
    en: "Educational / informational tool. Reports factual financial conditions with explanations. Not investment advice — no BUY/SELL recommendations are generated.",
    ar: "أداة تعليمية / معلوماتية. تعرض أوضاع مالية واقعية مع التفسير. ليست نصيحة استثمارية — لا يتم توليد توصيات شراء أو بيع.",
  },
  "ft.demoNotice": {
    en: "All companies and figures in this environment are clearly-labeled synthetic DEMO DATA — not real EGX filings.",
    ar: "جميع الشركات والأرقام في هذه البيئة بيانات تجريبية اصطناعية موسومة بوضوح — وليست إفصاحات حقيقية من البورصة المصرية.",
  },
} as const

export type DictKey = keyof typeof dict

interface I18nCtx {
  lang: Lang
  dir: "ltr" | "rtl"
  setLang: (l: Lang) => void
  t: (key: DictKey) => string
  pick: (en: string | null | undefined, ar: string | null | undefined) => string
}

const Ctx = createContext<I18nCtx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en")

  // Restore saved language after mount (async to avoid cascading renders;
  // document dir/lang is synchronized in the effect below)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const saved = localStorage.getItem("egx-lang") as Lang | null
      if (saved === "ar" || saved === "en") setLangState(saved)
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem("egx-lang", l)
  }, [])

  const t = useCallback((key: DictKey) => dict[key]?.[lang] ?? String(key), [lang])

  const pick = useCallback(
    (en: string | null | undefined, ar: string | null | undefined) => {
      if (lang === "ar") return ar || en || "—"
      return en || ar || "—"
    },
    [lang]
  )

  return <Ctx.Provider value={{ lang, dir: lang === "ar" ? "rtl" : "ltr", setLang, t, pick }}>{children}</Ctx.Provider>
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider")
  return ctx
}
