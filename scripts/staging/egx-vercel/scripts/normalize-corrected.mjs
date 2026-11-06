// Normalize the undocumented CORRECTED validation status (invented by the legacy
// repair engine) to the documented VALID status. Provenance stays in correctedBy /
// originalValue / validationNotes. Dry-run by default, --execute to apply.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const EXECUTE = process.argv.includes('--execute')

const n = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM FinancialValue WHERE "validationStatus" = 'CORRECTED'`)
console.log('CORRECTED values:', Number(n[0].n))
// sanity: none of them may carry a quarantine note
const bad = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM FinancialValue WHERE "validationStatus" = 'CORRECTED' AND "validationNotes" LIKE 'AUDIT_QUARANTINE%'`)
console.log('CORRECTED with quarantine notes (must be 0):', Number(bad[0].n))

if (EXECUTE) {
  const res = await db.financialValue.updateMany({ where: { validationStatus: 'CORRECTED' }, data: { validationStatus: 'VALID' } })
  console.log('normalized:', res.count)
} else {
  const sample = await db.$queryRawUnsafe(`SELECT v."metricCode", v."normalizedValue" AS val, v."correctedBy", r."fiscalYear", r."periodLabel", r."sourceName", c.ticker
    FROM FinancialValue v JOIN FinancialReport r ON r.id = v.reportId JOIN Company c ON c.id = r.companyId
    WHERE v."validationStatus" = 'CORRECTED' ORDER BY RANDOM() LIMIT 12`)
  for (const s of sample) console.log(`  ${s.ticker} FY${s.fiscalYear} ${s.periodLabel} ${s.sourceName.slice(0, 22)} ${s.metricCode} = ${Number(s.val).toLocaleString()} by=${s.correctedBy}`)
}
await db.$disconnect()
