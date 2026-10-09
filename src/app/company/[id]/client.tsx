"use client"

import { useRouter } from "next/navigation"
import { CompanyDetail } from "@/components/egx/company-detail"
import { AppHeader } from "@/components/egx/app-header"
import { AppFooter } from "@/components/egx/app-footer"

export default function CompanyPageClient({ companyId }: { companyId: string }) {
  const router = useRouter()
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader view="companies" companyOpen={true} onViewChange={(v) => router.push(`/dashboard#/${v}`)} />
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
          <CompanyDetail
            companyId={companyId}
            onBack={() => {
              if (window.history.length > 1) {
                router.back()
              } else {
                router.push("/dashboard")
              }
            }}
            onOpenScanner={(ruleId) => {
              router.push(`/dashboard#/scanners`)
            }}
          />
        </div>
      </main>
      <AppFooter />
    </div>
  )
}
