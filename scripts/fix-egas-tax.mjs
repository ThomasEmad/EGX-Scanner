import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const c = await db.company.findUnique({ where: { ticker: "EGAS" }, select: { id: true } })
  const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: 2024, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true } })
  const v = await db.financialValue.findFirst({ where: { reportId: r.id, metricCode: "INCOME_TAX" }, select: { id: true, normalizedValue: true, originalValue: true } })
  console.log("before", v)
  if (Math.abs(v.normalizedValue - 248365100) < 1) {
    await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: 248365.1, originalValue: v.originalValue ?? 248365.1, validationNotes: "AUDIT_CORRECTION: Reuters tax was 0.2483651m; only PBT/operating income needed the x1e6 rescale, tax was already in EGP. PBT 315.797m - tax 0.248m = 315.549m vs AskBorsa net 291m (7.8% NCI/advisory)." } })
    console.log("updated to 248365.1")
  }
} finally { await db.$disconnect() }
