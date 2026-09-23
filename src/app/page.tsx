"use client"

import { useCallback, useState } from "react"
import { CompaniesView } from "@/components/egx/companies-view"
import { CompanyDetail } from "@/components/egx/company-detail"
import { DashboardView } from "@/components/egx/dashboard-view"
import { DividendsView } from "@/components/egx/dividends-view"
import { ReportsView } from "@/components/egx/reports-view"
import { ScannersView } from "@/components/egx/scanners-view"
import { AppFooter } from "@/components/egx/app-footer"
import { AppHeader } from "@/components/egx/app-header"
import { Providers } from "./providers"

export type ViewKey = "dashboard" | "scanners" | "custom" | "companies" | "dividends" | "reports"

function Shell() {
  const [view, setView] = useState<ViewKey>("dashboard")
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [pendingRuleId, setPendingRuleId] = useState<string | null>(null)

  const openCompany = useCallback((id: string) => {
    setSelectedCompanyId(id)
  }, [])

  const openScanner = useCallback((ruleId: string) => {
    setPendingRuleId(ruleId)
    setView("scanners")
    setSelectedCompanyId(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  const changeView = useCallback((v: ViewKey) => {
    setView(v)
    setSelectedCompanyId(null)
    setPendingRuleId(null)
    window.scrollTo({ top: 0 })
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader view={view} companyOpen={!!selectedCompanyId} onViewChange={changeView} />
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
          {selectedCompanyId ? (
            <CompanyDetail
              companyId={selectedCompanyId}
              onBack={() => setSelectedCompanyId(null)}
              onOpenScanner={openScanner}
            />
          ) : view === "dashboard" ? (
            <DashboardView
              onOpenScanner={openScanner}
              onOpenCompany={openCompany}
              onViewChange={changeView}
            />
          ) : view === "scanners" ? (
            <ScannersView
              mode="presets"
              pendingRuleId={pendingRuleId}
              onOpenCompany={openCompany}
              onOpenCustom={() => changeView("custom")}
            />
          ) : view === "custom" ? (
            <ScannersView
              mode="custom"
              pendingRuleId={null}
              onOpenCompany={openCompany}
              onOpenCustom={() => changeView("custom")}
            />
          ) : view === "companies" ? (
            <CompaniesView onOpenCompany={openCompany} />
          ) : view === "dividends" ? (
            <DividendsView onOpenCompany={openCompany} />
          ) : (
            <ReportsView onOpenCompany={openCompany} />
          )}
        </div>
      </main>
      <AppFooter />
    </div>
  )
}

export default function Page() {
  return (
    <Providers>
      <Shell />
    </Providers>
  )
}
