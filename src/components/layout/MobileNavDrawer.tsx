"use client"

// Mobile (<sm) navigation drawer. The desktop AppSidebar is `hidden sm:flex`,
// so on phones the ONLY navigation was the 5-item bottom bar — Dashboard,
// Compare, Portfolio and Premium were unreachable there. This drawer, opened
// from the hamburger in the mobile top bar, exposes the same sections as the
// desktop sidebar (single source of truth: SECTIONS lives in AppSidebar).

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Menu, X } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { SECTIONS, type NavItem } from "./AppSidebar"

export function MobileNavDrawer() {
  const { lang } = useI18n()
  const pathname = usePathname()
  const ar = lang === "ar"
  const [open, setOpen] = useState(false)

  // lock body scroll + Escape closes while the drawer is open
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open])

  // any route change closes the drawer (Link clicks don't unmount the layout)
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const isActive = (item: NavItem) => {
    if (item.href === "/dashboard") return pathname === "/" || pathname === "/dashboard"
    if (item.exact) return pathname === item.href
    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  }

  return (
    <>
      {/* Hamburger — lives in the mobile top bar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={ar ? "فتح القائمة" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}
          className="fixed inset-0 z-[60] sm:hidden"
        >
          {/* backdrop */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={ar ? "إغلاق القائمة" : "Close menu"}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          {/* panel — slides from the inline start, same side as the desktop sidebar */}
          <div className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col border-e border-border/60 bg-sidebar shadow-xl">
            {/* Brand + close */}
            <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border/60 px-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Activity className="h-4.5 w-4.5" />
              </div>
              <div className="flex flex-1 flex-col leading-tight">
                <span className="font-bold tracking-tight text-foreground">Meza</span>
                <span className="text-[10px] text-muted-foreground">
                  {ar ? "تحليل بيانات البورصة المصرية" : "EGX market intelligence"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={ar ? "إغلاق القائمة" : "Close menu"}
                autoFocus
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Navigation — same sections/markup as AppSidebar */}
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
              <p className="text-[10px] leading-none text-muted-foreground/70">Meza v0.3.0</p>
              <p className="mt-1.5 text-[10px] leading-tight text-muted-foreground/50">
                {ar
                  ? "أسعار متأخرة 15 دقيقة — ليست نصيحة استثمارية"
                  : "Prices delayed 15 min — not investment advice"}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
