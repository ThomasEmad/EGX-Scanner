"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"

export default function AdminLoginPage() {
  const router = useRouter()
  const { t, lang } = useI18n()
  const [passcode, setPasscode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      localStorage.setItem("adminToken", data.token)
      router.replace("/admin/subscriptions")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4" /> {lang === "ar" ? "تسجيل دخول المشرف" : "Admin Login"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input type="password" placeholder={lang === "ar" ? "رمز المرور" : "Passcode"} value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {lang === "ar" ? "دخول" : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
