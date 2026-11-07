#!/usr/bin/env python3
"""Inventory report for the Meza SQLite database (dev.db)."""
import sqlite3

DB = "/home/z/my-project/Meza/prisma/prisma/dev.db"

def main():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    cur = con.cursor()

    # 1. Integrity
    ic = cur.execute("PRAGMA integrity_check").fetchone()[0]
    print(f"INTEGRITY: {ic}")

    # 2. File size / page stats
    page_size, page_count = cur.execute("PRAGMA page_size").fetchone(), cur.execute("PRAGMA page_count").fetchone()
    freelist = cur.execute("PRAGMA freelist_count").fetchone()[0]
    print(f"SIZE: {page_size[0] * page_count[0] / 1e6:.1f} MB, freelist pages: {freelist}")

    # 3. Row counts for all tables
    print("\n== TABLE ROW COUNTS ==")
    tables = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name")]
    for t in tables:
        n = cur.execute(f"SELECT COUNT(*) FROM '{t}'").fetchone()[0]
        if n:
            print(f"{n:>10,}  {t}")

    # 4. Core domain highlights
    print("\n== CORE HIGHLIGHTS ==")
    q = lambda s: cur.execute(s).fetchone()[0]
    print(f"Companies total:           {q('SELECT COUNT(*) FROM Company'):,}")
    print(f"Companies active:          {q('SELECT COUNT(*) FROM Company WHERE isActive=1'):,}")
    LISTED_SQL = "SELECT COUNT(*) FROM Company WHERE listingStatus='LISTED'"
    print(f"  listed:                  {q(LISTED_SQL):,}")
    print(f"FinancialReports total:    {q('SELECT COUNT(*) FROM FinancialReport'):,}")
    print(f"  not deleted:             {q('SELECT COUNT(*) FROM FinancialReport WHERE deletedAt IS NULL'):,}")
    print("  by processingStatus:")
    for st, n in cur.execute("SELECT processingStatus, COUNT(*) FROM FinancialReport WHERE deletedAt IS NULL GROUP BY 1 ORDER BY 2 DESC"):
        print(f"    {st:<15} {n:>9,}")
    print("  by periodType (not deleted):")
    for pt, n in cur.execute("SELECT periodType, COUNT(*) FROM FinancialReport WHERE deletedAt IS NULL GROUP BY 1 ORDER BY 2 DESC"):
        print(f"    {pt:<15} {n:>9,}")
    print(f"FinancialValues:           {q('SELECT COUNT(*) FROM FinancialValue'):,}")
    print("  by validationStatus:")
    for vs, n in cur.execute("SELECT validationStatus, COUNT(*) FROM FinancialValue GROUP BY 1 ORDER BY 2 DESC"):
        print(f"    {vs:<15} {n:>9,}")
    print(f"CalculatedMetrics:         {q('SELECT COUNT(*) FROM CalculatedMetric'):,}")
    print(f"  distinct codes:          {q('SELECT COUNT(DISTINCT code) FROM CalculatedMetric'):,}")
    print("  by valueStatus:")
    for s, n in cur.execute("SELECT valueStatus, COUNT(*) FROM CalculatedMetric GROUP BY 1 ORDER BY 2 DESC"):
        print(f"    {s:<18} {n:>9,}")
    print(f"FinancialEvents:           {q('SELECT COUNT(*) FROM FinancialEvent'):,}")
    print("  top event types:")
    for et, n in cur.execute("SELECT eventType, COUNT(*) FROM FinancialEvent GROUP BY 1 ORDER BY 2 DESC LIMIT 8"):
        print(f"    {et:<28} {n:>9,}")
    print(f"MarketPrices:              {q('SELECT COUNT(*) FROM MarketPrice'):,}")
    print(f"  price date range:        {q('SELECT MIN(asOf) FROM MarketPrice')} → {q('SELECT MAX(asOf) FROM MarketPrice')}")
    print(f"Dividends:                 {q('SELECT COUNT(*) FROM Dividend'):,}")
    print(f"Users:                     {q('SELECT COUNT(*) FROM User'):,}")
    print(f"Subscriptions:             {q('SELECT COUNT(*) FROM Subscription'):,}")
    print(f"PaymentRequests:           {q('SELECT COUNT(*) FROM PaymentRequest'):,}")
    print(f"AuditRuns:                 {q('SELECT COUNT(*) FROM AuditRun'):,}")
    print(f"AuditIssues (total):       {q('SELECT COUNT(*) FROM AuditIssue'):,}")
    print(f"CompanyConfidenceScores:   {q('SELECT COUNT(*) FROM CompanyConfidenceScore'):,}")

    # 5. Latest trusted periods / freshest data
    print("\n== DATA FRESHNESS ==")
    row = cur.execute("""
        SELECT MAX(periodLabel) FROM FinancialReport
        WHERE deletedAt IS NULL AND processingStatus='APPROVED' AND periodType='ANNUAL'
    """).fetchone()
    print(f"Latest approved annual period label: {row[0]}")
    latest = cur.execute("""
        SELECT c.ticker, c.nameEn, r.periodLabel, r.periodEnd
        FROM FinancialReport r JOIN Company c ON c.id = r.companyId
        WHERE r.deletedAt IS NULL AND r.processingStatus IN ('APPROVED','VALIDATED')
        ORDER BY r.periodEnd DESC LIMIT 5
    """).fetchall()
    print("Freshest trusted filings:")
    for t in latest:
        print(f"  {t[0]:<6} {str(t[1])[:45]:<47} {t[2]}  periodEnd={t[3]}")

    # 6. Quarantine / integrity policy stats
    print("\n== QUARANTINE ==")
    qn = cur.execute("""SELECT COUNT(*) FROM FinancialValue
        WHERE validationNotes LIKE 'AUDIT_QUARANTINE:%'""").fetchone()[0]
    print(f"Values with AUDIT_QUARANTINE note: {qn:,}")
    un = cur.execute("""SELECT COUNT(*) FROM FinancialValue
        WHERE originalLabel LIKE 'COPIED from%'""").fetchone()[0]
    print(f"Values carried-forward (COPIED from): {un:,}")

    con.close()
    print("\nDONE")

if __name__ == "__main__":
    main()
