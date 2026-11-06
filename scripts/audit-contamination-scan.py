# Quantify cumulative-quarter / partial-as-annual contamination market-wide.
import sqlite3

DB = "file:/home/z/my-project/db/custom.db?mode=ro"
db = sqlite3.connect(DB, uri=True)
db.row_factory = sqlite3.Row

print("=" * 100)
print("PATTERN 1: ANNUAL:2025 revenue == some single-quarter 2025 revenue (quarters may be missing)")
print("=" * 100)
q = """
SELECT c.ticker,
       MAX(CASE WHEN cm.periodKey='QUARTERLY:2025:Q1' THEN cm.value END) q1,
       MAX(CASE WHEN cm.periodKey='QUARTERLY:2025:Q2' THEN cm.value END) q2,
       MAX(CASE WHEN cm.periodKey='QUARTERLY:2025:Q3' THEN cm.value END) q3,
       MAX(CASE WHEN cm.periodKey='QUARTERLY:2025:Q4' THEN cm.value END) q4,
       MAX(CASE WHEN cm.periodType='NINE_MONTH' AND cm.fiscalYear=2025 THEN cm.value END) m9,
       MAX(CASE WHEN cm.periodType='SEMIANNUAL' AND cm.fiscalYear=2025 THEN cm.value END) h1,
       MAX(CASE WHEN cm.periodKey='ANNUAL:2025:' THEN cm.value END) fy
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE cm.code='revenue' AND c.isActive=1
GROUP BY c.ticker
HAVING fy IS NOT NULL AND (ABS(fy-COALESCE(q3,0)) < 0.02*ABS(fy) OR ABS(fy-COALESCE(q4,0)) < 0.02*ABS(fy))
"""
rows = list(db.execute(q))
print(f"matches: {len(rows)}")
for r in rows:
    print(f"{r['ticker']:6} Q1={r['q1']} Q2={r['q2']} Q3={r['q3']} Q4={r['q4']} 9M={r['m9']} H1={r['h1']} FY={r['fy']}")

print()
print("=" * 100)
print("PATTERN 2: single-quarter value GREATER than the 9M cumulative (impossible)")
print("=" * 100)
q = """
SELECT c.ticker,
       MAX(CASE WHEN cm.periodKey='QUARTERLY:2025:Q3' THEN cm.value END) q3,
       MAX(CASE WHEN cm.periodType='NINE_MONTH' AND cm.fiscalYear=2025 THEN cm.value END) m9
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE cm.code='revenue' AND c.isActive=1
GROUP BY c.ticker
HAVING q3 IS NOT NULL AND m9 IS NOT NULL AND q3 > 1.2*m9
"""
rows = list(db.execute(q))
print(f"matches: {len(rows)}")
for r in rows:
    print(f"{r['ticker']:6} Q3={r['q3']:.4e} 9M={r['m9']:.4e} ratio={r['q3']/r['m9']:.2f}")

print()
print("=" * 100)
print("PATTERN 3: same for net_profit (annual == single quarter)")
print("=" * 100)
q = """
SELECT c.ticker,
       MAX(CASE WHEN cm.periodKey='QUARTERLY:2025:Q3' THEN cm.value END) q3,
       MAX(CASE WHEN cm.periodKey='QUARTERLY:2025:Q4' THEN cm.value END) q4,
       MAX(CASE WHEN cm.periodType='NINE_MONTH' AND cm.fiscalYear=2025 THEN cm.value END) m9,
       MAX(CASE WHEN cm.periodKey='ANNUAL:2025:' THEN cm.value END) fy
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE cm.code='net_profit' AND c.isActive=1
GROUP BY c.ticker
HAVING fy IS NOT NULL AND (ABS(fy-COALESCE(q3,0)) < 0.02*ABS(fy) OR ABS(fy-COALESCE(q4,0)) < 0.02*ABS(fy))
"""
rows = list(db.execute(q))
print(f"matches: {len(rows)}")
for r in rows:
    print(f"{r['ticker']:6} Q3={r['q3']} Q4={r['q4']} 9M={r['m9']} FY={r['fy']}")

print()
print("=" * 100)
print("PATTERN 4: source-name mix of the ANNUAL:2025 revenue CMs (yahoo vs askborsa)")
print("=" * 100)
q = """
SELECT c.ticker, cm.sourcePeriods, r.sourceName
FROM CalculatedMetric cm
JOIN Company c ON c.id=cm.companyId
LEFT JOIN FinancialReport r ON r.companyId=cm.companyId AND r.periodLabel=cm.periodLabel
  AND r.periodType='ANNUAL' AND r.deletedAt IS NULL AND r.processingStatus='APPROVED'
WHERE cm.code='revenue' AND cm.periodKey='ANNUAL:2025:' AND cm.value IS NOT NULL AND c.isActive=1
ORDER BY c.ticker
"""
seen = {}
for r in db.execute(q):
    key = r["sourceName"]
    seen.setdefault(key, []).append(r["ticker"])
for k, v in sorted(seen.items(), key=lambda x: -len(x[1])):
    print(f"{len(v):3} companies | src={k} | {','.join(v[:12])}{'...' if len(v)>12 else ''}")
