"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, MailQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Forgot-password request. This environment has no outbound email service, so
// the API records the request (audit log) and always answers generically — the
// page explains the admin-completion step honestly instead of pretending an
// email was sent.

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      // generic success regardless of account existence (no user enumeration)
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Card className="w-full overflow-hidden p-0 border-border/60 shadow-lg shadow-black/5">
          <div className="h-1 w-full bg-gradient-to-r from-primary/70 via-primary/40 to-primary/10" />
          <div className="space-y-4 p-6">
            {sent ? (
              <div className="space-y-3 text-center">
                <MailQuestion className="mx-auto h-8 w-8 text-primary" aria-hidden />
                <h1 className="text-base font-semibold">تم استلام الطلب — Request received</h1>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  لو البريد مسجّل عندنا، هتقدر تعيد تعيين كلمة المرور. في البيئة الحالية مفيش خدمة بريد مفعّلة —
                  تواصل مع مشرف المنصة لإكمال إعادة التعيين.
                  <br />
                  If that email is registered, a reset can be issued. This environment has no mail service — contact
                  the platform administrator to complete the reset.
                </p>
                <Link href="/login" className="inline-block text-xs font-medium text-primary hover:underline">
                  العودة لتسجيل الدخول — Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-1 text-center">
                  <h1 className="text-base font-semibold">نسيت كلمة المرور؟ — Forgot password?</h1>
                  <p className="text-xs text-muted-foreground">أدخل بريدك وسجّلنا طلب إعادة التعيين.</p>
                </div>
                <form onSubmit={submit} className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium" htmlFor="fp-email">Email</Label>
                    <Input
                      id="fp-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      autoComplete="email"
                      disabled={loading}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    إرسال الطلب — Send request
                  </Button>
                </form>
                <p className="text-center text-xs text-muted-foreground">
                  <Link href="/login" className="text-primary hover:underline">
                    العودة لتسجيل الدخول
                  </Link>
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
