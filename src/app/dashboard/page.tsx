"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CompaniesView } from "@/components/egx/companies-view"
import { CompanyDetail } from "@/components/egx/company-detail"
import { DashboardView } from "@/components/egx/dashboard-view"
import { DividendsView } from "@/components/egx/dividends-view"
import { ScannersView } from "@/components/egx/scanners-view"
import { AppFooter } from "@/components/egx/app-footer"
import { AppHeader } from "@/components/egx/app-header"
import { Providers } from "../providers"

import type { ViewKey } from "@/lib/view-keys"

interface Route {
  view: ViewKey
  companyId: string | null
}

/** Parse `#/companies`, `#/company/{id}`, `#/scanners` … into app state */
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

function Shell() {
  const router = useRouter()
  const [route, setRoute] = useState<Route>({ view: "dashboard", companyId: null })
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const fromHash = parseHash()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate client init from window.location.hash
    setRoute(fromHash)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate hydration flag update
    setHydrated(true)
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

  const [pendingRuleId, setPendingRuleId] = useState<string | null>(null)

  const openCompany = useCallback((id: string) => {
    router.push(`/company/${id}`)
  }, [router])

  const openScanner = useCallback((ruleId: string) => {
    navigate({ view: "scanners", companyId: null })
    setPendingRuleId(ruleId)
  }, [navigate])

  const changeView = useCallback((v: ViewKey) => {
    navigate({ view: v, companyId: null })
  }, [navigate])

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <AppHeader view="dashboard" companyOpen={false} onViewChange={changeView} />
        <main className="flex-1 w-full">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
            <DashboardView
              onOpenScanner={openScanner}
              onOpenCompany={openCompany}
              onViewChange={changeView}
            />
          </div>
        </main>
        <AppFooter />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader view={route.view} companyOpen={!!route.companyId} onViewChange={changeView} />
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
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
      </main>
      <AppFooter />
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Providers>
      <Shell />
    </Providers>
  )
}
