"use client"

import { useEffect, useState } from "react"

// Social sign-in buttons (Google / Facebook), rendered only for providers
// configured on the server. Fetched once per mount from /auth/oauth/providers
// (cacheable) so adding credentials requires zero code changes: set the env
// vars and the buttons appear.

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.3h6.5c-.1 1-.8 2.6-2.4 3.7l3.7 2.9c2.3-2.1 3.7-5.2 3.7-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5H1.3v3C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4v-3H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l3.9-3z" />
      <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l3.9 3c.9-2.9 3.6-4.9 6.8-4.9z" />
    </svg>
  )
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z" />
    </svg>
  )
}

interface Providers {
  google: boolean
  facebook: boolean
}

export function OAuthButtons({ next }: { next?: string }) {
  const [providers, setProviders] = useState<Providers | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/v1/auth/oauth/providers")
      .then((r) => (r.ok ? (r.json() as Promise<Providers>) : { google: false, facebook: false }))
      .then((p) => {
        if (!cancelled) setProviders(p)
      })
      .catch(() => {
        if (!cancelled) setProviders({ google: false, facebook: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!providers || (!providers.google && !providers.facebook)) return null

  const nextQ = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""

  return (
    <div className="space-y-2" data-testid="oauth-buttons">
      <div className="relative py-1 text-center" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="relative bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span dir="auto">أو تابع عبر</span> · or continue with
        </span>
      </div>
      {providers.google ? (
        <a
          href={`/api/v1/auth/oauth/google/start${nextQ}`}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-card text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <GoogleMark />
          <span dir="auto">متابعة بحساب Google</span>
          <span aria-hidden>·</span> Google
        </a>
      ) : null}
      {providers.facebook ? (
        <a
          href={`/api/v1/auth/oauth/facebook/start${nextQ}`}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#1877F2] text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <FacebookMark />
          <span dir="auto">متابعة بحساب Facebook</span>
          <span aria-hidden>·</span> Facebook
        </a>
      ) : null}
    </div>
  )
}
