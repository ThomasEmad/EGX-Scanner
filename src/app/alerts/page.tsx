"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, BellRing, Loader2, Trash2, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authHeaders, getUserToken } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"

// /alerts — price alerts for the signed-in user. The login page has promised
// «التنبيهات» since day one; this page finally delivers it: pick a company,
// set ABOVE/BELOW a target price, and the platform fires when the recorded
// market price (same 15-minute-delayed snapshot the rest of the site shows)
// crosses it.

interface AlertRow {
  id: string
  companyId: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  direction: "ABOVE" | "BELOW"
  targetPrice: number
  active: boolean
  triggeredAt: string | null
  currentPrice: number | null
  priceAsOf: string | null
  hitNow: boolean
}

interface SearchRow {
  id: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  return n.toLocaleString("en-EG", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export default function AlertsPage() {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const qc = useQueryClient()
  const signedIn = typeof window !== "undefined" && !!getUserToken()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fetch("/api/v1/alerts", { headers: authHeaders() }).then((r) => (r.ok ? r.json() : { alerts: [] })),
    enabled: signedIn,
    refetchInterval: 60_000,
  })

  const alerts: AlertRow[] = data?.alerts ?? []
  const active = alerts.filter((a) => a.active)
  const fired = alerts.filter((a) => !a.active && a.triggeredAt)

  const justFired = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const a of fired) if (!justFired.current.has(a.id)) justFired.current.add(a.id)
  }, [fired])

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Bell className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="mb-2 text-lg font-bold">
          <span dir="auto">التنبيهات تحتاج حساباً</span>
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          <span dir="auto">أنشئ حساباً مجانياً لتصلك تنبيهات الأسعار عند وصول السهم لسعرك المستهدف.</span>
          <br />
          Create a free account to get notified when a stock reaches your target price.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/login?next=/alerts"><Button variant="outline"><span dir="auto">دخول</span></Button></Link>
          <Link href="/register?next=/alerts"><Button><span dir="auto">حساب جديد</span></Button></Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <BellRing className="h-5 w-5 text-primary" aria-hidden />
            <span dir="auto">تنبيهات الأسعار</span>
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            <span dir="auto">تُقيَّم على الأسعار المسجّلة (بنفس تأخير 15 دقيقة المعروض في الموقع).</span>
            <br />
            Evaluated on recorded prices (same 15-minute delay shown site-wide).
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="refresh">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        </Button>
      </header>

      <NewAlertForm onCreated={() => qc.invalidateQueries({ queryKey: ["alerts"] })} />

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {fired.length > 0 ? (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                <span dir="auto">تنبيهات مُطلقة</span> · Triggered
              </h2>
              {fired.map((a) => (
                <AlertCard key={a.id} alert={a} fired onChanged={() => qc.invalidateQueries({ queryKey: ["alerts"] })} />
              ))}
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-muted-foreground">
              <span dir="auto">نشِطة</span> · Active ({active.length})
            </h2>
            {active.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                <span dir="auto">لا توجد تنبيهات نشطة — أضف تنبيهاً من النموذج أعلاه.</span>
                <br />
                No active alerts — add one from the form above.
              </p>
            ) : (
              active.map((a) => (
                <AlertCard key={a.id} alert={a} onChanged={() => qc.invalidateQueries({ queryKey: ["alerts"] })} />
              ))
            )}
          </section>
        </>
      )}
    </div>
  )
}

function AlertCard({ alert: a, fired, onChanged }: { alert: AlertRow; fired?: boolean; onChanged: () => void }) {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const [busy, setBusy] = useState(false)

  const remove = useCallback(async () => {
    setBusy(true)
    await fetch(`/api/v1/alerts?id=${a.id}`, { method: "DELETE", headers: authHeaders() }).catch(() => {})
    setBusy(false)
    onChanged()
  }, [a.id, onChanged])

  const distance =
    a.currentPrice !== null && a.active && a.currentPrice > 0
      ? ((a.targetPrice - a.currentPrice) / a.currentPrice) * 100
      : null

  return (
    <Card className={`p-3 ${fired ? "border-amber-500/50 bg-amber-500/5" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/company/${a.ticker}`} className="font-mono text-sm font-bold text-primary hover:underline">
              {a.ticker}
            </Link>
            <span dir="auto" className="truncate text-xs text-muted-foreground">{ar ? a.nameAr || a.nameEn : a.nameEn}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            <span className="inline-flex items-center gap-1 font-semibold">
              {a.direction === "ABOVE" ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-600" aria-hidden />
              )}
              {a.direction === "ABOVE" ? (ar ? "عند الصعود فوق" : "fires above") : (ar ? "عند الهبوط تحت" : "fires below")}
              {" "}
              <span className="tabular-nums font-bold">{fmt(a.targetPrice)}</span>
            </span>
            {a.currentPrice !== null ? (
              <span className="text-muted-foreground">
                {ar ? "الآن" : "now"}: <span className="tabular-nums">{fmt(a.currentPrice)}</span>
                {distance !== null && a.active ? (
                  <> · <span className={Math.abs(distance) < 2 ? "font-bold text-primary" : ""}>{distance >= 0 ? "+" : ""}{fmt(distance, 1)}%</span></>
                ) : null}
              </span>
            ) : null}
            {fired && a.triggeredAt ? (
              <span className="text-amber-600 dark:text-amber-400">
                {ar ? "اطلق في" : "triggered"} {new Date(a.triggeredAt).toLocaleString(ar ? "ar-EG" : "en-GB", { dateStyle: "short", timeStyle: "short" })}
              </span>
            ) : null}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={remove} disabled={busy} aria-label={ar ? "حذف التنبيه" : "delete alert"}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />}
        </Button>
      </div>
    </Card>
  )
}

function NewAlertForm({ onCreated }: { onCreated: () => void }) {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<SearchRow | null>(null)
  const [direction, setDirection] = useState<"ABOVE" | "BELOW">("ABOVE")
  const [target, setTarget] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [results, setResults] = useState<SearchRow[]>([])
  useEffect(() => {
    if (picked || q.trim().length < 2) { setResults([]); return }
    const id = setTimeout(() => {
      fetch(`/api/v1/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => { setResults(d.results ?? []); setOpen(true) })
        .catch(() => setResults([]))
    }, 220)
    return () => clearTimeout(id)
  }, [q, picked])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const targetPrice = Number(target)
    if (!picked) { setError(ar ? "اختر شركة من البحث" : "Pick a company from the search"); return }
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      setError(ar ? "أدخل سعراً مستهدفاً صحيحاً" : "Enter a valid target price")
      return
    }
    setBusy(true)
    const res = await fetch("/api/v1/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ companyId: picked.id, direction, targetPrice }),
    }).catch(() => null)
    setBusy(false)
    if (!res || !res.ok) {
      const data = await res?.json().catch(() => ({}))
      setError(data?.message || (ar ? "تعذّر إنشاء التنبيه" : "Could not create the alert"))
      return
    }
    setPicked(null); setQ(""); setTarget("")
    onCreated()
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative space-y-1">
            <Label className="text-xs font-medium" htmlFor="alert-company">
              <span dir="auto">الشركة</span> · Company
            </Label>
            {picked ? (
              <div className="flex h-9 items-center justify-between rounded-md border border-border bg-muted/40 px-3 text-sm">
                <span className="font-mono font-bold">{picked.ticker}</span>
                <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => { setPicked(null); setQ("") }}>
                  {ar ? "تغيير" : "change"}
                </button>
              </div>
            ) : (
              <Input
                id="alert-company"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPicked(null) }}
                placeholder={ar ? "ابحث بالاسم أو الرمز…" : "search by name or ticker…"}
                autoComplete="off"
              />
            )}
            {!picked && open && results.length > 0 ? (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
                {results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-xs hover:bg-accent"
                    onClick={() => { setPicked(c); setOpen(false) }}
                  >
                    <span className="font-mono font-bold">{c.ticker}</span>
                    <span dir="auto" className="truncate text-muted-foreground">{ar ? c.nameAr || c.nameEn : c.nameEn}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium" htmlFor="alert-target">
              <span dir="auto">السعر المستهدف</span> · Target price (EGP)
            </Label>
            <div className="flex gap-2">
              <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label="direction">
                <button
                  type="button"
                  onClick={() => setDirection("ABOVE")}
                  className={`flex items-center gap-1 px-2.5 text-xs font-semibold ${direction === "ABOVE" ? "bg-emerald-600 text-white" : "bg-muted/40 text-muted-foreground"}`}
                >
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden /><span dir="auto">فوق</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("BELOW")}
                  className={`flex items-center gap-1 px-2.5 text-xs font-semibold ${direction === "BELOW" ? "bg-red-600 text-white" : "bg-muted/40 text-muted-foreground"}`}
                >
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden /><span dir="auto">تحت</span>
                </button>
              </div>
              <Input
                id="alert-target"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="0.00"
                className="tabular-nums"
              />
            </div>
          </div>
        </div>
        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/8 px-3 py-2 text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>
        ) : null}
        <Button type="submit" size="sm" disabled={busy || !picked || !target}>
          {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Bell className="me-1 h-4 w-4" aria-hidden />}
          <span dir="auto">إنشاء التنبيه</span> · Create alert
        </Button>
      </form>
    </Card>
  )
}
