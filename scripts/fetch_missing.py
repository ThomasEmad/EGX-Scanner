"""
fetch_missing.py — coverage top-up fetcher (resource-cheap).

Re-tries yfinance for every ACTIVE company that currently has NO trusted
financial reports in the app DB, writing a supplement file in the same record
schema as egx-all-new-records-merged.json so scripts/import-egx-data.cjs can
merge it untouched.

Probes each ticker as {T}.CA (EGX suffix). Keeps only non-null values, annual
FY statements + quarterly, and market snapshot fields. ~1s pause between
tickers to stay polite with Yahoo.

Run:  python scripts/fetch_missing.py
Out:  egx-data/data/egx-yfinance-supplement.json
"""

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

DB_CHECK_URL = "http://localhost:3000/api/v1/companies?pageSize=50&status=LISTED"
OUT = Path(__file__).resolve().parents[2] / "egx-data" / "data" / "egx-yfinance-supplement.json"
STATEMENT_MAP = {
    "Total Revenue": "REVENUE",
    "Cost Of Revenue": "COGS",
    "Cost Of Goods Sold": "COGS",
    "Gross Profit": "GROSS_PROFIT",
    "Operating Income": "OPERATING_INCOME",
    "Net Income": "NET_PROFIT",
    "Net Income Common Stockholders": "NET_PROFIT_PARENT",
    "Pretax Income": "PROFIT_BEFORE_TAX",
    "Tax Provision": "INCOME_TAX",
    "EBIT": "EBIT",
    "EBITDA": "EBITDA",
    "Normalized EBITDA": "EBITDA",
    "Total Unusual Items": "EXTRAORDINARY_ITEMS",
    "Reconciled Depreciation": "DEPRECIATION_EXPENSE",
    "Net Interest Income": "NET_INTEREST_INCOME",
    "Interest Expense": "INTEREST_EXPENSE",
    "Interest Income": "INTEREST_INCOME",
    "Selling General And Administration": "ADMIN_EXPENSES",
    "Operating Expense": "OPERATING_EXPENSES_TOTAL",
    "Diluted EPS": "DILUTED_EPS",
    "Basic EPS": "BASIC_EPS",
    "Total Assets": "TOTAL_ASSETS",
    "Current Assets": "CURRENT_ASSETS",
    "Cash Cash Equivalents And Short Term Investments": "CASH_AND_EQUIVALENTS",
    "Total Liabilities Net Minority Interest": "TOTAL_LIABILITIES",
    "Current Liabilities": "CURRENT_LIABILITIES",
    "Stockholders Equity": "TOTAL_EQUITY",
    "Common Stock Equity": "EQUITY_PARENT",
    "Minority Interest": "NON_CONTROLLING_INTERESTS",
    "Retained Earnings": "RETAINED_EARNINGS",
    "Working Capital": "WORKING_CAPITAL",
    "Total Debt": "TOTAL_DEBT",
    "Net Debt": "TOTAL_DEBT",
    "Current Debt": "SHORT_TERM_DEBT",
    "Long Term Debt": "LONG_TERM_DEBT",
    "Ordinary Shares Number": "SHARES_OUTSTANDING",
    "Share Issued": "SHARES_OUTSTANDING",
    "Invested Capital": "INVESTMENTS",
    "Net PPE": "PPE",
    "Inventory": "INVENTORY",
    "Accounts Receivable": "ACCOUNTS_RECEIVABLE",
    "Total Capitalization": "SHARE_CAPITAL",
    "Free Cash Flow": "FREE_CASH_FLOW",
    "Operating Cash Flow": "OPERATING_CASH_FLOW",
    "Investing Cash Flow": "INVESTING_CASH_FLOW",
    "Financing Cash Flow": "FINANCING_CASH_FLOW",
    "Capital Expenditure": "CAPEX",
    "Cash Dividends Paid": "DIVIDENDS_PAID",
    "Opening Cash Position": "OPENING_CASH",
    "Ending Cash Position": "CLOSING_CASH",
    "Changes In Cash": "NET_CHANGE_IN_CASH",
    "Book Value Per Share": "BOOK_VALUE_PER_SHARE",
}


def get_missing_tickers():
    """Active companies with zero trusted reports — straight from the app DB via its API."""
    import sqlite3
    db_path = Path(__file__).resolve().parents[1] / "prisma" / "prisma" / "dev.db"
    con = sqlite3.connect(str(db_path))
    rows = con.execute(
        """
        SELECT c.ticker FROM Company c
        WHERE c.isActive = 1 AND c.ticker NOT IN ('EGPC','NILE','BTEG')
          AND NOT EXISTS (
            SELECT 1 FROM FinancialReport r
            WHERE r.companyId = c.id AND r.processingStatus IN ('VALIDATED','APPROVED','EXTRACTED')
          )
        ORDER BY c.ticker
        """
    ).fetchall()
    con.close()
    return [r[0] for r in rows]


def classify(period_label: str):
    up = period_label.upper()
    if up.startswith("Q"):
        return "Q1"
    if up.startswith("H1"):
        return "H1"
    if up.startswith("H2"):
        return "OTHER"
    if up.startswith("9M"):
        return "9M"
    return "FY"


def emit(records, ticker, code, label, stmt, period, ptype, fy, value, src):
    if value is None:
        return
    try:
        value = float(value)
    except (TypeError, ValueError):
        return
    records.append({
        "ticker": ticker,
        "metric_code": code,
        "metric_label_yahoo": label,
        "statement_type": stmt,
        "period": period,
        "period_type": ptype,
        "period_label": period_label if (period_label := {"FY": f"FY {fy}", "Q1": f"Q1 {fy}", "H1": f"H1 {fy}", "9M": f"9M {fy}", "OTHER": f"{ptype} {fy}"}.get(ptype, f"FY {fy}")) else f"FY {fy}",
        "fiscal_year": fy,
        "value": value,
        "raw_value": str(value),
        "unit": "MILLION",
        "currency": "EGP",
        "source_url": f"https://finance.yahoo.com/quote/{ticker}.CA/financials",
        "source_type": "YAHOO_FINANCE_API",
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "is_null": False,
    })


def fetch_ticker(ticker, records):
    t = yf.Ticker(f"{ticker}.CA")
    info = t.info or {}
    if not info.get("regularMarketPrice") and not info.get("marketCap"):
        return False  # symbol dead on Yahoo
    # market snapshot (shares outstanding is the field the importer consumes)
    if info.get("sharesOutstanding"):
        records.append({
            "ticker": ticker, "metric_code": "SHARES_OUTSTANDING",
            "metric_label_yahoo": "Shares Outstanding", "statement_type": "market_data",
            "period": datetime.now(timezone.utc).date().isoformat(), "period_type": "LATEST",
            "period_label": "Latest", "fiscal_year": datetime.now(timezone.utc).year,
            "value": float(info["sharesOutstanding"]), "raw_value": str(info["sharesOutstanding"]),
            "unit": "COUNT", "currency": "EGP",
            "source_url": f"https://finance.yahoo.com/quote/{ticker}.CA",
            "source_type": "YAHOO_FINANCE_API",
            "extracted_at": datetime.now(timezone.utc).isoformat(), "is_null": False,
        })

    got = False
    for frame, stmt in ((t.financials, "income_statement"), (t.balance_sheet, "balance_sheet"), (t.cashflow, "cash_flow")):
        try:
            df = frame
        except Exception:
            continue
        if df is None or df.empty:
            continue
        for col in df.columns:
            fy = col.year if hasattr(col, "year") else None
            if fy is None:
                continue
            period = col.strftime("%Y-%m-%d")
            for idx, val in df.loc[:, col].items():
                code = STATEMENT_MAP.get(str(idx))
                if code:
                    before = len(records)
                    emit(records, ticker, code, str(idx), stmt, period, "FY", fy, val, "yf")
                    if len(records) > before:
                        got = True

    # quarterly income statement → interim periods (Q1/H1/9M cumulative as reported)
    try:
        q = t.quarterly_financials
        if q is not None and not q.empty:
            for col in q.columns:
                fy = col.year
                period = col.strftime("%Y-%m-%d")
                month = col.month
                ptype = "Q1" if month == 3 else "H1" if month == 6 else "9M" if month == 9 else "OTHER"
                if ptype == "OTHER":
                    continue
                for idx, val in q.loc[:, col].items():
                    code = STATEMENT_MAP.get(str(idx))
                    if code and code in ("REVENUE", "NET_PROFIT", "NET_PROFIT_PARENT", "PROFIT_BEFORE_TAX", "INCOME_TAX", "OPERATING_INCOME", "GROSS_PROFIT", "COGS", "DILUTED_EPS", "BASIC_EPS", "EBITDA", "EBIT"):
                        emit(records, ticker, code, str(idx), "income_statement", period, ptype, fy, val, "yf")
                        got = True
    except Exception:
        pass
    return got or bool(info.get("sharesOutstanding"))


def main():
    tickers = get_missing_tickers()
    print(f"{len(tickers)} active companies currently without trusted data: {', '.join(tickers)}")
    records = []
    recovered = []
    for i, ticker in enumerate(tickers, 1):
        try:
            if fetch_ticker(ticker, records):
                recovered.append(ticker)
                print(f"[{i}/{len(tickers)}] {ticker}: DATA")
            else:
                print(f"[{i}/{len(tickers)}] {ticker}: —")
        except Exception as e:
            print(f"[{i}/{len(tickers)}] {ticker}: ERROR {str(e)[:60]}")
        time.sleep(1.0)

    out = {
        "title": "EGX Financial Data — yfinance coverage top-up supplement",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "description": f"Re-fetch attempt for {len(tickers)} companies lacking trusted data; {len(recovered)} yielded data.",
        "source": "Yahoo Finance API (yfinance, .CA symbols)",
        "currency": "EGP",
        "unit": "MILLION",
        "total_new_records": len(records),
        "recovered_tickers": recovered,
        "records": records,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nrecovered {len(recovered)}/{len(tickers)}: {', '.join(recovered)}")
    print(f"wrote {len(records)} records → {OUT}")


if __name__ == "__main__":
    main()
