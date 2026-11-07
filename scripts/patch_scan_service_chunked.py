#!/usr/bin/env python3
"""Patch scan-service.ts #2: chunk the market-wide metric fetch by companyId so
no single Turso response exceeds ~1MB (9MB single responses die mid-stream)."""
import io, sys, shutil

SRC = "/tmp/my-project/src/lib/financial/scan-service.ts"
BAK = "/home/z/my-project/scripts/patches/scan-service-pre-chunked.ts.bak"

OLD = '''  const periodKeys = [...new Set(latestKeyPerCompany.values())]
  const [allMetricRows, eventRows, dividendRows] = await Promise.all([
    periodKeys.length
      ? // Light select + explicit type cast: this query spans ALL companies for
        // the latest period keys — full-row fetch (with the heavy provenance
        // text columns) produced multi-MB responses that tripped Turso's
        // server-side response-memory guard under load (2026-11-06).
        db.calculatedMetric
          .findMany({
            where: { periodKey: { in: periodKeys }, statementType: { in: ["CONSOLIDATED", "STANDALONE"] } },
            select: { id: true, companyId: true, code: true, periodKey: true, periodType: true, fiscalYear: true, periodLabel: true, value: true, valueStatus: true, statusDetail: true, formulaVersion: true, statementType: true, calculatedAt: true },
          })
          .then((rows) => rows as unknown as CalcMetricRow[])
      : Promise.resolve([] as CalcMetricRow[]),
    periodKeys.length
      ? db.financialEvent.findMany({ where: { currentPeriodKey: { in: periodKeys } }, select: { companyId: true, eventType: true, currentPeriodKey: true } })
      : Promise.resolve([] as { companyId: string; eventType: string; currentPeriodKey: string }[]),
    db.dividend.findMany({ where: { companyId: { in: companies.map((c) => c.id) } }, select: { companyId: true, status: true } }),
  ])'''

NEW = '''  const periodKeys = [...new Set(latestKeyPerCompany.values())]

  // Metrics at each company's latest key — fetched in companyId CHUNKS so no
  // single Turso response exceeds ~1MB. The previous single query over all
  // companies (~83k rows, ~9MB) was killed mid-stream by the HTTP layer
  // (UND_ERR_SOCKET "fetch failed") and 500'd the company profile route
  // (2026-11-07); an earlier variant already tripped Turso's server-side
  // response-memory guard (2026-11-06). A chunk is bounded: ~30 companies x
  // their latest-period rows. Chunks (plus the event/dividend fetches) run in
  // parallel; the union is identical data, just never one giant response.
  // Columns id/formulaVersion/calculatedAt are not consumed by scan contexts
  // and are dropped to keep every row light.
  const CHUNK = 30
  const chunkJobs: Promise<CalcMetricRow[]>[] = []
  for (let i = 0; i < companies.length; i += CHUNK) {
    const chunkIds = companies.slice(i, i + CHUNK).map((c) => c.id)
    const chunkKeys = [...new Set(chunkIds.map((id) => latestKeyPerCompany.get(id)).filter((k): k is string => !!k))]
    if (!chunkKeys.length) continue
    chunkJobs.push(
      db.calculatedMetric
        .findMany({
          where: { companyId: { in: chunkIds }, periodKey: { in: chunkKeys }, statementType: { in: ["CONSOLIDATED", "STANDALONE"] } },
          select: { companyId: true, code: true, periodKey: true, periodType: true, fiscalYear: true, periodLabel: true, value: true, valueStatus: true, statusDetail: true, statementType: true },
        })
        .then((rows) => rows as unknown as CalcMetricRow[])
    )
  }
  const eventRowsP = periodKeys.length
    ? db.financialEvent.findMany({ where: { currentPeriodKey: { in: periodKeys } }, select: { companyId: true, eventType: true, currentPeriodKey: true } })
    : Promise.resolve([] as { companyId: string; eventType: string; currentPeriodKey: string }[])
  const dividendRowsP = db.dividend.findMany({ where: { companyId: { in: companies.map((c) => c.id) } }, select: { companyId: true, status: true } })
  const [chunkResults, eventRows, dividendRows] = await Promise.all([Promise.all(chunkJobs), eventRowsP, dividendRowsP])
  const allMetricRows = chunkResults.flat()'''

shutil.copy(SRC, BAK)
text = io.open(SRC, encoding="utf-8").read()
if OLD not in text:
    print("OLD BLOCK NOT FOUND — aborting"); sys.exit(1)
text = text.replace(OLD, NEW, 1)
io.open(SRC, "w", encoding="utf-8").write(text)
print("patched OK")
