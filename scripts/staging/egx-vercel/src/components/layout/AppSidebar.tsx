"use client"

// Desktop sidebar (sm+): brand + primary navigation, rendered on the inline
// start side so it flips to the right automatically under RTL (the html dir
// is synchronized by the i18n provider).
// Mobile (<sm) keeps its own top bar + bottom navigation.

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  Briefcase,
  Building2,
  CalendarDays,
  Crown,
  LayoutDashboard,
  Scale,
  Shield,
  ShieldCheck,
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  label: string
  labelAr: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
}

interface NavSection {
  label: string
  labelAr: string
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  {
    label: "Platform",
    labelAr: "المنصة",
    items: [
      { href: "/dashboard", label: "Dashboard", labelAr: "لوحة القيادة", icon: LayoutDashboard },
      { href: "/companies", label: "Companies", labelAr: "الشركات", icon: Building2 },
      { href: "/sectors", label: "Sectors", labelAr: "القطاعات", icon: Shield },
      { href: "/compare", label: "Compare", labelAr: "المقارنة", icon: Scale },
    ],
  },
  {
    label: "My space",
    labelAr: "مساحتي",
    items: [
      { href: "/portfolio", label: "Portfolio", labelAr: "المحفظة", icon: Briefcase },
      { href: "/dividends", label: "Dividends", labelAr: "التوزيعات", icon: CalendarDays },
      { href: "/watchlist", label: "Watchlist", labelAr: "قائمة المتابعة", icon: ShieldCheck },
    ],
  },
  {
    label: "Trust & plans",
    labelAr: "الثقة والباقات",
    items: [
      { href: "/premium", label: "Premium", labelAr: "بريميوم", icon: Crown },
    ],
  },
]

export function AppSidebar() {
  const { lang } = useI18n()
  const pathname = usePathname()
  const ar = lang === "ar"

  const isActive = (item: NavItem) => {
    if (item.href === "/dashboard") return pathname === "/" || pathname === "/dashboard"
    if (item.exact) return pathname === item.href
    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  }

  return (
    <aside
      className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-border/60 bg-sidebar sm:flex"
      aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}
    >
      {/* Brand */}
      <Link
        href="/"
        className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border/60 px-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="EGX Financial Scanner — Home"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Activity className="h-4.5 w-4.5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-bold tracking-tight text-foreground">EGX Scanner</span>
          <span className="text-[10px] text-muted-foreground">
            {ar ? "تحليل بيانات البورصة المصرية" : "EGX market intelligence"}
          </span>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {ar ? section.labelAr : section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
                        active
                          ? "bg-primary/10 font-semibold text-primary"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      {active && (
                        <span
                          className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-primary"
                          aria-hidden="true"
                        />
                      )}
                      <Icon
                        className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                        aria-hidden="true"
                      />
                      <span className="truncate">{ar ? item.labelAr : item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-border/40 px-4 py-3">
        <p className="text-[10px] leading-none text-muted-foreground/70">EGX Scanner v0.3.0</p>
        <p className="mt-1.5 text-[10px] leading-tight text-muted-foreground/50">
          {ar
            ? "أسعار متأخرة 15 دقيقة — ليست نصيحة استثمارية"
            : "Prices delayed 15 min — not investment advice"}
        </p>
      </div>
    </aside>
  )
}
