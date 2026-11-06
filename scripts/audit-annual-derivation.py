# Investigate: ANNUAL revenue CalculatedMetrics whose sourcePeriods contain
# fewer than 4 quarters (annual value derived from partial data).
import json
import sqlite3

DB = "file:/home/z/my-project/db/custom.db?mode=ro"
db = sqlite3.connect(DB, uri=True)
db.row_factory = sqlite3.Row

print("=" * 78)
print("A) ANNUAL revenue CMs: sourcePeriods breakdown (how many quarters fed it)")
print("=" * 78)
q = """
SELECT cm.companyId, c.ticker, cm.periodKey, cm.periodLabel, cm.value,
       cm.valueStatus, cm.sourcePeriods, cm.statementType, cm.isDerived, cm.calculationType
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE cm.code='revenue' AND cm.periodType='ANNUAL' AND cm.fiscalYear=2025
  AND cm.value IS NOT NULL AND c.isActive=1
ORDER BY ABS(cm.value) DESC LIMIT 40
"""
partial = 0
total = 0
examples = []
for r in db.execute(q):
    total += 1
    sp = json.loads(r["sourcePeriods"] or "[]")
    if len(sp) < 4:
        partial += 1
        examples.append((r["ticker"], r["periodLabel"], r["value"], len(sp), sp, r["isDerived"], r["calculationType"], r["statementType"]))

print(f"annual 2025 revenue CMs with values: {total}; derived from <4 periods: {partial}")
print()
for e in examples[:30]:
    print(f"{e[0]:6} {e[1]:12} value={e[2]:>16.3e} n_src={e[3]} derived={e[5]} calc={e[6]} st={e[7]} src={e[4]}")

print()
print("=" * 78)
print("B) The ~30B cases: what does the RANKINGS view actually show?")
print("=" * 78)
q = """
SELECT c.ticker, cm.periodKey, cm.periodLabel, cm.periodType, cm.value, cm.sourcePeriods
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE cm.code='revenue' AND cm.value BETWEEN 2.0e10 AND 5.0e10 AND c.isActive=1
  AND cm.periodType IN ('ANNUAL','QUARTERLY','TTM') AND cm.fiscalYear>=2025
ORDER BY cm.value DESC LIMIT 25
"""
for r in db.execute(q):
    sp = json.loads(r["sourcePeriods"] or "[]")
    print(f"{r['ticker']:6} {r['periodKey']:22} label={r['periodLabel']:14} type={r['periodType']:9} value={r['value']:.4e} n_src={len(sp)} src={sp}")

print()
print("=" * 78)
print("C) Distribution: revenue CM rows by periodType (active companies, FY>=2025)")
print("=" * 78)
q = """
SELECT cm.periodType, COUNT(*) n, COUNT(DISTINCT cm.companyId) comp
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE cm.code='revenue' AND cm.value IS NOT NULL AND c.isActive=1 AND cm.fiscalYear>=2025
GROUP BY cm.periodType
"""
for r in db.execute(q):
    print(dict(r))
