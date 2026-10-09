import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { answerQuestion } from "@/lib/ai/answer-engine"
import { isPremiumUser } from "@/lib/subscription"

// POST /api/v1/qa — grounded Q&A over verified DB data.
// Quotas (honest, no fake "AI"): anonymous 3/day per IP · free user 5/day · premium 60/day.

const RATE = new Map<string, { day: string; count: number }>()
const LIMITS = { anonymous: 3, free: 5, premium: 60 } as const

function bucketKey(req: NextRequest): string {
  const token = req.headers.get("x-session-token") ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? null
  if (token) return `u:${token}`
  const fwd = req.headers.get("x-forwarded-for") ?? "local"
  return `ip:${fwd.split(",")[0].trim()}`
}

export async function POST(req: NextRequest) {
  let body: { question?: unknown; companyId?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "INVALID_PAYLOAD", message: "Body must be JSON." }, { status: 400 })
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : ""
  const companyId = typeof body.companyId === "string" && body.companyId.length > 10 ? body.companyId : null
  if (question.length < 3) {
    return Response.json({ error: "INVALID_PAYLOAD", message: "Question is too short." }, { status: 400 })
  }

  // quota check / bump
  const key = bucketKey(req)
  const today = new Date().toISOString().slice(0, 10)
  const entry = RATE.get(key) ?? { day: today, count: 0 }
  if (entry.day !== today) {
    entry.day = today
    entry.count = 0
  }

  // resolve tier for the limit (token → user → premium?)
  const token = req.headers.get("x-session-token") ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? null
  let limit: number = LIMITS.anonymous
  if (token) {
    const userId = await db.session.findUnique({ where: { token }, select: { userId: true } }).then((s) => s?.userId ?? null)
    if (userId) limit = (await isPremiumUser(userId)) ? LIMITS.premium : LIMITS.free
  }

  if (entry.count >= limit) {
    return Response.json(
      { error: "QUOTA_EXCEEDED", message: "استهلكت حصة أسئلة اليوم — بريميوم يمنحك حصة أكبر بكثير.", limit, resetAt: `${today}T23:59:59Z` },
      { status: 429 }
    )
  }

  try {
    const answer = await answerQuestion(question, { companyId })
    entry.count += 1
    RATE.set(key, entry)
    return Response.json({ ...answer, usage: { used: entry.count, limit } })
  } catch (err) {
    console.error("qa-error", err)
    return Response.json({ error: "QA_FAILED", message: "حصل خطأ أثناء تجهيز الإجابة — حاول تاني." }, { status: 500 })
  }
}
