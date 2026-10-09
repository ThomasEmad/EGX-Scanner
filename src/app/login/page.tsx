"use client"

import { Suspense, useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setUserToken, getUserToken, clearUserToken } from "@/lib/client/api"

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get("next") || "/"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [alreadySignedIn, setAlreadySignedIn] = useState(false)

  // Session probe — NEVER auto-redirect away from this page: pressing "sign
  // in" must always leave the form open (a valid session used to bounce the
  // visitor straight back home — "page appears then disappears instantly").
  // A live session only flips an informational banner (the form stays usable
  // for switching accounts); a dead token (401) is cleared from storage.
  useEffect(() => {
    const token = getUserToken()
    if (!token) return
    let cancelled = false
    fetch("/api/v1/auth/me", { headers: { "x-session-token": token } })
      .then((r) => {
        if (cancelled) return
        if (r.ok) setAlreadySignedIn(true)
        else if (r.status === 401) clearUserToken()
      })
      .catch(() => {
        // network failure — keep the token, just show the form
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Login failed")
      setUserToken(data.token, remember)
      router.replace(next)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

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
          <h1 className="text-lg font-bold">تسجيل الدخول — Sign in</h1>
          <p className="text-center text-xs text-muted-foreground">
            ادخل لمتابعة قائمة المتابعة والتنبيهات — التصفح العامة متاحة بدون حساب.
            <br />
            Sign in for watchlists and alerts — public browsing needs no account.
          </p>
        </div>
        {alreadySignedIn ? (
          <div
            role="status"
            className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
          >
            لديك جلسة نشطة بالفعل — يمكنك تسجيل الخروج من زر الحساب أو متابعة استخدام المنصة.{" "}
            <Link href={next} className="font-medium text-primary hover:underline">
              العودة للرئيسية
            </Link>
            <br />
            You already have an active session — the form below still works to switch accounts.
          </div>
        ) : null}
        <Card className="w-full overflow-hidden p-0 border-border/60 shadow-lg shadow-black/5">
          <div className="h-1 w-full bg-gradient-to-r from-primary/70 via-primary/40 to-primary/10" />
          <form onSubmit={submit} className="space-y-4 p-6">
            <div className="space-y-1">
              <Label className="text-xs font-medium" htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium" htmlFor="login-password">Password</Label>
                <Link href="/forgot-password" className="text-[11px] text-primary hover:underline">
                  نسيت كلمة المرور؟
                </Link>
              </div>
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              تذكرني على هذا الجهاز — Remember me
            </label>
            {error ? (
              <p className="rounded-lg border border-red-500/40 bg-red-500/8 px-3 py-2 text-xs text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              <LogIn className="me-1 h-4 w-4" aria-hidden />
              Sign in
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              ليس لديك حساب؟{" "}
              <Link href="/register" className="font-medium text-primary hover:underline">
                إنشاء حساب — Register
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  )
}

function LoginSkeleton() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-3 px-4">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-muted" />
        <div className="h-9 w-full rounded-lg bg-muted" />
        <div className="h-9 w-full rounded-lg bg-muted" />
        <div className="h-9 w-full rounded-lg bg-muted" />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}
