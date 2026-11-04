"use client"

import { useRouter } from "next/navigation"
import { CompanyDetail } from "@/components/egx/company-detail"
import { LayoutShell } from "@/components/layout/LayoutShell"

export default function CompanyPageClient({ companyId }: { companyId: string }) {
  const router = useRouter()
  return (
    <LayoutShell showMobileNav={true}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-4">
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
    </LayoutShell>
  )
}
