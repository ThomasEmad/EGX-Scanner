# Identify the 17 companies with QUARTERLY:2026:Q3 revenue and classify:
# fiscal-legitimate (report exists ending Mar/Jun 2026) vs phantom (no report).
import sqlite3

DB = "file:/home/z/my-project/db/custom.db?mode=ro"
db = sqlite3.connect(DB, uri=True)
db.row_factory = sqlite3.Row

q = """
SELECT c.ticker, c.nameEn, cm.value, cm.sourcePeriods, cm.periodLabel
FROM CalculatedMetric cm JOIN Company c ON c.id=cm.companyId
WHERE cm.code='revenue' AND cm.periodKey='QUARTERLY:2026:Q3' AND cm.value IS NOT NULL
  AND cm.valueStatus='OK' AND c.isActive=1 ORDER BY c.ticker
"""
print(f"{'ticker':6} {'value':>14}  underlying 2026 reports (any status)")
for r in db.execute(q):
    rep_q = """
    SELECT periodLabel, periodType, processingStatus, substr(periodEnd,1,10) pe, sourceName
    FROM FinancialReport WHERE companyId=? AND deletedAt IS NULL AND fiscalYear=2026
    ORDER BY periodEnd
    """
    reps = list(db.execute(rep_q, (r["ticker"] and db.execute("SELECT id FROM Company WHERE ticker=?", (r["ticker"],)).fetchone()[0],)))
    rep_str = "; ".join(f"{x['periodLabel']}({x['periodType']},{x['processingStatus']},{x['pe']},{x['sourceName'][:20]})" for x in reps) or "NONE"
    print(f"{r['ticker']:6} {r['value']:>14.4e}  {rep_str[:150]}")
