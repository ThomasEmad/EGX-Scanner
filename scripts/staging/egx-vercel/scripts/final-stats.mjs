// Final DB stats after the full data-quality remediation.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const companies = await db.company.count()
const active = await db.company.count({ where: { isActive: true } })
const reports = await db.financialReport.count({ where: { deletedAt: null } })
const values = await db.financialValue.count()
const quarantined = await db.financialValue.count({ where: { validationNotes: { startsWith: 'AUDIT_QUARANTINE' } } })
const restored = await db.financialValue.count({ where: { isManuallyCorrected: true } })
const validNow = await db.financialValue.count({ where: { validationStatus: 'VALID' } })
const calc = await db.calculatedMetric.count()
const withIsin = await db.company.count({ where: { isin: { not: null } } })
console.log(JSON.stringify({ companies, active, reports, values, quarantined, restored, validNow, calc, companiesWithIsin: withIsin }, null, 2))
await db.$disconnect()
