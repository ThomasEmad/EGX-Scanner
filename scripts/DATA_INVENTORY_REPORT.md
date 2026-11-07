# Meza — Field-Level Data Inventory & Gap Analysis

**Generated:** 2026-10-29
**Database:** `prisma/dev.db` (SQLite)
**Schema:** 39 tables

---

## 1. Executive Summary

| Entity | Count | Key Status |
|--------|-------|------------|
| Companies | 270 (all real, all active) | 76.7% lack financial reports |
| Financial Reports | 457 | All APPROVED; FY 2020-2026 |
| Financial Values | 16,372 | BS: 6,490 | IS: 6,515 | CF: 3,207 | Other: 160 |
| Market Prices | 3,397 | 25.6% of companies have prices |
| Calculated Metrics | 12,339 | Derived (ROE, P/E, P/B, etc.) |
| Data Sources | 3 | MANUAL_UPLOAD, YAHOO_FINANCE_API, REUTERS_FINANCIALS_PAGE |
| Scanner Rules | 10 | All active |

---

## 2. Company Registry (270 companies)

### Sector Distribution
| Sector | Count |
|--------|-------|
| Industrial | 95 |
| Financial Services | 67 |
| Consumer | 23 |
| Healthcare | 21 |
| Food | 17 |
| Real Estate | 13 |
| Banks | 12 |
| Investment | 7 |
| Telecom | 7 |
| Other | 6 |
| Energy | 2 |

### Field-Level Population Status

| Field | Populated | % | Criticality | Notes |
|-------|-----------|---|-------------|-------|
| ticker | 270/270 | 100% | Critical | Unique identifier |
| nameEn | 270/270 | 100% | Critical | English company name |
| nameAr | ? | ? | High | Arabic name (optional) |
| sector | 270/270 | 100% | Critical | Used for sector KPI grouping |
| industry | ? | ? | Medium | Sub-sector classification |
| **isin** | **22/270** | **8.1%** | **HIGH** | Needed for cross-source matching |
| **sharesOutstanding** | **60/270** | **22.2%** | **HIGH** | Needed for market cap, P/E, P/B |
| **website** | **0/270** | **0.0%** | **MEDIUM** | Needed for PDF fallback |
| **irUrl** | **0/270** | **0.0%** | **MEDIUM** | Investor relations page for PDFs |
| **lastVerifiedAt** | **0/270** | **0.0%** | **MEDIUM** | Freshness tracking |
| descriptionEn | ? | ? | Low | Company description |
| listingStatus | 270/270 | 100% | Low | All "LISTED" |
| isActive | 270/270 | 100% | Low | All active |
| isDemoData | 0/270 | 0.0% | Low | All real data |

---

## 3. Financial Reports (457 reports)

### By Report Type
| Type | Count |
|------|-------|
| ANNUAL | 263 |
| INTERIM | 194 |

### By Period Type
| Period | Count |
|--------|-------|
| ANNUAL | 263 |
| SEMIANNUAL | 81 |
| QUARTERLY | 77 |
| NINE_MONTH | 36 |

### Fiscal Year Coverage
| FY | Reports |
|----|---------|
| 2020 | 3 |
| 2021 | 32 |
| 2022 | 55 |
| 2023 | 61 |
| 2024 | 59 |
| 2025 | 167 |
| 2026 | 80 |

### Field Population
| Field | Populated | % |
|-------|-----------|---|
| companyId | 457/457 | 100% |
| reportType | 457/457 | 100% |
| periodType | 457/457 | 100% |
| fiscalYear | 457/457 | 100% |
| periodLabel | 457/457 | 100% |
| periodEnd | 457/457 | 100% |
| processingStatus | 457/457 | 100% (all APPROVED) |
| statementType | ? | ? (default CONSOLIDATED) |
| extractionMethod | ? | ? ("API_IMPORT") |
| parserVersion | ? | ? ("egx-data-import@1") |

---

## 4. Financial Values (16,372 values)

### By Statement Type
| Statement Type | Count | % |
|---------------|-------|---|
| INCOME_STATEMENT | 6,515 | 39.8% |
| BALANCE_SHEET | 6,490 | 39.6% |
| CASH_FLOW | 3,207 | 19.6% |
| OTHER | 160 | 1.0% |

### Top 20 Metrics by Value Count
| Metric | Count |
|--------|-------|
| DILUTED_EPS | 400 |
| NET_PROFIT | 387 |
| PROFIT_BEFORE_TAX | 372 |
| REVENUE | 369 |
| TOTAL_EQUITY | 365 |
| TOTAL_LIABILITIES | 364 |
| TOTAL_ASSETS | 364 |
| INCOME_TAX | 357 |
| CASH_AND_EQUIVALENTS | 357 |
| OPERATING_CASH_FLOW | 354 |
| BASIC_EPS | 352 |
| RETAINED_EARNINGS | 344 |
| OPERATING_EXPENSES_TOTAL | 342 |
| CAPEX | 338 |
| TOTAL_DEBT | 337 |
| ACCOUNTS_RECEIVABLE | 331 |
| NET_PROFIT_PARENT | 325 |
| NET_INTEREST_INCOME | 315 |
| OPERATING_INCOME | 314 |
| GROSS_PROFIT | 314 |

### Provenance Coverage
- All 16,372 values have extractionMethod set (100%)
- Source URLs not populated for API imports
- Data sources: YAHOO_FINANCE_API, REUTERS_FINANCIALS_PAGE

---

## 5. Market Prices (3,397 prices)

| Field | Value |
|-------|-------|
| Total prices | 3,397 |
| Source | YAHOO_FINANCE_API (100%) |
| Companies with prices | 69/270 (25.6%) |
| Date range | 2021-10-01 → 2026-09-24 |
| Unique constraint | (companyId, asOf) |

---

## 6. Calculated Metrics (12,339 derived)

Created via `recomputeAll()` from `src/lib/financial/recompute.ts`

| Metric | Rows | Scanner Rule Dependency |
|--------|------|------------------------|
| roe | 457 | STRONG_ROE (ROE ≥ 15%) |
| roa | 457 | — |
| p_e | 457 | — |
| p_b | 457 | VALUE_P_B (P/B ≤ 0.7) |
| market_cap | 457 | HIGH_ASSETS (≥ EGP 10B) |
| dividend_yield | 457 | DIVIDEND_YIELD (≥ 5%) |
| net_margin | 457 | — |
| debt_to_equity | 457 | DEBT_REDUCTION |
| **current_ratio** | **0** | **MISSING** — STRONG_CASH_FLOW |

---

## 7. Data Sources (3, all active)

| Source | Kind | Active |
|--------|------|--------|
| MANUAL_UPLOAD | MANUAL_UPLOAD | Yes |
| YAHOO_FINANCE_API | EXTERNAL_API | Yes |
| REUTERS_FINANCIALS_PAGE | EXTERNAL_API | Yes |

---

## 8. Scanner Rules (10, all active)

| PresetKey | Name | Status | Dependency |
|-----------|------|--------|------------|
| TURNAROUND | Financial Turnaround | ACTIVE | NET_PROFIT (Profit→Loss) |
| DETERIORATION | Profit → Loss Deterioration | ACTIVE | NET_PROFIT |
| DEBT_REDUCTION | Debt Reduction ≥ 5% | ACTIVE | TOTAL_DEBT, debt_to_equity |
| STRONG_CASH_FLOW | Positive Operating Cash Flow | ACTIVE | OPERATING_CASH_FLOW, current_ratio |
| FINANCIAL_RECOVERY | Financial Recovery Pattern | ACTIVE | NET_PROFIT, REVENUE, OPERATING_CASH_FLOW, TOTAL_DEBT |
| STRONG_ROE | Strong Profitability (ROE ≥ 15%) | ACTIVE | roe |
| HIGH_ASSETS | High Total Assets (≥ EGP 10B) | ACTIVE | market_cap, TOTAL_ASSETS |
| DIVIDEND_CALENDAR | Dividend Calendar | ACTIVE | Dividend rows (none — DATA_UNAVAILABLE) |
| VALUE_P_B | Below Book Value (P/B ≤ 0.7) | ACTIVE | p_b |
| DIVIDEND_YIELD | Dividend Yield ≥ 5% | ACTIVE | dividend_yield |

---

## 9. Gap Analysis

### A. Companies Without Financial Reports
**207/270 companies (76.7%) have no financial reports.**

Sample: QNBA (Banks), VODE (Telecom), MNHD (Real Estate), DOMTY (Food), EFOOD (Food),
AMPH (Healthcare), RMDT (Healthcare), PSFL (Investment), CNFG (Financial Services),
CPC (Food), ECCW (Industrial), EDBE (Banks), EIPC (Industrial), EZDK (Industrial),
GOUR (Consumer), GTEX (Industrial), IBPH (Healthcare), ICID (Other), KORA (Industrial),
MESF (Industrial)

### B. Companies Without Market Prices
**201/270 companies (74.4%) have no market prices.**
This blocks p_e, p_b, market_cap, dividend_yield scanner rules for these companies.

### C. Missing Company Metadata
| Field | Missing | % | Impact |
|-------|---------|---|--------|
| ISIN | 248/270 | 91.9% | Cross-source matching, data integrity |
| sharesOutstanding | 210/270 | 77.8% | Market cap calculation |
| website | 270/270 | 100% | PDF fallback discovery |
| irUrl | 270/270 | 100% | PDF fallback discovery |
| lastVerifiedAt | 270/270 | 100% | Freshness tracking |

### D. Missing Calculated Metrics
| Metric | Rows | Impact |
|--------|------|--------|
| current_ratio | 0 | STRONG_CASH_FLOW rule partially blocked |

### E. Reports Without Values
**0/457 reports** — all reports have associated financial values. No gap here.

### F. Period Coverage Gaps
- FY 2020: only 3 reports (minimal coverage)
- FY 2026: 80 reports (partial year — current fiscal year)
- Most complete years: 2022-2025 (55-167 reports each)

---

## 10. Prioritization — Highest Impact Missing Data

### Priority 1: Market Prices for 201 Companies (74.4% gap)
**Impact:** Enables p_e, p_b, market_cap, dividend_yield calculated metrics and scanner rules for ~74% of companies.
**Source:** YAHOO_FINANCE_API (same pipeline as existing 3,397 prices)
**Action:** Extend market price harvest to cover all 270 companies.

### Priority 2: ISIN for 248 Companies (91.9% gap)
**Impact:** Enables cross-source matching, prevents duplicate companies, supports data integrity audits.
**Source:** universe.json has ISINs for all 96 companies; need to map to 270 DB companies.
**Action:** Backfill ISIN from universe.json and EGX official listings.

### Priority 3: sharesOutstanding for 210 Companies (77.8% gap)
**Impact:** Required for market_cap calculation; currently only 60 companies have it.
**Source:** Market data snapshots (already in egx-data pipeline)
**Action:** Extract from market_data records in financials-unified.json.

### Priority 4: Financial Reports for 207 Companies (76.7% gap)
**Impact:** These companies have zero financial data — invisible to scanner.
**Source:** egx-data pipeline (financials-unified.json has data for 40+ companies not yet in DB)
**Action:** Run import for remaining companies; PDF fallback for 56 companies not on Yahoo/Reuters.

### Priority 5: current_ratio Calculated Metric (0 rows)
**Impact:** STRONG_CASH_FLOW scanner rule cannot fully evaluate.
**Action:** Add current_ratio to calc engine (current_assets / current_liabilities).

### Priority 6: Company Metadata (website, irUrl, lastVerifiedAt)
**Impact:** Enables PDF fallback pipeline, freshness tracking, audit trails.
**Action:** Populate from universe.json and EGX disclosures.

---

## 11. Data Sources & Traceability

All 16,372 financial values and 3,397 market prices carry full provenance:
- **extractionMethod**: "API_IMPORT" for all values
- **parserVersion**: "egx-data-import@1"
- **sourceType**: YAHOO_FINANCE_API / REUTERS_FINANCIALS_PAGE
- **3 data sources** registered in DataSource table
- **12,339 calculated metrics** carry formulaVersion + source periods for auditability
- **438 financial events** detected (turnaround, deterioration, recovery, etc.)

---

## 12. Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `scripts/data-inventory.mjs` | Created | Full DB inventory & gap analysis script |
| `scripts/recompute-all.mjs` | Created | Runs `recomputeAll()` for all 270 companies |
| `scripts/DATA_INVENTORY_REPORT.md` | Created | This report |
| `prisma/dev.db` | Populated | 270 companies, 457 reports, 16,372 values, 3,397 prices, 12,339 calc metrics |

---

## 13. Next Steps

1. Run market price harvest for remaining 201 companies
2. Backfill ISIN from universe.json (96 companies have ISINs)
3. Extract sharesOutstanding from market_data snapshots
4. Import financial data for 207 companies without reports
5. Add current_ratio to calculation engine
6. Populate website/irUrl/lastVerifiedAt for all companies
7. Set up automated freshness monitoring (lastVerifiedAt tracking)

