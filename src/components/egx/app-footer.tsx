"use client"

import Link from "next/link"
import { Activity } from "lucide-react"
import { useI18n } from "@/lib/i18n"

export function AppFooter() {
  const { t, lang } = useI18n()
  const ar = lang === "ar"

  const links: Array<[string, string, string]> = [
    ["/companies", ar ? "الشركات" : "Companies", ar ? "دليل شركات البورصة" : "Company directory"],
    ["/rankings", ar ? "الترتيب" : "Rankings", ar ? "ترتيب الشركات" : "Company rankings"],
    ["/sectors", ar ? "القطاعات" : "Sectors", ar ? "قطاعات البورصة" : "EGX sectors"],
    ["/undervalued", ar ? "فرص التقييم" : "Valuation", ar ? "أسهم دون قيمتها" : "Undervalued"],
    ["/about", ar ? "من نحن" : "About", ar ? "عن المنصة" : "About us"],
    ["/disclaimer", ar ? "إخلاء المسؤولية" : "Disclaimer", ar ? "تنبيه المخاطر" : "Risk notice"],
    ["/terms", ar ? "الشروط" : "Terms", ar ? "شروط الخدمة" : "Terms of service"],
    ["/privacy", ar ? "الخصوصية" : "Privacy", ar ? "سياسة الخصوصية" : "Privacy policy"],
    ["/status", ar ? "حالة المنصة" : "Status", ar ? "ال uptime وحداثة البيانات" : "Uptime & data freshness"],
  ]

  return (
    <footer className="mt-auto border-t border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/95">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Activity className="h-3.5 w-3.5" />
            </div>
            <span className="font-bold tracking-tight text-foreground">EGX Scanner</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{ar ? "حقوق الطبع والنشر" : "©"}</span>
            <span>{new Date().getFullYear()} EGX Scanner</span>
          </div>
        </div>

        <nav aria-label={ar ? "روابط الموقع" : "Site links"} className="flex flex-wrap gap-x-6 gap-y-3 text-xs mb-6">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="text-muted-foreground hover:text-primary transition-colors">
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border/40 pt-6">
          <p className="text-xs leading-relaxed text-muted-foreground">{t("ft.disclaimer")}</p>
          <p className="mt-2 text-[11px] text-muted-foreground/70">{t("ft.demoNotice")}</p>
        </div>
      </div>
    </footer>
  )
}
