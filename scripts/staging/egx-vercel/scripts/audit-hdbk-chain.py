# HDBK full chain: report values -> derived quarters -> calculated metrics.
import sqlite3

DB = "file:/home/z/my-project/db/custom.db?mode=ro"
db = sqlite3.connect(DB, uri=True)
db.row_factory = sqlite3.Row

print("=" * 100)
print("HDBK: revenue + net_profit FinancialValues by report")
print("=" * 100)
q = """
SELECT r.periodLabel, r.periodType, r.fiscalYear, r.sourceName, r.statementType, fv.metricCode,
       fv.value, fv.normalizedValue, fv.unit, fv.validationStatus
FROM FinancialValue fv
JOIN FinancialReport r ON r.id=fv.reportId
JOIN Company c ON c.id=r.companyId
WHERE c.ticker='HDBK' AND fv.metricCode IN ('revenue','net_profit')
  AND r.deletedAt IS NULL
ORDER BY fv.metricCode, r.periodEnd
"""
for r in db.execute(q):
    print(f"{r['metricCode']:10} {r['periodLabel']:10} ({r['periodType']:12}) raw={str(r['value'])[:20]:20} norm={r['normalizedValue']} unit={r['unit']} st={r['validationStatus']} src={r['sourceName'][:30]}")

print()
print("=" * 100)
print("HDBK: CalculatedMetric chain (revenue/net_profit/roe) — all periods 2025-2026")
print("=" * 100)
q = """
SELECT cm.code, cm.periodKey, cm.periodLabel, cm.periodType, cm.value, cm.valueStatus,
       cm.sourcePeriods, cm.calculationType, cm.statementType
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE c.ticker='HDBK' AND cm.code IN ('revenue','net_profit','roe')
  AND cm.fiscalYear IN (2025, 2026)
ORDER BY cm.code, cm.fiscalYear, cm.periodKey
"""
for r in db.execute(q):
    print(f"{r['code']:10} {r['periodKey']:20} label={r['periodLabel']:12} val={r['value']} status={r['valueStatus']} calc={r['calculationType']} src={r['sourcePeriods']}")

print()
print("=" * 100)
print("PATTERN CHECK: cumulative-quarter contamination across ALL companies")
print("a company's 'Q3' quarterly revenue >= its H1+Q1 combined and == 9M value")
print("=" * 100)
q = """
SELECT c.ticker,
       MAX(CASE WHEN cm.periodKey='QUARTERLY:2025:Q1' THEN cm.value END) q1,
       MAX(CASE WHEN cm.periodKey='QUARTERLY:2025:Q2' THEN cm.value END) q2,
       MAX(CASE WHEN cm.periodKey='QUARTERLY:2025:Q3' THEN cm.value END) q3,
       MAX(CASE WHEN cm.periodKey='ANNUAL:2025:' THEN cm.value END) fy
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE cm.code='revenue' AND c.isActive=1
GROUP BY c.ticker
HAVING fy IS NOT NULL AND q1 IS NOT NULL AND q2 IS NOT NULL AND q3 IS NOT NULL
   AND q3 >= q1 AND q3 >= q2 AND ABS(fy - q3) < 0.02*ABS(fy)
"""
rows = list(db.execute(q))
print(f"companies where FY2025 revenue == Q3 2025 revenue (±2%): {len(rows)}")
for r in rows:
    print(f"{r['ticker']:6} Q1={r['q1']:.3e} Q2={r['q2']:.3e} Q3={r['q3']:.3e} FY={r['fy']:.3e}")
