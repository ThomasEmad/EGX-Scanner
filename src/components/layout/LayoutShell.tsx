"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { TopHeader } from "./TopHeader"
import { MobileBottomNav } from "./MobileBottomNav"
import { AppSidebar } from "./AppSidebar"
import { AppFooter } from "@/components/egx/app-footer"

interface LayoutShellProps {
  children: React.ReactNode
  showMobileNav?: boolean
  /** Skip the default <main> padding for pages that manage their own
      full-bleed layout (landing, privacy). The mobile bottom-nav clearance
      is still applied. */
  flush?: boolean
}

export function LayoutShell({ children, showMobileNav = true, flush = false }: LayoutShellProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Desktop sidebar (sm+): brand + primary navigation. Uses logical
          `start-0` so it sits on the right under RTL automatically. */}
      <AppSidebar />

      {/* Content area offset by the sidebar width; `ms-` is a logical margin
          and flips with the document direction. */}
      <div className="flex min-h-screen flex-col sm:ms-64">
        {/* Slim top bar: global search + account actions (navigation lives in
            the sidebar now). */}
        <div className="hidden sm:block">
          <TopHeader />
        </div>

        {/* Mobile top bar */}
        <div className="sm:hidden flex h-14 items-center gap-2 px-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <a href="/" className="flex-1 flex items-center justify-center">
            <span className="font-bold tracking-tight text-foreground text-sm">Meza</span>
          </a>
        </div>

        <main
          id="main-content"
          className={cn(
            "min-h-[calc(100vh-3.5rem)]",
            flush
              ? isMobile
                ? "pb-20"
                : ""
              : `pt-5 pb-6 px-5 sm:px-6 lg:px-8 ${isMobile ? "pb-20" : "pb-8"}`,
          )}
        >
          {children}
        </main>

        <AppFooter />
      </div>

      {/* Mobile bottom nav */}
      {showMobileNav && isMobile && <MobileBottomNav />}
    </div>
  )
}
