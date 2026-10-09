"use client"

// Grounded Q&A box — asks questions against the verified DB. Every answer shows
// its figures + usage count; follow-up chips keep the conversation going.

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, MessageCircleQuestion, Send, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authHeaders } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"

interface QaFigure {
  label: string
  value: string
  detail?: string
}

interface QaTurn {
  q: string
  a: string
  figures: QaFigure[]
  error?: string
}

const SUGGESTIONS_COMPANY_AR = ["هل الشركة مربحة؟", "إيه تقييم الشركة؟", "أحدث الأحداث؟", "إيه درجة صحتها المالية؟"]
const SUGGESTIONS_GLOBAL_AR = ["أفضل شركات البنوك حسب ROE؟", "أفضل شركات الأغذية حسب هامش الربح؟", "شركات نمو الإيرادات الأعلى؟", "تحليل ABUK"]
const SUGGESTIONS_COMPANY_EN = ["Is the company profitable?", "How is it valued?", "Latest events?", "Health score?"]
const SUGGESTIONS_GLOBAL_EN = ["Best banks by ROE?", "Top food companies by margin?", "Highest revenue growth?", "Analyze ABUK"]

export function QaBox({ companyId, compact = false }: { companyId?: string; compact?: boolean }) {
  const { lang } = useI18n()
  const qc = useQueryClient()
  const [question, setQuestion] = useState("")
  const [turns, setTurns] = useState<QaTurn[]>([])
  const [busy, setBusy] = useState(false)
  const ar = lang === "ar"

  const suggestions = companyId ? (ar ? SUGGESTIONS_COMPANY_AR : SUGGESTIONS_COMPANY_EN) : ar ? SUGGESTIONS_GLOBAL_AR : SUGGESTIONS_GLOBAL_EN

  async function ask(q: string) {
    const text = q.trim()
    if (text.length < 3 || busy) return
    setBusy(true)
    setQuestion("")
    setTurns((t) => [...t, { q: text, a: "", figures: [] }])
    try {
      const res = await fetch("/api/v1/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ question: text, companyId: companyId ?? null }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.answer) {
        const msg = body?.message ?? (ar ? "حصل خطأ — حاول تاني." : "Something went wrong — try again.")
        setTurns((t) => [...t.slice(0, -1), { q: text, a: "", figures: [], error: msg }])
      } else {
        setTurns((t) => [...t.slice(0, -1), { q: text, a: body.answer as string, figures: (body.figures ?? []) as QaFigure[] }])
        if (body.usage) qc.setQueryData(["qa-usage"], body.usage as { used: number; limit: number })
      }
    } catch {
      setTurns((t) => [...t.slice(0, -1), { q: text, a: "", figures: [], error: ar ? "الاتصال فشل — حاول تاني." : "Connection failed — try again." }])
    } finally {
      setBusy(false)
    }
  }

  // simple **bold** + newline rendering (answers are engine-generated markdown)
  function renderAnswer(a: string) {
    return a.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.+?)\*\*/g)
      return (
        <p key={i} className={i === 0 ? "" : "mt-1"}>
          {parts.map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : <span key={j}>{p}</span>))}
        </p>
      )
    })
  }

  return (
    <div className={`rounded-2xl border border-border/60 bg-card ${compact ? "p-4" : "p-5"}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MessageCircleQuestion className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight">{ar ? "اسأل عن السوق — إجابات من بيانات متحقق منها" : "Ask the market — answers from verified data"}</h2>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            {ar ? "إجابات دقيقة من بيانات موثقة — بدون توصيات" : "Accurate answers from verified data — no advice"}
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(question)
        }}
        className="flex gap-2"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={ar ? "اكتب سؤالك… مثال: هل الشركة مربحة؟ أو: أفضل شركات البنوك حسب ROE؟" : "Ask… e.g. Is it profitable? Or: best banks by ROE?"}
          className="h-9 text-sm"
          maxLength={300}
        />
        <Button type="submit" size="sm" className="h-9 px-3" disabled={busy || question.trim().length < 3}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl-flip" />}
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => ask(s)}
            disabled={busy}
            className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {turns.length > 0 ? (
        <div className="mt-4 space-y-3">
          {turns.map((t, i) => (
            <div key={i} className="space-y-2">
              <p className="text-xs font-semibold text-foreground/80">← {t.q}</p>
              {t.error ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-600 dark:text-red-400">{t.error}</div>
              ) : (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed text-foreground/90">
                  {renderAnswer(t.a)}
                  {t.figures.length > 0 ? (
                    <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                      {t.figures.map((f, j) => (
                        <div key={j} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card px-2.5 py-1.5">
                          <span className="min-w-0 truncate text-[10px] text-muted-foreground">{f.label}</span>
                          <span className="shrink-0 text-[11px] font-bold tabular">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
