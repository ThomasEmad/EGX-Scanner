"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Building2, ScanSearch, CalendarDays, ShieldCheck } from "lucide-react"
import { useI18n } from "@/lib/i18n"

const MOBILE_NAV: { href: string; label: string; labelAr: string; icon: React.ReactNode }[] = [
  { href: "/", label: "Home", labelAr: "الرئيسية", icon: <Activity className="h-5 w-5" /> },
  { href: "/companies", label: "Companies", labelAr: "الشركات", icon: <Building2 className="h-5 w-5" /> },
  { href: "/sectors", label: "Sectors", labelAr: "القطاعات", icon: <ScanSearch className="h-5 w-5" /> },
  { href: "/dividends", label: "Dividends", labelAr: "التوزيعات", icon: <CalendarDays className="h-5 w-5" /> },
  { href: "/watchlist", label: "Watchlist", labelAr: "قائمة المتابعة", icon: <ShieldCheck className="h-5 w-5" /> },
]

export function MobileBottomNav() {
  const { lang } = useI18n()
  const pathname = usePathname()
  const ar = lang === "ar"

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      aria-label="Bottom navigation"
    >
      {MOBILE_NAV.map((item) => {
        const active = pathname === item.href || (item.href === "/" && (pathname === "/" || pathname === "/dashboard"))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-1 px-2 text-xs transition-colors ${
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {item.icon}
            <span className="font-medium">{ar ? item.labelAr : item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
