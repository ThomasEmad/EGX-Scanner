import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

const MONTHS = {
  "يناير": 1, "فبراير": 2, "مارس": 3, "ابريل": 4, "أبريل": 4, "مايو": 5, "يونيو": 6,
  "يوليو": 7, "اغسطس": 8, "أغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "أكتوبر": 10,
  "نوفمبر": 11, "ديسمبر": 12,
}
function startMonthFromNotes(notes) {
  if (!notes) return null
  const m = notes.match(/fiscal year starts\s+([^\s;]+)/i)
  if (!m) return null
  return MONTHS[m[1]] ?? null
}
function endMonthForStart(start) {
  if (!start) return null
  return start === 1 ? 12 : start - 1
}
function lastDay(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true, nameEn: true, sector: true } })
const out = []
for (const c of companies) {
  const reports = await db.financialReport.findMany({
    where: { companyId: c.id, periodType: "ANNUAL" },
    select: { id: true, periodLabel: true, fiscalYear: true, periodStart: true, periodEnd: true, processingStatus: true, sourceName: true, notes: true },
    orderBy: { fiscalYear: "asc" },
  })
  if (!reports.length) continue
  // derive end month from historical reports that have explicit start/end
  const explicit = reports.filter((r) => r.periodStart && r.periodEnd && r.periodStart.getUTCMonth() !== 0)
  const explicitEndMonths = [...new Set(explicit.map((r) => r.periodEnd.getUTCMonth() + 1))]
  const noteMonths = [...new Set(reports.map((r) => startMonthFromNotes(r.notes)).filter(Boolean))]
  const inferredEndMonths = [...new Set([
    ...explicitEndMonths,
    ...noteMonths.map(endMonthForStart).filter(Boolean),
  ])]
  if (inferredEndMonths.length === 0 || (inferredEndMonths.length === 1 && inferredEndMonths[0] === 12)) continue
  const endMonth = inferredEndMonths.length === 1 ? inferredEndMonths[0] : null
  const bad = reports.filter((r) => r.periodEnd && (r.periodEnd.getUTCMonth() + 1) !== (endMonth ?? (r.periodEnd.getUTCMonth() + 1)))
  if (bad.length === 0) continue
  out.push({
    ticker: c.ticker,
    name: c.nameEn,
    sector: c.sector,
    explicitEndMonths,
    noteMonths,
    inferredEndMonths,
    endMonth,
    reports: reports.map((r) => ({
      id: r.id, label: r.periodLabel, fy: r.fiscalYear,
      start: r.periodStart?.toISOString().slice(0, 10) ?? null,
      end: r.periodEnd?.toISOString().slice(0, 10) ?? null,
      source: r.sourceName, status: r.processingStatus,
      noteStartMonth: startMonthFromNotes(r.notes),
    })),
  })
}
console.log(JSON.stringify(out, null, 2))
await db.$disconnect()
