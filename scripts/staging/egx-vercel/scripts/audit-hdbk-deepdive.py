# Deep-dive: companies where ANNUAL:2025 revenue == a quarterly value exactly
# -> the "annual" figure is actually a partial-period statement.
import sqlite3

DB = "file:/home/z/my-project/db/custom.db?mode=ro"
db = sqlite3.connect(DB, uri=True)
db.row_factory = sqlite3.Row

TICKERS = ["HDBK", "SWDY", "JUFO", "EGAL", "BQDC", "EAST", "ABUK", "CANA", "EMFD", "SKPC"]

print("=" * 100)
print("ALL 2025/2026 REPORTS FOR SUSPECT COMPANIES (revenue-bearing)")
print("=" * 100)
qs = ",".join(f"'{t}'" for t in TICKERS)
q = f"""
SELECT c.ticker, r.id, r.reportType, r.periodType, r.periodLabel, r.fiscalYear,
       substr(r.periodStart,1,10) ps, substr(r.periodEnd,1,10) pe,
       r.sourceName, r.statementType,
       CAST(julianday(r.periodEnd)-julianday(r.periodStart) AS INT) days
FROM FinancialReport r JOIN Company c ON c.id=r.companyId
WHERE c.ticker IN ({qs}) AND r.deletedAt IS NULL
  AND r.processingStatus='APPROVED' AND r.fiscalYear IN (2025,2026)
ORDER BY c.ticker, r.periodEnd
"""
reports = {}
for r in db.execute(q):
    reports.setdefault(r["ticker"], []).append(dict(r))
    print(f"{r['ticker']:6} {r['periodLabel']:16} type={r['periodType']:12} {r['ps']}..{r['pe']} ({r['days']}d) src={r['sourceName'][:40]} st={r['statementType']}")

print()
print("=" * 100)
print("REVENUE FinancialValue per report (raw + normalized + provenance)")
print("=" * 100)
q = f"""
SELECT c.ticker, r.periodLabel, r.periodType, fv.rawValue, fv.numericValue, fv.unit,
       fv.normalizationFactor, fv.validationStatus, fv.pageNumber, fv.extractionMethod, fv.confidence
FROM FinancialValue fv
JOIN MetricDefinition m ON m.id=fv.metricId
JOIN FinancialReport r ON r.id=fv.reportId
JOIN Company c ON c.id=r.companyId
WHERE c.ticker IN ({qs}) AND m.code='revenue'
  AND fv.deletedAt IS NULL AND r.deletedAt IS NULL
ORDER BY c.ticker, r.periodEnd, fv.numericValue
"""
for r in db.execute(q):
    print(f"{r['ticker']:6} {r['periodLabel']:16} raw={str(r['rawValue'])[:24]:24} num={r['numericValue']} unit={r['unit']} nf={r['normalizationFactor']} status={r['validationStatus']} conf={r['confidence']}")
