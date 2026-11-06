import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const copied = await db.financialValue.count({ where: { originalLabel: { startsWith: "COPIED from" }, validationStatus: { not: "FAILED" } } })
  console.log("COPIED values (not failed):", copied)
  const copiedStatus = await db.financialValue.groupBy({ by: ["validationStatus"], where: { originalLabel: { startsWith: "COPIED from" } }, _count: { _all: true } })
  console.log("by status:", copiedStatus)
  const copiedMetrics = await db.financialValue.groupBy({ by: ["metricCode"], where: { originalLabel: { startsWith: "COPIED from" }, validationStatus: { not: "FAILED" } }, _count: { _all: true } })
  for (const m of copiedMetrics.sort((a, b) => b._count._all - a._count._all).slice(0, 25)) console.log(String(m._count._all).padStart(5), m.metricCode)

  console.log("\n--- quarantined values by originalLabel pattern (top 20) ---")
  const q = await db.financialValue.findMany({ where: { validationNotes: { startsWith: "AUDIT_QUARANTINE" } }, select: { validationNotes: true, metricCode: true, originalLabel: true } })
  const pat = new Map()
  for (const v of q) {
    let n = v.validationNotes.replace("AUDIT_QUARANTINE:", "").trim().split(/[—.;|]/)[0].slice(0, 70)
    pat.set(n, (pat.get(n) ?? 0) + 1)
  }
  for (const [k, n] of [...pat.entries()].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), k)

  console.log("\n--- derived reports ---")
  const reps = await db.financialReport.findMany({ where: { deletedAt: null }, select: { sourceName: true, processingStatus: true, notes: true, extractionMethod: true } })
  const notes = new Map()
  for (const r of reps) {
    if (r.notes && r.notes.length > 0) notes.set(r.notes.slice(0, 80), (notes.get(r.notes.slice(0, 80)) ?? 0) + 1)
  }
  console.log("total reports:", reps.length, "| reports with notes:", [...notes.values()].reduce((a, b) => a + b, 0))
  for (const [k, n] of [...notes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(n).padStart(5), k)
} finally { await db.$disconnect() }
