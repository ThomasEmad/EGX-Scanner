# Read-only audit: period-label integrity in FinancialReport + the rankings view.
# URI mode=ro guarantees no writes to the production DB.
import sqlite3

DB = "file:/home/z/my-project/db/custom.db?mode=ro"
db = sqlite3.connect(DB, uri=True)
db.row_factory = sqlite3.Row

print("=" * 70)
print("1) REPORTS LABELED 'FY ...' BUT NOT ANNUAL PERIOD TYPE (mislabeled)")
print("=" * 70)
q = """
SELECT periodType, COUNT(*) n, COUNT(DISTINCT companyId) companies
FROM FinancialReport
WHERE deletedAt IS NULL AND processingStatus='APPROVED'
  AND periodLabel LIKE 'FY %' AND periodType != 'ANNUAL'
GROUP BY periodType
"""
for r in db.execute(q):
    print(dict(r))

print()
print("=" * 70)
print("2) SAMPLE: FY-labeled non-annual reports with their spans")
print("=" * 70)
q = """
SELECT c.ticker, r.periodLabel, r.periodType, r.fiscalYear,
       substr(r.periodStart,1,10) ps, substr(r.periodEnd,1,10) pe,
       r.reportType, r.statementType
FROM FinancialReport r JOIN Company c ON c.id=r.companyId
WHERE r.deletedAt IS NULL AND r.processingStatus='APPROVED'
  AND r.periodLabel LIKE 'FY %' AND r.periodType != 'ANNUAL'
ORDER BY c.ticker LIMIT 25
"""
for r in db.execute(q):
    print(dict(r))

print()
print("=" * 70)
print("3) ANNUAL-typed reports whose span is NOT ~12 months")
print("=" * 70)
q = """
SELECT c.ticker, r.periodLabel, r.periodType, r.fiscalYear,
       substr(r.periodStart,1,10) ps, substr(r.periodEnd,1,10) pe,
       CAST(julianday(r.periodEnd)-julianday(r.periodStart) AS INT) days
FROM FinancialReport r JOIN Company c ON c.id=r.companyId
WHERE r.deletedAt IS NULL AND r.processingStatus='APPROVED'
  AND r.periodType='ANNUAL' AND r.periodStart IS NOT NULL
  AND (julianday(r.periodEnd)-julianday(r.periodStart)) < 300
ORDER BY days LIMIT 30
"""
for r in db.execute(q):
    print(dict(r))

print()
print("=" * 70)
print("4) COMPANIES WITH ~30B REVENUE IN A FY-2025-LABELED REPORT")
print("=" * 70)
q = """
SELECT c.ticker, r.periodLabel, r.periodType, r.fiscalYear,
       substr(r.periodStart,1,10) ps, substr(r.periodEnd,1,10) pe,
       fv.rawValue, fv.unit
FROM FinancialValue fv
JOIN FinancialReport r ON r.id = fv.reportId
JOIN Company c ON c.id = r.companyId
JOIN MetricDefinition m ON m.id = fv.metricId
WHERE fv.deletedAt IS NULL AND r.deletedAt IS NULL AND r.processingStatus='APPROVED'
  AND (m.code LIKE '%revenue%' OR m.code LIKE '%REVENUE%' OR m.code='REVENUE')
  AND fv.numericValue IS NOT NULL AND ABS(fv.numericValue) BETWEEN 2.0e10 AND 5.0e10
  AND r.fiscalYear IN (2025, 2026)
ORDER BY c.ticker, r.periodEnd
"""
for r in db.execute(q):
    print(dict(r))

print()
print("=" * 70)
print("5) OVERALL periodLabel x periodType MATRIX (approved, live)")
print("=" * 70)
q = """
SELECT substr(periodLabel,1,instr(periodLabel||' ',' ')-1) prefix, periodType, COUNT(*) n
FROM FinancialReport
WHERE deletedAt IS NULL AND processingStatus='APPROVED'
GROUP BY prefix, periodType ORDER BY n DESC LIMIT 20
"""
for r in db.execute(q):
    print(dict(r))
