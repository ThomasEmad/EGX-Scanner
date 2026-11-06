"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// /reset-password — consumes the single-use token (pre-filled from ?token=)
// issued by the forgot-password flow and sets a new password. All sessions
// of the account are invalidated server-side on success.

function ResetForm() {
  const router = useRouter()
  const search = useSearchParams()
  const [token, setToken] = useState(search.get("token") || "")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8 || password.length > 72) {
      setError("كلمة المرور: 8 إلى 72 حرفاً — Password must be 8-72 characters")
      return
    }
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين — Passwords do not match")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.message || "Reset failed")
      }
      setDone(true)
      setTimeout(() => router.replace("/login"), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <Card className="w-full border-border/60 p-6 text-center shadow-lg shadow-black/5">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" aria-hidden />
        <h1 className="mb-2 text-base font-bold">
          <span dir="auto">تم تغيير كلمة المرور</span>
        </h1>
        <p className="mb-4 text-xs text-muted-foreground">
          <span dir="auto">تم إنهاء كل الجلسات النشطة — سجّل الدخول بكلمة المرور الجديدة.</span>
          <br />
          All active sessions were signed out — sign in with your new password.
        </p>
        <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
          <span dir="auto">تسجيل الدخول</span> · Sign in
        </Link>
      </Card>
    )
  }

  return (
    <Card className="w-full overflow-hidden border-border/60 p-0 shadow-lg shadow-black/5">
      <div className="h-1 w-full bg-gradient-to-r from-primary/70 via-primary/40 to-primary/10" />
      <form onSubmit={submit} className="space-y-4 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/5 text-primary">
            <KeyRound className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="text-lg font-bold">
            <span dir="auto">تعيين كلمة مرور جديدة</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            <span dir="auto">أدخل رمز الاستعادة الذي حصلت عليه من الدعم وكلمة المرور الجديدة.</span>
            <br />
            Paste the reset code you received from support and choose a new password.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium" htmlFor="reset-token">
            <span dir="auto">رمز الاستعادة</span> · Reset code
          </Label>
          <Input
            id="reset-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
            disabled={loading}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium" htmlFor="reset-password">
            <span dir="auto">كلمة المرور الجديدة</span> · New password
          </Label>
          <Input
            id="reset-password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            disabled={loading}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium" htmlFor="reset-confirm">
            <span dir="auto">تأكيد كلمة المرور</span> · Confirm
          </Label>
          <Input
            id="reset-confirm"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            disabled={loading}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
          <span dir="auto">إظهار كلمات المرور</span>
        </label>
        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/8 px-3 py-2 text-xs text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading || !token}>
          {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          <span dir="auto">تعيين كلمة المرور</span> · Set password
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/login" className="font-semibold text-primary hover:underline">
            <span dir="auto">العودة لتسجيل الدخول</span>
          </Link>
        </p>
      </form>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  )
}
