# Data-quality remediation queue

Audit run: `cmvtr78ll0000bxagfppv56ln` — 2026-10-29T16:24:28.976Z — 264 companies, 2216 findings.

- **Blockers (accuracy work): 58** across 35 companies
- Coverage gaps (completeness work): 608
- Full CSV: `reports/data-quality-blockers.csv` and `reports/data-quality-coverage.csv`

## Blockers by root cause

| Root cause | Count | Recommended action |
|---|---:|---|
| BS_COMPONENTS — Balance sheet components mismatch | 18 | Re-map current/non-current components from the source statement |
| CF_IDENTITY — Cash-flow identity | 14 | Add FX effect on cash or correct the cash-flow legs |
| IS_GROSS_PROFIT — Gross profit identity | 11 | Confirm COGS sign and gross-profit line; quarantine sign inversions |
| IS_TAX_BASIS — Tax / net-profit basis | 7 | Check minority interest and attributable-vs-total net profit |
| BS_MAPPING — Balance-sheet line mis-mapped | 3 | Re-extract the mis-mapped line (liabilities/equity) from the original statement |
| BS_IDENTITY — Balance sheet does not balance | 3 | Verify minority interest / total-liabilities mapping against the filing |
| IS_MARGIN — Impossible margin | 2 | Review revenue/cost mapping and company sector |

### BS_COMPONENTS — Balance sheet components mismatch (18)

_Re-map current/non-current components from the source statement_

- **ASPI** FY 2023 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 27.5M vs TOTAL_ASSETS = 1.44B (98.09%) — missing/extra component or mapping gap.
- **ASPI** FY 2024 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 94.3M vs TOTAL_ASSETS = 2.56B (96.31%) — missing/extra component or mapping gap.
- **COPR** FY 2023 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 531.4K vs TOTAL_ASSETS = 93.9M (99.43%) — missing/extra component or mapping gap.
- **EFIC** FY 2025 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 5.55B vs TOTAL_ASSETS = 11.77B (52.86%) — missing/extra component or mapping gap.
- **MFPC** FY 2021 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 22.29B vs TOTAL_ASSETS = 26.76B (16.69%) — missing/extra component or mapping gap.
- **MFPC** FY 2022 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 35.98B vs TOTAL_ASSETS = 43.81B (17.86%) — missing/extra component or mapping gap.
- **NCEM** FY 2012 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 1.15B vs TOTAL_ASSETS = 1.46B (21.05%) — missing/extra component or mapping gap.
- **NDRL** FY 2020 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 48.9M vs TOTAL_ASSETS = 36.6M (33.33%) — missing/extra component or mapping gap.
- **NDRL** FY 2022 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 64.2M vs TOTAL_ASSETS = 53.5M (20.00%) — missing/extra component or mapping gap.
- **NDRL** FY 2023 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 55.2M vs TOTAL_ASSETS = 66.2M (16.67%) — missing/extra component or mapping gap.
- **RMTV** FY 2013 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 573.0M vs TOTAL_ASSETS = 477.5M (20.00%) — missing/extra component or mapping gap.
- **RTVC** FY 2021 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 8.19B vs TOTAL_ASSETS = 9.59B (14.61%) — missing/extra component or mapping gap.
- **SCTS** FY 2017 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 1.89B vs TOTAL_ASSETS = 1.68B (12.50%) — missing/extra component or mapping gap.
- **SCTS** FY 2019 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 1.99B vs TOTAL_ASSETS = 1.81B (10.00%) — missing/extra component or mapping gap.
- **SMPP** FY 2012 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 502.7M vs TOTAL_ASSETS = 586.5M (14.29%) — missing/extra component or mapping gap.
- **SPHT** FY 2022 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 387.9M vs TOTAL_ASSETS = 39.2M (889.16%) — missing/extra component or mapping gap.
- **UEGC** FY 2021 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 19.19B vs TOTAL_ASSETS = 832.2M (2206.09%) — missing/extra component or mapping gap.
- **UEGC** FY 2024 — [ASSET_COMPONENTS] ASSET_COMPONENTS FAILED: CURRENT_ASSETS+NON_CURRENT_ASSETS = 2.89B vs TOTAL_ASSETS = 3.79B (23.74%) — missing/extra component or mapping gap.

### CF_IDENTITY — Cash-flow identity (14)

_Add FX effect on cash or correct the cash-flow legs_

- **ASCM** FY 2023 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 147.13% (239.8M EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.
- **ATQA** FY 2024 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 200.00% (4.32B EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.
- **COSG** FY 2023 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 200.01% (49.8M EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.
- **COSG** FY 2024 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 200.00% (261.5M EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.
- **DSCW** FY 2024 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 116.36% (1.20B EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.
- **EGAS** FY 2022 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 176.18% (2.12B EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX effect 3.5M tested; verify the cash-flow statement.
- **MAAL** FY 2022 — [CASH_OPENING_CLOSING] CASH_OPENING_CLOSING FAILED: gap 75.98% (75.4M EGP; materiality threshold 992.1K) on [OPENING_CASH, CLOSING_CASH, NET_CHANGE_IN_CASH]. The difference is often the FX effect on cash.
- **MAAL** FY 2023 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 99.96% (5.26B EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.
- **MFPC** FY 2023 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 146.51% (5.05B EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX effect 1.34B tested; verify the cash-flow statement.
- **MIPH** FY 2024 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 21.15% (278.4M EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.
- **OCDI** FY 2025 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 166.82% (10.18B EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.
- **OLFI** FY 2024 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 161.57% (1.15B EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.
- **PHDC** FY 2022 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 128.01% (1.80B EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.
- **UEGC** FY 2021 — [CASH_FLOW_SUM] CASH_FLOW_SUM FAILED: gap 177.81% (528.3M EGP) — net change is corroborated by opening/closing cash, so the legs are incomplete; FX_EFFECT_CASH not disclosed; verify the cash-flow statement.

### IS_GROSS_PROFIT — Gross profit identity (11)

_Confirm COGS sign and gross-profit line; quarantine sign inversions_

- **AMER** Q2 2026 — [GROSS_PROFIT_IDENTITY] GROSS_PROFIT_IDENTITY FAILED: gap 127.04% (-344.4M EGP; materiality threshold 5.4M) on [REVENUE, COGS, GROSS_PROFIT]. Check the COGS sign and whether the gross-profit line is before/after other operating items.
- **DAPH** FY 2025 — [GROSS_PROFIT_IDENTITY] GROSS_PROFIT_IDENTITY FAILED: gap 13.31% (77.4M EGP; materiality threshold 11.6M) on [REVENUE, COGS, GROSS_PROFIT]. Check the COGS sign and whether the gross-profit line is before/after other operating items.
- **FWRY** FY 2019 — [GROSS_PROFIT_IDENTITY] GROSS_PROFIT_IDENTITY FAILED: gap 20.00% (-187.4M EGP; materiality threshold 18.7M) on [REVENUE, COGS, GROSS_PROFIT]. Check the COGS sign and whether the gross-profit line is before/after other operating items.
- **IRON** FY 2011 — [GROSS_PROFIT_IDENTITY] GROSS_PROFIT_IDENTITY FAILED: gap 22.50% (712.5M EGP; materiality threshold 63.3M) on [REVENUE, COGS, GROSS_PROFIT]. Check the COGS sign and whether the gross-profit line is before/after other operating items.
- **IRON** FY 2018 — [GROSS_PROFIT_IDENTITY] GROSS_PROFIT_IDENTITY FAILED: gap 79.65% (2.19B EGP; materiality threshold 54.9M) on [REVENUE, COGS, GROSS_PROFIT]. Check the COGS sign and whether the gross-profit line is before/after other operating items.
- **MPCO** FY 2022 — [GROSS_PROFIT_IDENTITY] GROSS_PROFIT_IDENTITY FAILED: gap 28.51% (48.1M EGP; materiality threshold 3.4M) on [REVENUE, COGS, GROSS_PROFIT]. Check the COGS sign and whether the gross-profit line is before/after other operating items.
- **NCEM** FY 2014 — [GROSS_PROFIT_IDENTITY] GROSS_PROFIT_IDENTITY FAILED: gap 16.67% (189.2M EGP; materiality threshold 22.7M) on [REVENUE, COGS, GROSS_PROFIT]. Check the COGS sign and whether the gross-profit line is before/after other operating items.
- **SPHT** FY 2021 — [GROSS_PROFIT_IDENTITY] GROSS_PROFIT_IDENTITY FAILED: gap 111.29% (2.1M EGP; materiality threshold 38.4K) on [REVENUE, COGS, GROSS_PROFIT]. Check the COGS sign and whether the gross-profit line is before/after other operating items.
- **SPHT** FY 2021 — [GROSS_PROFIT_EXCEEDS_REVENUE] GROSS_PROFIT exceeds REVENUE — impossible (GP=1.9M > REV=851.2K).
- **SPHT** FY 2022 — [GROSS_PROFIT_IDENTITY] GROSS_PROFIT_IDENTITY FAILED: gap 143.02% (2.7M EGP; materiality threshold 38.2K) on [REVENUE, COGS, GROSS_PROFIT]. Check the COGS sign and whether the gross-profit line is before/after other operating items.
- **SPHT** FY 2022 — [GROSS_PROFIT_EXCEEDS_REVENUE] GROSS_PROFIT exceeds REVENUE — impossible (GP=1.9M > REV=544.6K).

### IS_TAX_BASIS — Tax / net-profit basis (7)

_Check minority interest and attributable-vs-total net profit_

- **BINV** Q2 2026 — [PBT_TAX_NET_PROFIT] PBT_TAX_NET_PROFIT FAILED: gap 76.93% (79.7M EGP; materiality threshold 1.6M) on [PROFIT_BEFORE_TAX, INCOME_TAX, NET_PROFIT]. Differences up to 25% are usually minority interest, discontinued operations or attributable-vs-total net profit.
- **EMFD** Q2 2026 — [PBT_TAX_NET_PROFIT] PBT_TAX_NET_PROFIT FAILED: gap 33.51% (890.7M EGP; materiality threshold 39.9M) on [PROFIT_BEFORE_TAX, INCOME_TAX, NET_PROFIT]. Differences up to 25% are usually minority interest, discontinued operations or attributable-vs-total net profit.
- **GIHD** FY 2024 — [PBT_TAX_NET_PROFIT] PBT_TAX_NET_PROFIT FAILED: gap 52.44% (-1.0M EGP; materiality threshold 29.9K) on [PROFIT_BEFORE_TAX, INCOME_TAX, NET_PROFIT]. Differences up to 25% are usually minority interest, discontinued operations or attributable-vs-total net profit.
- **HRHO** Q2 2026 — [PBT_TAX_NET_PROFIT] PBT_TAX_NET_PROFIT FAILED: gap 34.78% (-600.8M EGP; materiality threshold 25.9M) on [PROFIT_BEFORE_TAX, INCOME_TAX, NET_PROFIT]. Differences up to 25% are usually minority interest, discontinued operations or attributable-vs-total net profit.
- **NAHO** Q2 2026 — [PBT_TAX_NET_PROFIT] PBT_TAX_NET_PROFIT FAILED: gap 63.61% (-688.8K EGP; materiality threshold 16.2K) on [PROFIT_BEFORE_TAX, INCOME_TAX, NET_PROFIT]. Differences up to 25% are usually minority interest, discontinued operations or attributable-vs-total net profit.
- **OFH** FY 2024 — [PBT_TAX_NET_PROFIT] PBT_TAX_NET_PROFIT FAILED: gap 70.51% (-180.5M EGP; materiality threshold 3.8M) on [PROFIT_BEFORE_TAX, INCOME_TAX, NET_PROFIT]. Differences up to 25% are usually minority interest, discontinued operations or attributable-vs-total net profit.
- **OFH** FY 2025 — [PBT_TAX_NET_PROFIT] PBT_TAX_NET_PROFIT FAILED: gap 203.74% (5.9M EGP; materiality threshold 43.7K) on [PROFIT_BEFORE_TAX, INCOME_TAX, NET_PROFIT]. Differences up to 25% are usually minority interest, discontinued operations or attributable-vs-total net profit.

### BS_MAPPING — Balance-sheet line mis-mapped (3)

_Re-extract the mis-mapped line (liabilities/equity) from the original statement_

- **ASCM** FY 2021 — [BALANCE_SHEET_EQUATION] BALANCE_SHEET_EQUATION MAPPING ERROR: TOTAL_EQUITY_AND_LIABILITIES agrees with TOTAL_ASSETS (1.36B) but the L/E split leaves a -234.2M gap (15.52%) — an equity or liability line is mis-mapped.
- **SIPC** FY 2024 — [BALANCE_SHEET_EQUATION] BALANCE_SHEET_EQUATION MAPPING ERROR: TOTAL_EQUITY_AND_LIABILITIES agrees with TOTAL_ASSETS (169.0M) but the L/E split leaves a -1.89B gap (96.32%) — an equity or liability line is mis-mapped.
- **UEGC** FY 2021 — [BALANCE_SHEET_EQUATION] BALANCE_SHEET_EQUATION MAPPING ERROR: TOTAL_LIABILITIES (831.2M) is calibrated like total equity & liabilities / total assets, not liabilities (expected ≈ -203.6M). Re-extract the liabilities line.

### BS_IDENTITY — Balance sheet does not balance (3)

_Verify minority interest / total-liabilities mapping against the filing_

- **IRON** FY 2013 — [BALANCE_SHEET_EQUATION] BALANCE_SHEET_EQUATION FAILED: gap 7.89% (-273.9M EGP; materiality threshold 17.3M) on [TOTAL_ASSETS, TOTAL_LIABILITIES, TOTAL_EQUITY]. Possible non-controlling interest or a total-liabilities mapping issue.
- **NAHO** FY 2023 — [BALANCE_SHEET_EQUATION] BALANCE_SHEET_EQUATION FAILED: gap 15.38% (35.9M EGP; materiality threshold 1.2M) on [TOTAL_ASSETS, TOTAL_LIABILITIES, TOTAL_EQUITY]. Possible non-controlling interest or a total-liabilities mapping issue.
- **TALM** FY 2025 — [BALANCE_SHEET_EQUATION] BALANCE_SHEET_EQUATION FAILED: gap 18.25% (1.38B EGP; materiality threshold 37.7M) on [TOTAL_ASSETS, TOTAL_LIABILITIES, TOTAL_EQUITY]. Possible non-controlling interest or a total-liabilities mapping issue.

### IS_MARGIN — Impossible margin (2)

_Review revenue/cost mapping and company sector_

- **SPHT** FY 2021 · `GROSS_PROFIT` — [GROSS_MARGIN_IMPOSSIBLE] Gross margin 225% > 100% — impossible.
- **SPHT** FY 2022 · `GROSS_PROFIT` — [GROSS_MARGIN_IMPOSSIBLE] Gross margin 351% > 100% — impossible.
