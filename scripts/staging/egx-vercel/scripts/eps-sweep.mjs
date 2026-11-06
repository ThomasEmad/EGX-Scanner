// Market-wide sweep: EPS values that are implausible vs the NI/shares identity.
// EPS is SCALE_FREE (never touched by the /1000 family rule) — a x1000 EPS corruption
// would have been missed. Flags |EPS| > 20 EGP where implied = NI / shares disagrees.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const rows = await db.$queryRawUnsafe(`
  SELECT c.ticker, r."fiscalYear" AS fy, r."periodLabel" AS pl, r."periodType" AS pt, r."sourceName" AS src,
         v."metricCode" AS code, v."normalizedValue" AS eps,
         (SELECT nv."normalizedValue" FROM FinancialValue nv JOIN FinancialReport nr ON nr.id = nv.reportId
          WHERE nv."metricCode" = 'NET_PROFIT' AND nv."normalizedValue" IS NOT NULL
            AND nv."validationStatus" NOT IN ('FAILED') AND nv."validationNotes" NOT LIKE 'AUDIT_QUARANTINE%'
            AND nr."companyId" = r."companyId" AND nr."fiscalYear" = r."fiscalYear" AND nr."periodType" = 'ANNUAL'
          ORDER BY nr."periodLabel" LIMIT 1) AS ni,
         (SELECT sv."normalizedValue" FROM FinancialValue sv JOIN FinancialReport nr ON nr.id = sv.reportId
          WHERE sv."metricCode" = 'SHARES_OUTSTANDING' AND sv."normalizedValue" IS NOT NULL
            AND sv."validationStatus" NOT IN ('FAILED') AND sv."validationNotes" NOT LIKE 'AUDIT_QUARANTINE%'
            AND nr."companyId" = r."companyId" AND nr."fiscalYear" = r."fiscalYear" AND nr."periodType" = 'ANNUAL'
          ORDER BY nr."periodLabel" LIMIT 1) AS sh
  FROM FinancialValue v
  JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
  JOIN Company c ON c.id = r.companyId
  WHERE v."metricCode" IN ('BASIC_EPS','DILUTED_EPS') AND v."normalizedValue" IS NOT NULL
    AND ABS(v."normalizedValue") > 20 AND v."validationNotes" NOT LIKE 'AUDIT_QUARANTINE%'
  ORDER BY c.ticker, r."fiscalYear"`)
for (const r of rows) {
  const eps = Number(r.eps), ni = r.ni === null ? null : Number(r.ni), sh = r.sh === null ? null : Number(r.sh)
  const implied = ni !== null && sh !== null && sh > 0 ? (ni / sh).toFixed(3) : ''
  console.log(`${r.ticker.padEnd(6)} FY${r.fy} ${String(r.pl).padEnd(10)} [${r.pt.slice(0, 4)}] ${r.code.padEnd(13)} EPS=${eps.toLocaleString()} implied=${implied} NI=${ni === null ? '—' : ni.toLocaleString()} SH=${sh === null ? '—' : sh.toLocaleString()} ${r.src.slice(0, 22)}`)
}
await db.$disconnect()
