# تقرير خط الأساس لاكتمال البيانات / Data Completeness Baseline

**التاريخ / Date:** 2026-11-03  
**هذا تقرير قياس بيانات فقط — ليس توصية استثمارية. / This is a data measurement report, not investment advice.**

---

## 1. النطاق / Universe

| البند / Item | القيمة / Value |
|---|---:|
| إجمالي الشركات / Companies total | 297 |
| النشطة / Active | 276 |
| غير النشطة / Inactive | 21 |
| القطاعات / Sectors | 19 |

## 2. بيانات الشركات / Company metadata

| الحقل / Field | التغطية / Coverage |
|---|---:|
| ISIN | 93.5% (258/276) |
| Shares outstanding | 91.7% |
| Website | 8.7% |
| EGX category | 87.7% |
| Source URL | 37.0% |
| IR URL | 8.7% |
| Last verified | 12.0% |

- **ISIN مفقود / Missing ISIN (18):** ACRO, AIHC, ARPI, ARVA, DIFC, ESRS, GETO, GOCO, LUTS, MMAT, NAPR, NCEM, NOAF, PTCC, SIMO, TRST, UASG, VLMR
- **Shares مفقودة / Missing shares (23):** ACRO, ARPI, ARVA, BQDC, DCCC, DIFC, EITP, ESRS, GETO, GOCO, IRAX, NCEM, NCGC, NOAF, POCO, PTCC, RMTV, SMPP, SUCE, TORA, TRST, UASG, WATP

## 3. الإفصاحات / Reports

| البند / Item | القيمة / Value |
|---|---:|
| إجمالي صفوف التقارير / Report rows | 6817 |
| موثوقة وغير محذوفة / Trusted, non-deleted | 6803 |
| محذوفة / Deleted | 9 |
| مستقبلية / Future periodEnd | 5 |
| شركات لديها تقرير موثوق / Companies with trusted report | 275 |
| شركات لديها تقرير سنوي / Companies with annual report | 271 |
| تغطية publicationDate | 0.0% |
| تغطية sourceUrl | 20.6% |

**توزيع أحدث سنة سنوية / Latest annual FY distribution:** 2013: 1 · 2015: 2 · 2017: 1 · 2018: 3 · 2019: 5 · 2020: 3 · 2021: 2 · 2022: 6 · 2023: 2 · 2024: 53 · 2025: 181 · 2026: 12

**شركات بلا تقرير موثوق / No trusted report:** KORA  
**شركات بلا تقرير سنوي / No annual report:** AIDC, AMII, CPME, EGREF, KORA

## 4. القيم / Values

| الحالة / Status | العدد / Count |
|---|---:|
| إجمالي / Total | 99230 |
| VALID | 80244 |
| NEEDS_REVIEW | 18986 |
| FAILED | 0 |
| PENDING | 0 |
| Authoritative (سياسة النزاهة) | 80215 |
| Quarantined / غير موثوقة | 19015 |
| Provenance (page/text/bbox) | 4.4% |
| Extraction method | 100.0% |

> **ملاحظة / Note:** `VALID` هو حالة التحقق الخام. `Authoritative` يستبعد أيضاً النسخ المرحّلة وبدائل الصفر (سياسة النزاهة)، لذا قد يكون أقل من `VALID`. الفرق يظهر داخل `Quarantined` وليس كفقدان بيانات.
> `VALID` is the raw validation status. `Authoritative` additionally excludes carried-forward copies and zero placeholders per the integrity policy, so it can be lower than `VALID`; the difference is counted inside `Quarantined`, not lost.

## 5. تغطية الحقول / Field coverage

> المقام للقطاعات المالية لا يتطلب الإيرادات التقليدية؛ الحقول غير المنطبقة لا تُحتسب كخطأ.
> Financial-sector denominators do not require conventional revenue; non-applicable fields are not counted as errors.

### أدنى تغطية عبر أي فترة / Lowest coverage, any period

| Metric | Statement | Applicable | Any | Latest annual | Values (V/R/F/P) |
|---|---|---:|---:|---:|---:|
| DEPOSITS | BALANCE_SHEET | 14 | 0.0% | 0.0% | 1 (0/1/0/0) |
| NON_CURRENT_LIABILITIES | BALANCE_SHEET | 276 | 0.4% | 0.4% | 1 (1/0/0/0) |
| RD_EXPENSES | INCOME_STATEMENT | 276 | 0.7% | 0.7% | 13 (11/2/0/0) |
| INVESTED_CAPITAL | BALANCE_SHEET | 276 | 1.4% | 1.4% | 14 (14/0/0/0) |
| NET_DEBT | BALANCE_SHEET | 276 | 1.4% | 1.4% | 14 (14/0/0/0) |
| TOTAL_CAPITALIZATION | BALANCE_SHEET | 276 | 1.4% | 1.4% | 14 (14/0/0/0) |
| AMORTIZATION_EXPENSE | OTHER | 276 | 2.5% | 2.5% | 20 (20/0/0/0) |
| STOCK_COMPENSATION | OTHER | 276 | 2.9% | 2.9% | 56 (49/7/0/0) |
| INVESTMENTS | BALANCE_SHEET | 276 | 3.6% | 3.6% | 70 (58/12/0/0) |
| TREASURY_SHARES | BALANCE_SHEET | 276 | 5.1% | 5.1% | 85 (75/10/0/0) |
| TREASURY_TRANSACTIONS_CASH | CASH_FLOW | 276 | 5.1% | 5.1% | 55 (51/4/0/0) |
| SHARE_PREMIUM | BALANCE_SHEET | 276 | 5.8% | 5.4% | 104 (86/18/0/0) |
| LOANS_NET | BALANCE_SHEET | 14 | 7.1% | 0.0% | 1 (1/0/0/0) |
| CAPITAL_INCREASES_CASH | CASH_FLOW | 276 | 7.3% | 7.3% | 100 (92/8/0/0) |
| GOODWILL | BALANCE_SHEET | 276 | 7.6% | 6.9% | 181 (136/45/0/0) |
| INTANGIBLE_ASSETS | BALANCE_SHEET | 276 | 8.0% | 7.6% | 63 (63/0/0/0) |
| LEASE_LIABILITIES_NONCURRENT | BALANCE_SHEET | 276 | 9.4% | 9.4% | 249 (244/5/0/0) |
| INTEREST_PAID_CF | CASH_FLOW | 276 | 9.4% | 8.3% | 68 (68/0/0/0) |
| FX_EFFECT_CASH | OTHER | 276 | 9.8% | 9.8% | 230 (220/10/0/0) |
| OTHER_PAYABLES | BALANCE_SHEET | 276 | 10.1% | 9.1% | 156 (136/20/0/0) |
| OTHER_EXPENSES | INCOME_STATEMENT | 276 | 10.9% | 10.1% | 82 (82/0/0/0) |
| LEASE_LIABILITIES_CURRENT | BALANCE_SHEET | 276 | 12.3% | 12.0% | 92 (92/0/0/0) |
| ASSET_SALE_PROCEEDS | CASH_FLOW | 276 | 12.3% | 12.3% | 287 (244/43/0/0) |
| OTHER_INCOME | INCOME_STATEMENT | 276 | 12.7% | 12.3% | 124 (113/11/0/0) |
| DIVIDEND_PER_SHARE | OTHER | 276 | 13.0% | 10.5% | 93 (93/0/0/0) |
| TRADE_PAYABLES | BALANCE_SHEET | 276 | 13.8% | 13.8% | 354 (270/84/0/0) |
| WORKING_CAPITAL | OTHER | 276 | 13.8% | 13.8% | 324 (273/51/0/0) |
| DEPRECIATION_EXPENSE | OTHER | 276 | 14.5% | 14.1% | 359 (305/54/0/0) |
| EXTRAORDINARY_ITEMS | OTHER | 276 | 14.9% | 14.5% | 323 (278/45/0/0) |
| NON_CONTROLLING_INTERESTS | BALANCE_SHEET | 276 | 15.2% | 14.9% | 337 (257/80/0/0) |

### أدنى تغطية في أحدث تقرير سنوي / Lowest latest-annual coverage

| Metric | Applicable | Latest annual | Any |
|---|---:|---:|---:|
| DEPOSITS | 14 | 0.0% | 0.0% |
| LOANS_NET | 14 | 0.0% | 7.1% |
| NON_CURRENT_LIABILITIES | 276 | 0.4% | 0.4% |
| RD_EXPENSES | 276 | 0.7% | 0.7% |
| INVESTED_CAPITAL | 276 | 1.4% | 1.4% |
| NET_DEBT | 276 | 1.4% | 1.4% |
| TOTAL_CAPITALIZATION | 276 | 1.4% | 1.4% |
| AMORTIZATION_EXPENSE | 276 | 2.5% | 2.5% |
| STOCK_COMPENSATION | 276 | 2.9% | 2.9% |
| INVESTMENTS | 276 | 3.6% | 3.6% |
| TREASURY_SHARES | 276 | 5.1% | 5.1% |
| TREASURY_TRANSACTIONS_CASH | 276 | 5.1% | 5.1% |
| SHARE_PREMIUM | 276 | 5.4% | 5.8% |
| GOODWILL | 276 | 6.9% | 7.6% |
| CAPITAL_INCREASES_CASH | 276 | 7.3% | 7.3% |
| INTANGIBLE_ASSETS | 276 | 7.6% | 8.0% |
| INTEREST_PAID_CF | 276 | 8.3% | 9.4% |
| OTHER_PAYABLES | 276 | 9.1% | 10.1% |
| LEASE_LIABILITIES_NONCURRENT | 276 | 9.4% | 9.4% |
| FX_EFFECT_CASH | 276 | 9.8% | 9.8% |

## 6. الحداثة / Freshness

| البند / Item | القيمة / Value |
|---|---:|
| أحدث periodEnd في السوق / Market freshest periodEnd | 2026-09-30 |
| شركات لديها فترة / Companies with latest period | 275 |
| متأخرة > 365 يوم / Stale > 365 days | 55 |

**أمثلة المتأخرة / Stale examples:** SIMO(FY 2013, 4874d), APPC(FY 2015, 3960d), NOAF(FY 2015, 3960d), NCEM(FY 2017, 3413d), DCCC(FY 2018, 3048d), POCO(FY 2018, 3048d), WATP(FY 2018, 2864d), DIFC(FY 2019, 2499d), EITP(FY 2019, 2499d), SUCE(FY 2019, 2499d), TORA(FY 2019, 2499d), ALEX(Q2 2020, 2317d), NCGC(FY 2020, 2317d), RMTV(FY 2020, 2133d), SMPP(FY 2020, 2133d), GETO(FY 2021, 1768d), GTHE(FY 2021, 1768d), GOCO(FY 2022, 1403d), PTCC(FY 2022, 1403d), TRST(FY 2022, 1403d), DCRC(9M 2023, 1130d), ARPI(FY 2023, 1038d), ESRS(FY 2023, 1038d), IRAX(Q2 2024, 856d), UASG(FY 2024, 856d), ACRO(FY 2024, 672d), AIHC(FY 2024, 672d), ELNA(Q3 2025, 672d), EPPK(FY 2024, 672d), GPPL(FY 2024, 672d) … (+25)

## 7. بيانات السوق / Market data

| البند / Item | القيمة / Value |
|---|---:|
| إجمالي الملاحظات / Observations | 12343 |
| شركات لديها سعر / Companies with price | 260 |
| شركات بلا سعر / Without price | 16 |
| حديثة ≤ 7 أيام / Fresh ≤ 7d | 259 |
| متأخرة > 7 أيام / Stale > 7d | 1 |
| Demo | 0 |

**المصادر / Sources:** TRADINGVIEW_SCANNER: 270 · THNDR_MARKETWATCH: 229 · YAHOO_FINANCE_API: 11844  
**بلا سعر / No price:** ACRO, AIHC, ARPI, ARVA, DIFC, ESRS, GETO, GOCO, MKIT, NAPR, NCEM, NOAF, PTCC, SIMO, TRST, UASG  
**أسعار متأخرة / Stale prices:** ECSC

## 8. الحسابات / Calculations

| الحالة / Status | العدد / Rows |
|---|---:|
| Total | 270783 |
| OK | 98145 |
| DATA_UNAVAILABLE | 166605 |
| NOT_APPLICABLE | 6033 |
| NOT_COMPUTABLE | 0 |

**أعلى تغطية حسب الكود / Top codes:** book_value_per_share:275 · debt_to_equity:275 · dividend_yield:275 · ebitda:275 · eps:275 · financing_cash_flow:275 · gross_margin:275 · inventory:275 · investing_cash_flow:275 · liabilities_to_equity:275 · long_term_debt:275 · market_cap:275 · net_margin:275 · net_profit:275 · non_current_assets:275

## 9. التعارضات والتدقيق / Conflicts and audit

| البند / Item | القيمة / Value |
|---|---:|
| NEEDS_REVIEW values | 18986 |
| FAILED values | 0 |
| Audit run | cmw0ynprx0000bxs4jc3tp4im |
| Audit started | 2026-11-03T17:27:38.282Z |

**Severity:** critical: 42 · high: 292 · low: 949 · medium: 691  
**Categories:** accounting: 839 · logical: 137 · missing: 457 · outlier: 3 · provenance: 19 · sector: 26 · temporal: 493

## 10. الفجوات ذات الأولوية / Priority gaps

- شركات بلا تقرير موثوق / No trusted report: **1**
- شركات بلا تقرير سنوي / No annual report: **5**
- شركات ينقصها مقياس منطبق واحد على الأقل / Missing ≥1 applicable metric: **113**
- شركات ينقصها مقياس أساسي / Missing core metric: **10**
- ISIN مفقود / Missing ISIN: **18**
- بلا سعر / No price: **16**
- سعر متأخر / Stale price: **1**
- فترة متأخرة / Stale period: **55**

### شركات ينقصها مقياس أساسي / Companies missing a core metric

| Ticker | Sector | Latest annual | Missing applicable metrics |
|---|---|---|---|
| KORA | Construction | — | REVENUE, COGS, GROSS_PROFIT, OPERATING_INCOME, NET_PROFIT, TOTAL_ASSETS, TOTAL_LIABILITIES, TOTAL_EQUITY, OPERATING_CASH_FLOW |
| NOAF | Real Estate | FY 2015 | REVENUE, COGS, GROSS_PROFIT, OPERATING_INCOME, NET_PROFIT, TOTAL_EQUITY, OPERATING_CASH_FLOW |
| AMII | Industrial | — | NET_PROFIT, TOTAL_ASSETS, TOTAL_LIABILITIES, TOTAL_EQUITY, OPERATING_CASH_FLOW |
| EGREF | Financial Services | — | NET_PROFIT, TOTAL_ASSETS, TOTAL_LIABILITIES, TOTAL_EQUITY, OPERATING_CASH_FLOW |
| APPC | Healthcare | FY 2015 | REVENUE, COGS, OPERATING_INCOME, NET_PROFIT |
| GOCO | Travel & Leisure | FY 2022 | REVENUE, COGS, OPERATING_INCOME, TOTAL_ASSETS |
| GOUR | Consumer | FY 2024 | COGS, OPERATING_INCOME, TOTAL_EQUITY, OPERATING_CASH_FLOW |
| SIMO | Paper | FY 2013 | OPERATING_INCOME, NET_PROFIT, TOTAL_EQUITY, OPERATING_CASH_FLOW |
| CPME | Financial Services | — | TOTAL_ASSETS, TOTAL_LIABILITIES, TOTAL_EQUITY |
| GTEX | Textiles | FY 2025 | OPERATING_INCOME, NET_PROFIT |

---

## المنهجية / Methodology

- القيم “الموثوقة” = `VALID` + سياسة النزاهة (لا نسخ مرحّلة، لا صفر بديل على مقاييس لا يصح أن تكون صفراً، لا قيم معزولة).
- التقرير الموثوق = غير محذوف + حالة معالجة ضمن VALIDATED/APPROVED/EXTRACTED + periodEnd ليس مستقبلياً.
- تفضيل consolidated على standalone لكل شركة، دون خلط.
- الحداثة تُقاس من periodEnd وليس من تاريخ الاسترجاع؛ السوق قد يكون مغلقاً.
- المقامات القطاعية: البنوك والشركات المالية لا تُطالب بالإيرادات التقليدية.
- لا يتم تحويل المفقود إلى صفر، ولا تُعد القيم المحجورة “مكتملة”.
