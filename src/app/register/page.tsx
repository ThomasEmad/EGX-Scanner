"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setUserToken, getUserToken, clearUserToken } from "@/lib/client/api"

interface FieldErrors {
  name?: string
  email?: string
  password?: string
  confirm?: string
  terms?: string
}

function RegisterForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [terms, setTerms] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const token = getUserToken()
    if (!token) return
    let cancelled = false
    // Never bounce away from this page — only drop a dead token (401). A live
    // session simply leaves the form open (registering another account is
    // legitimate) instead of yanking the visitor back to home instantly.
    fetch("/api/v1/auth/me", { headers: { "x-session-token": token } })
      .then((r) => {
        if (!cancelled && r.status === 401) clearUserToken()
      })
      .catch(() => {
        // network failure — keep the token, just show the form
      })
    return () => {
      cancelled = true
    }
  }, [])

  // real-time validation — every field validates as soon as it's been touched
  const errors: FieldErrors = {}
  if (touched.name && name.trim().length < 2) errors.name = "الاسم قصير جدًا — Name is too short"
  if (touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "بريد إلكتروني غير صالح — Invalid email"
  if (touched.password && password.length < 6) errors.password = "6 أحرف على الأقل — At least 6 characters"
  if (touched.confirm && confirm !== password) errors.confirm = "كلمتا المرور غير متطابقتين — Passwords do not match"
  if (touched.terms && !terms) errors.terms = "الموافقة على الشروط مطلوبة — Required"

  const valid = name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length >= 6 && confirm === password && terms

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, email: true, password: true, confirm: true, terms: true })
    if (!valid) return
    setLoading(true)
    setServerError(null)
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Registration failed")
      // register → auto sign-in when the API returns a session, else go to login
      if (data.token) {
        setUserToken(data.token, true)
        router.replace("/")
        router.refresh()
      } else {
        router.replace("/login")
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  const field = (key: "name" | "email" | "password" | "confirm" | "terms") => (touched[key] ? errors[key] : undefined)

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 to-primary/5 text-sm font-bold tracking-wide text-primary"
          >
            EGX
          </span>
          <h1 className="text-lg font-bold">إنشاء حساب — Create account</h1>
        </div>
        <Card className="w-full overflow-hidden p-0 border-border/60 shadow-lg shadow-black/5">
          <div className="h-1 w-full bg-gradient-to-r from-primary/70 via-primary/40 to-primary/10" />
          <form onSubmit={submit} className="space-y-4 p-6" noValidate>
            <div className="space-y-1">
              <Label className="text-xs font-medium" htmlFor="reg-name">الاسم — Full name</Label>
              <Input
                id="reg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                autoComplete="name"
                aria-invalid={!!field("name")}
                disabled={loading}
              />
              {field("name") ? <p className="text-[11px] text-red-600 dark:text-red-400">{field("name")}</p> : null}
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium" htmlFor="reg-email">Email</Label>
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                autoComplete="email"
                aria-invalid={!!field("email")}
                disabled={loading}
              />
              {field("email") ? <p className="text-[11px] text-red-600 dark:text-red-400">{field("email")}</p> : null}
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium" htmlFor="reg-password">كلمة المرور — Password</Label>
              <Input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                autoComplete="new-password"
                aria-invalid={!!field("password")}
                disabled={loading}
              />
              {field("password") ? <p className="text-[11px] text-red-600 dark:text-red-400">{field("password")}</p> : null}
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium" htmlFor="reg-confirm">تأكيد كلمة المرور — Confirm password</Label>
              <Input
                id="reg-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                autoComplete="new-password"
                aria-invalid={!!field("confirm")}
                disabled={loading}
              />
              {field("confirm") ? <p className="text-[11px] text-red-600 dark:text-red-400">{field("confirm")}</p> : null}
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => { setTerms(e.target.checked); setTouched((t) => ({ ...t, terms: true })) }}
                className="mt-0.5 h-3.5 w-3.5 accent-[var(--primary)]"
                aria-invalid={!!field("terms")}
              />
              <span>
                أوافق على شروط الاستخدام وأفهم أن التطبيق أداة معلوماتية وليست توصية استثمارية — I agree to the terms; this is an informational tool, not investment advice.
              </span>
            </label>
            {field("terms") ? <p className="text-[11px] text-red-600 dark:text-red-400">{field("terms")}</p> : null}
            {serverError ? (
              <p className="rounded-lg border border-red-500/40 bg-red-500/8 px-3 py-2 text-xs text-red-600 dark:text-red-400" role="alert">
                {serverError}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading || !valid}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              <UserPlus className="me-1 h-4 w-4" aria-hidden />
              Create account
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              لديك حساب بالفعل؟{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                تسجيل الدخول — Sign in
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return <RegisterForm />
}
