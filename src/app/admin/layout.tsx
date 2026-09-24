import Link from "next/link"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { t, lang } = useI18n()

  const links = [
    { href: "/admin/subscriptions", label: lang === "ar" ? "الاشتراكات" : "Subscriptions" },
    { href: "/admin/payments", label: lang === "ar" ? "طلبات الدفع" : "Payment Requests" },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{lang === "ar" ? "لوحة الإدارة" : "Admin Dashboard"}</h1>
        <div className="flex items-center gap-2">
          {links.map((l) => (
            <Button key={l.href} asChild variant={pathname === l.href ? "default" : "outline"} size="sm">
              <Link href={l.href}>{l.label}</Link>
            </Button>
          ))}
        </div>
      </div>
      {children}
    </div>
  )
}
