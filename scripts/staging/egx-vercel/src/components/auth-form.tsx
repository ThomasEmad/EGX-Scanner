"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"

export function AuthForm({ onSuccess }: { onSuccess: () => void }) {
  const { t, lang } = useI18n()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const endpoint = isRegister ? "/api/v1/auth/register" : "/api/v1/auth/login"
      const body = isRegister ? { email, password, name } : { email, password }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      if (data.token) {
        localStorage.setItem("egx-user-token", data.token)
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="text-sm">{isRegister ? (lang === "ar" ? "إنشاء حساب" : "Create account") : (lang === "ar" ? "تسجيل دخول" : "Sign in")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          {isRegister ? (
            <Input placeholder={lang === "ar" ? "الاسم" : "Name"} value={name} onChange={(e) => setName(e.target.value)} />
          ) : null}
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {isRegister ? (lang === "ar" ? "تسجيل" : "Register") : (lang === "ar" ? "دخول" : "Login")}
          </Button>
          <Button type="button" variant="ghost" className="w-full text-xs" onClick={() => { setIsRegister((v) => !v); setError(null) }}>
            {isRegister ? (lang === "ar" ? "لديك حساب؟ سجل دخول" : "Have an account? Sign in") : (lang === "ar" ? "ليس لديك حساب؟ أنشئ حساب" : "No account? Register")}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
