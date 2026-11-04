"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CompaniesView } from "@/components/egx/companies-view"
import { CompanyDetail } from "@/components/egx/company-detail"
import { DashboardView } from "@/components/egx/dashboard-view"
import { DividendsView } from "@/components/egx/dividends-view"
import { ScannersView } from "@/components/egx/scanners-view"
import { LayoutShell } from "@/components/layout/LayoutShell"

import type { ViewKey } from "@/lib/view-keys"

interface Route {
  view: ViewKey
  companyId: string | null
}

function parseHash(): Route {
  const h = typeof window !== "undefined" ? window.location.hash.replace(/^#\/?/, "") : ""
  if (h.startsWith("company/")) {
    const id = h.slice("company/".length).trim()
    if (id) return { view: "companies", companyId: id }
  }
  const views: ViewKey[] = ["dashboard", "scanners", "custom", "companies", "dividends"]
  if ((views as string[]).includes(h)) return { view: h as ViewKey, companyId: null }
  return { view: "dashboard", companyId: null }
}

function toHash(r: Route): string {
  if (r.companyId) return `#/company/${r.companyId}`
  return `#/${r.view}`
}

export default function DashboardPage() {
  const router = useRouter()
  const [route, setRoute] = useState<Route>(() => {
    if (typeof window === "undefined") return { view: "dashboard", companyId: null }
    return parseHash()
  })

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigate = useCallback((next: Route) => {
    setRoute(next)
    const target = toHash(next)
    if (window.location.hash !== target) {
      window.history.pushState(null, "", target)
    }
    window.scrollTo({ top: 0 })
  }, [])

  // A homepage preset card links to /dashboard?preset=TURNAROUND#/scanners.
  // Read that once on mount so the requested screen is actually selected.
  const [pendingRuleId, setPendingRuleId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("preset")
  })

  const openCompany = useCallback((id: string) => {
    router.push(`/company/${id}`)
  }, [router])

  const openScanner = useCallback((ruleId: string) => {
    navigate({ view: "scanners", companyId: null })
    setPendingRuleId(ruleId)
  }, [navigate])

  const changeView = useCallback((v: ViewKey) => {
    if (v !== "scanners") setPendingRuleId(null)
    navigate({ view: v, companyId: null })
  }, [navigate])

  return (
    <LayoutShell showMobileNav={true}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-4">
        {route.companyId ? (
          <CompanyDetail
            companyId={route.companyId}
            onBack={() => navigate({ view: "companies", companyId: null })}
            onOpenScanner={openScanner}
          />
        ) : route.view === "dashboard" ? (
          <DashboardView
            onOpenScanner={openScanner}
            onOpenCompany={openCompany}
            onViewChange={changeView}
          />
        ) : route.view === "scanners" ? (
          <ScannersView
            mode="presets"
            pendingRuleId={pendingRuleId}
            onOpenCompany={openCompany}
            onOpenCustom={() => changeView("custom")}
          />
        ) : route.view === "custom" ? (
          <ScannersView
            mode="custom"
            pendingRuleId={null}
            onOpenCompany={openCompany}
            onOpenCustom={() => changeView("custom")}
          />
        ) : route.view === "companies" ? (
          <CompaniesView onOpenCompany={openCompany} />
        ) : route.view === "dividends" ? (
          <DividendsView onOpenCompany={openCompany} />
        ) : (
          <DashboardView
            onOpenScanner={openScanner}
            onOpenCompany={openCompany}
            onViewChange={changeView}
          />
        )}
      </div>
    </LayoutShell>
  )
}
