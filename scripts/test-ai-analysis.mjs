// Live test for the upgraded AI analysis + chat endpoints.
// Creates a short-lived session for the premium test user, then:
//   1. POST ai-analysis (en) on COMI  → expects a real LLM analysis
//   2. POST ai-analysis again         → expects cache hit
//   3. POST ai-analysis/chat          → expects a grounded follow-up answer
//   4. POST ai-analysis (ar) on HRHO  → expects an Arabic expert analysis
import { createHash, randomBytes } from "node:crypto"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const BASE = "http://localhost:3000/api/v1"

async function main() {
  const premiumUser = await db.user.findUnique({
    where: { email: "tomasemad286@gmail.com" },
    select: { id: true },
  })
  if (!premiumUser) throw new Error("premium test user not found")

  const rawToken = randomBytes(24).toString("hex")
  const hashed = createHash("sha256").update(rawToken).digest("hex")
  const session = await db.session.create({
    data: { userId: premiumUser.id, token: hashed, expiresAt: new Date(Date.now() + 3600_000) },
  })
  const headers = { "Content-Type": "application/json", "x-session-token": rawToken }

  const companies = await db.company.findMany({
    select: { id: true, ticker: true },
    where: { ticker: { in: ["COMI", "HRHO"] } },
  })
  const byTicker = Object.fromEntries(companies.map((c) => [c.ticker, c.id]))
  console.log("tickers:", Object.keys(byTicker).join(","))

  const results = {}

  // 1. Generate English analysis for COMI
  const t0 = Date.now()
  const r1 = await fetch(`${BASE}/companies/${byTicker.COMI}/ai-analysis`, {
    method: "POST",
    headers,
    body: JSON.stringify({ lang: "en" }),
  })
  const j1 = await r1.json()
  results.generate_en = {
    status: r1.status,
    elapsedMs: Date.now() - t0,
    model: j1.analysis?.model,
    degraded: j1.analysis?.degraded,
    cached: j1.cached,
    contentChars: j1.analysis?.content?.length,
    contentHead: j1.analysis?.content?.slice(0, 700),
  }
  console.log("=== 1. GENERATE EN (COMI) ===")
  console.log(JSON.stringify({ ...results.generate_en, contentHead: undefined }, null, 1))
  console.log("--- content head ---\n" + results.generate_en.contentHead)

  // 2. Immediate re-post → cache hit
  const r2 = await fetch(`${BASE}/companies/${byTicker.COMI}/ai-analysis`, {
    method: "POST",
    headers,
    body: JSON.stringify({ lang: "en" }),
  })
  const j2 = await r2.json()
  console.log("=== 2. CACHE HIT? ===")
  console.log(JSON.stringify({ status: r2.status, cached: j2.cached, model: j2.analysis?.model }, null, 1))

  // 3. Chat follow-up grounded question
  const t3 = Date.now()
  const r3 = await fetch(`${BASE}/companies/${byTicker.COMI}/ai-analysis/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      lang: "en",
      messages: [
        { role: "user", content: "You said things about cash quality. Show me the exact numbers: how does operating cash flow compare with net profit in the latest annual period, and what does that imply?" },
      ],
    }),
  })
  const j3 = await r3.json()
  results.chat_en = { status: r3.status, elapsedMs: Date.now() - t3, usage: j3.usage, replyChars: j3.reply?.length, replyHead: j3.reply?.slice(0, 900) }
  console.log("=== 3. CHAT EN ===")
  console.log(JSON.stringify({ ...results.chat_en, replyHead: undefined }, null, 1))
  console.log("--- reply head ---\n" + results.chat_en.replyHead)

  // 3b. Chat ungrounded question → must refuse politely, stay grounded
  const r3b = await fetch(`${BASE}/companies/${byTicker.COMI}/ai-analysis/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      lang: "en",
      messages: [{ role: "user", content: "What is the CEO's name and will the stock double next month after earnings?" }],
    }),
  })
  const j3b = await r3b.json()
  console.log("=== 3b. CHAT UNGROUNDED QUESTION ===")
  console.log(JSON.stringify({ status: r3b.status, replyHead: j3b.reply?.slice(0, 400) }, null, 1))

  // 4. Arabic analysis for HRHO
  const t4 = Date.now()
  const r4 = await fetch(`${BASE}/companies/${byTicker.HRHO}/ai-analysis`, {
    method: "POST",
    headers,
    body: JSON.stringify({ lang: "ar" }),
  })
  const j4 = await r4.json()
  results.generate_ar = {
    status: r4.status,
    elapsedMs: Date.now() - t4,
    model: j4.analysis?.model,
    degraded: j4.analysis?.degraded,
    contentChars: j4.analysis?.content?.length,
    contentHead: j4.analysis?.content?.slice(0, 700),
  }
  console.log("=== 4. GENERATE AR (HRHO) ===")
  console.log(JSON.stringify({ ...results.generate_ar, contentHead: undefined }, null, 1))
  console.log("--- content head ---\n" + results.generate_ar.contentHead)

  // cleanup session
  await db.session.delete({ where: { id: session.id } })
  console.log("session cleaned")
  await db.$disconnect()
}

main().catch((e) => {
  console.error("TEST FAILED:", e.message)
  process.exit(1)
})
