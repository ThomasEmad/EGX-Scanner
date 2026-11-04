"use client"

import { useState, useEffect } from "react"
import { TopHeader } from "./TopHeader"
import { MobileBottomNav } from "./MobileBottomNav"

interface LayoutShellProps {
  children: React.ReactNode
  showMobileNav?: boolean
}

export function LayoutShell({ children, showMobileNav = true }: LayoutShellProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Desktop top header with horizontal navigation (no vertical sidebar per spec) */}
      <div className="hidden sm:block">
        <TopHeader />
      </div>

      {/* Mobile top bar */}
      <div className="sm:hidden flex h-14 items-center gap-2 px-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <button
          className="p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground sm:hidden"
          aria-label="Menu"
        >
          <span className="h-5 w-5">☰</span>
        </button>
        <a href="/" className="flex-1 flex items-center justify-center">
          <span className="font-bold tracking-tight text-foreground text-sm">EGX Scanner</span>
        </a>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground">⚙</button>
        </div>
      </div>

      {/* Main content - full width, no sidebar padding */}
      <main
        id="main-content"
        className={`min-h-[calc(100vh-3.5rem)] pt-5 pb-6 px-5 sm:px-6 lg:px-8 ${isMobile ? "pb-20" : "pb-8"}`}
      >
        {children}
      </main>

      {/* Mobile bottom nav */}
      {showMobileNav && isMobile && <MobileBottomNav />}
    </div>
  )
}
