# Q3 2026 coverage: what does the app hold for period ending 2026-09-30?
import sqlite3

DB = "file:/home/z/my-project/db/custom.db?mode=ro"
db = sqlite3.connect(DB, uri=True)
db.row_factory = sqlite3.Row

print("=" * 100)
print("REPORTS with periodEnd in Aug-Dec 2026 (Q3 2026 filings) by source")
print("=" * 100)
q = """
SELECT r.sourceName, r.periodType, COUNT(*) n, COUNT(DISTINCT r.companyId) comp
FROM FinancialReport r
WHERE r.deletedAt IS NULL AND r.processingStatus='APPROVED'
  AND r.periodEnd >= '2026-08-01' AND r.periodEnd <= '2026-12-31'
GROUP BY r.sourceName, r.periodType ORDER BY n DESC
"""
for r in db.execute(q):
    print(dict(r))

print()
print("=" * 100)
print("Q3-2026 CalculatedMetric rows (revenue/net_profit/eps) by source period")
print("=" * 100)
q = """
SELECT cm.periodKey, cm.code, COUNT(*) n
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE c.isActive=1 AND cm.fiscalYear=2026 AND cm.value IS NOT NULL
  AND (cm.periodKey LIKE 'QUARTERLY:2026:Q3' OR cm.periodKey LIKE 'NINE_MONTH:2026%' OR cm.periodKey LIKE 'TTM:2026:Q3')
  AND cm.code IN ('revenue','net_profit','eps','roe')
GROUP BY cm.periodKey, cm.code ORDER BY cm.periodKey, cm.code
"""
for r in db.execute(q):
    print(dict(r))

print()
print("=" * 100)
print("Market freshest periods (revenue) — how current is the freshest data?")
print("=" * 100)
q = """
SELECT cm.periodKey, COUNT(DISTINCT cm.companyId) comp
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE cm.code='revenue' AND cm.value IS NOT NULL AND cm.valueStatus='OK' AND c.isActive=1
  AND cm.fiscalYear>=2026
GROUP BY cm.periodKey ORDER BY cm.periodKey
"""
for r in db.execute(q):
    print(dict(r))
