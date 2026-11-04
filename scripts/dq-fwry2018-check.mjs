import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const r = await db.financialReport.findFirst({
    where: { company: { ticker: "FWRY" }, periodLabel: "FY 2018" },
    select: { id: true, deletedAt: true, values: { where: { metricCode: { in: ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "CURRENT_ASSETS", "NON_CURRENT_ASSETS"] }, validationStatus: "VALID" }, select: { metricCode: true, subPeriod: true, normalizedValue: true } } },
  })
  console.log("report", r.id, "deleted", r.deletedAt)
  const m = new Map()
  for (const v of r.values) m.set(v.metricCode, v)
  const A = m.get("TOTAL_ASSETS"), L = m.get("TOTAL_LIABILITIES"), E = m.get("TOTAL_EQUITY"), CA = m.get("CURRENT_ASSETS"), NCA = m.get("NON_CURRENT_ASSETS")
  console.log("A", A?.normalizedValue, "L", L?.normalizedValue, "E", E?.normalizedValue, "CA", CA?.normalizedValue, "NCA", NCA?.normalizedValue)
  const compA = CA.normalizedValue + NCA.normalizedValue
  const le = L.normalizedValue + E.normalizedValue
  const base = Math.max(Math.abs(A.normalizedValue), Math.abs(compA), Math.abs(le))
  const th = Math.max(base * 0.005, Math.min(1_000_000, base * 0.001))
  console.log("compA", compA, "le", le, "th", th, "A-compA", A.normalizedValue - compA, "compA-le", compA - le)
  console.log("assetsOutlier", Math.abs(A.normalizedValue - compA) > th && Math.abs(A.normalizedValue - le) > th && Math.abs(compA - le) <= th && compA > 0)
} finally { await db.$disconnect() }
