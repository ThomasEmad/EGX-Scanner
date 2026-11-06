"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const links = [
  { href: "/admin", labelEn: "Overview", labelAr: "نظرة عامة" },
  { href: "/admin/review", labelEn: "Data review", labelAr: "مراجعة الداتا" },
  { href: "/admin/ops", labelEn: "Ops & scripts", labelAr: "العمليات والسكريبتات" },
  { href: "/admin/data-quality", labelEn: "Data quality", labelAr: "جودة البيانات" },
  { href: "/admin/companies", labelEn: "Companies", labelAr: "الشركات" },
  { href: "/admin/subscriptions", labelEn: "Subscriptions", labelAr: "الاشتراكات" },
  { href: "/admin/payments", labelEn: "Payment Requests", labelAr: "طلبات الدفع" },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { lang } = useI18n()
  const ar = lang === "ar"
  const [adminOk, setAdminOk] = useState<boolean | null>(null)
  const isLoginPage = pathname === "/admin/login"

  useEffect(() => {
    // The login page itself is never gated and never fetched — we render it
    // directly below instead of forcing adminOk=true (which would be a
    // synchronous setState inside an effect).
    if (isLoginPage) return
    let cancelled = false
    fetch("/api/v1/admin/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAdminOk(!!d.isAdmin) })
      .catch(() => { if (!cancelled) setAdminOk(false) })
    return () => { cancelled = true }
  }, [isLoginPage])

  useEffect(() => {
    if (adminOk === false) router.replace("/admin/login")
  }, [adminOk, router])

  if (isLoginPage) return <div className="mx-auto max-w-7xl py-8">{children}</div>
  if (adminOk === null) return null
  if (adminOk === false) return null

  return (
    <div className="mx-auto max-w-7xl space-y-5 py-8">
      {!isLoginPage && (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{ar ? "لوحة الإدارة" : "Admin Dashboard"}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {links.map((l) => {
              const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href)
              return (
                <Button key={l.href} asChild variant={active ? "default" : "outline"} size="sm">
                  <Link href={l.href}>{ar ? l.labelAr : l.labelEn}</Link>
                </Button>
              )
            })}
          </div>
        </div>
      )}
      {children}
      {!isLoginPage && (
        <p className="pt-2 text-center text-[10px] text-muted-foreground">
          <Badge variant="outline" className="text-[9px]">{ar ? "منطقة إدارية — لا تُفهرس" : "admin area — not indexed"}</Badge>
        </p>
      )}
    </div>
  )
}
