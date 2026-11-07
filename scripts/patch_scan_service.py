#!/usr/bin/env python3
"""Patch scan-service.ts: replace the 493k-row JS aggregation with SQL MAX."""
import io, sys, shutil

SRC = "/tmp/my-project/src/lib/financial/scan-service.ts"
BAK = "/home/z/my-project/scripts/patches/scan-service-pre-sqlagg.ts.bak"

OLD = '''  // All period keys per company of the wanted type (from calculated metrics).
  // Statement-type aware: per-company preference (CONSOLIDATED when the company
  // has any consolidated rows, else STANDALONE) — the two bases are never mixed
  // within one company's scan context.
  const allTypeRows: Pick<CalcMetricRow, "companyId" | "periodKey" | "periodType" | "fiscalYear" | "statementType">[] =
    await db.calculatedMetric.findMany({
      where: { companyId: { in: companies.map((c) => c.id) }, statementType: { in: ["CONSOLIDATED", "STANDALONE"] } },
      select: { companyId: true, periodKey: true, periodType: true, fiscalYear: true, statementType: true },
    })
  const metrics = preferConsolidatedRows(allTypeRows)'''

NEW = '''  // All period keys per company of the wanted type (from calculated metrics).
  // Statement-type aware: per-company preference (CONSOLIDATED when the company
  // has any consolidated rows, else STANDALONE) — the two bases are never mixed
  // within one company's scan context.
  //
  // Aggregated in SQL on purpose: MAX(periodKey) per (companyId, periodType,
  // statementType). The key format is TYPE:YEAR:SUB, so the lexicographic MAX
  // is exactly the (fiscalYear, sub) recency comparison the JS loop below does,
  // and preferConsolidatedRows only needs companyId/statementType. Pulling
  // EVERY row (493k+ and growing) to do this in JS streamed multi-MB responses
  // per basis — three bases in parallel on the company profile route exhausted
  // the serverless function and 500'd it (~13s) (2026-11-07). ~1.2k aggregated
  // rows come back instead.
  const allTypeRows = await db.$queryRawUnsafe<
    { companyId: string; periodType: string; statementType: string; periodKey: string }[]
  >(
    `SELECT companyId, periodType, statementType, MAX(periodKey) AS periodKey
     FROM CalculatedMetric
     WHERE statementType IN ('CONSOLIDATED','STANDALONE')
     GROUP BY companyId, periodType, statementType`
  )
  const metrics = preferConsolidatedRows(allTypeRows)'''

shutil.copy(SRC, BAK)
text = io.open(SRC, encoding="utf-8").read()
if OLD not in text:
    print("OLD BLOCK NOT FOUND — aborting"); sys.exit(1)
text = text.replace(OLD, NEW, 1)
io.open(SRC, "w", encoding="utf-8").write(text)
print("patched OK")
