// One-time fix: rows created before the lang column existed all carry the
// 'en' default regardless of their actual content language. Reclassify each
// AiAnalysis row by measuring the Arabic share of its content (a language
// detection heuristic, not provenance metadata — stays internal to the cache).
//
// Run: node scripts/fix-ai-analysis-lang.mjs        (dry run)
//      node scripts/fix-ai-analysis-lang.mjs --apply

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const apply = process.argv.includes("--apply")

function detectLang(content) {
  const arabic = (content.match(/[\u0600-\u06FF]/g) ?? []).length
  const latin = (content.match(/[A-Za-z]/g) ?? []).length
  if (arabic + latin === 0) return "en"
  return arabic / (arabic + latin) > 0.15 ? "ar" : "en"
}

const rows = await prisma.aiAnalysis.findMany({
  select: { id: true, lang: true, content: true, createdAt: true },
  orderBy: { createdAt: "asc" },
})

let fixed = 0
for (const r of rows) {
  const detected = detectLang(r.content)
  const status = detected === r.lang ? "ok" : `MISLABELED (stored=${r.lang} → detected=${detected})`
  console.log(`${r.createdAt.toISOString()}  ${status}`)
  if (detected !== r.lang) {
    fixed++
    if (apply) await prisma.aiAnalysis.update({ where: { id: r.id }, data: { lang: detected } })
  }
}

console.log(`\n${rows.length} rows scanned, ${fixed} mislabeled${apply ? " — FIXED" : " (dry run: re-run with --apply)"}`)
await prisma.$disconnect()
