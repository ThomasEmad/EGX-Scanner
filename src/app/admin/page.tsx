"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export default function AdminPage() {
  const router = useRouter()
  const [adminOk, setAdminOk] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/v1/admin/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAdminOk(!!data.isAdmin)
      })
      .catch(() => {
        if (!cancelled) setAdminOk(false)
      })
    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    if (adminOk === false) router.replace("/admin/login")
  }, [adminOk, router])

  if (adminOk === null) return null
  return null
}
