"use client"

import { useRouter } from "next/navigation"
import { DividendsView } from "@/components/egx/dividends-view"
import { LayoutShell } from "@/components/layout/LayoutShell"

export default function DividendsPageClient() {
  const router = useRouter()
  return (
    <LayoutShell showMobileNav={true}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-4">
        <DividendsView onOpenCompany={(id) => router.push(`/company/${id}`)} />
      </div>
    </LayoutShell>
  )
}
