"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AdminPage() {
  const router = useRouter()

  useEffect(() => {
    const t = localStorage.getItem("adminToken")
    if (!t) router.replace("/admin/login")
  }, [router])

  return null
}
