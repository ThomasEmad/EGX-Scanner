import { NextRequest } from "next/server"
import { invalidateServerCache } from "@/lib/server-cache"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { recomputeCompany } from "@/lib/financial/recompute"

// POST /api/v1/admin/financial-ops — inline edit of financial values from the company page
// Body: { ticker, periodType, fiscalYear, periodLabel, periodEnd, values: { METRIC_CODE: number } }
// For each metric: creates FinancialValue if missing, updates if exists (correction trail preserved)

const METRIC_CODES = new Set([
  "REVENUE","COGS","GROSS_PROFIT","OPERATING_INCOME","PROFIT_BEFORE_TAX","INCOME_TAX",
  "NET_PROFIT","NET_PROFIT_PARENT","EBITDA","EBIT","FINANCE_COST","INTEREST_EXPENSE","INTEREST_INCOME",
  "NET_INTEREST_INCOME","ADMIN_EXPENSES","OPERATING_EXPENSES_TOTAL","OTHER_INCOME","OTHER_EXPENSES",
  "DILUTED_EPS","BASIC_EPS","WEIGHTED_AVG_SHARES",
  "TOTAL_ASSETS","CURRENT_ASSETS","NON_CURRENT_ASSETS","TOTAL_LIABILITIES","CURRENT_LIABILITIES",
  "NON_CURRENT_LIABILITIES","TOTAL_EQUITY","EQUITY_PARENT","NON_CONTROLLING_INTERESTS",
  "CASH_AND_EQUIVALENTS","INVENTORY","ACCOUNTS_RECEIVABLE","INVESTMENTS","SHORT_TERM_DEBT",
  "LONG_TERM_DEBT","TOTAL_DEBT","RETAINED_EARNINGS","SHARE_CAPITAL","SHARES_OUTSTANDING",
  "BOOK_VALUE_PER_SHARE","PPE","GOODWILL","INTANGIBLE_ASSETS",
  "OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","CAPEX","NET_CHANGE_IN_CASH",
  "OPENING_CASH","CLOSING_CASH","DIVIDENDS_PAID","DIVIDEND_PER_SHARE","FREE_CASH_FLOW",
  "DEPRECIATION_EXPENSE","AMORTIZATION_EXPENSE","EXTRAORDINARY_ITEMS","STOCK_COMPENSATION","FX_EFFECT_CASH",
])

const STMT_OF: Record<string, string> = {
  REVENUE:"INCOME_STATEMENT",COGS:"INCOME_STATEMENT",GROSS_PROFIT:"INCOME_STATEMENT",
  OPERATING_INCOME:"INCOME_STATEMENT",PROFIT_BEFORE_TAX:"INCOME_STATEMENT",INCOME_TAX:"INCOME_STATEMENT",
  NET_PROFIT:"INCOME_STATEMENT",NET_PROFIT_PARENT:"INCOME_STATEMENT",EBITDA:"INCOME_STATEMENT",EBIT:"INCOME_STATEMENT",
  FINANCE_COST:"INCOME_STATEMENT",INTEREST_EXPENSE:"INCOME_STATEMENT",INTEREST_INCOME:"INCOME_STATEMENT",
  NET_INTEREST_INCOME:"INCOME_STATEMENT",ADMIN_EXPENSES:"INCOME_STATEMENT",OPERATING_EXPENSES_TOTAL:"INCOME_STATEMENT",
  OTHER_INCOME:"INCOME_STATEMENT",OTHER_EXPENSES:"INCOME_STATEMENT",DILUTED_EPS:"INCOME_STATEMENT",BASIC_EPS:"INCOME_STATEMENT",
  WEIGHTED_AVG_SHARES:"INCOME_STATEMENT",DEPRECIATION_EXPENSE:"INCOME_STATEMENT",AMORTIZATION_EXPENSE:"INCOME_STATEMENT",
  EXTRAORDINARY_ITEMS:"INCOME_STATEMENT",
  TOTAL_ASSETS:"BALANCE_SHEET",CURRENT_ASSETS:"BALANCE_SHEET",NON_CURRENT_ASSETS:"BALANCE_SHEET",
  TOTAL_LIABILITIES:"BALANCE_SHEET",CURRENT_LIABILITIES:"BALANCE_SHEET",NON_CURRENT_LIABILITIES:"BALANCE_SHEET",
  TOTAL_EQUITY:"BALANCE_SHEET",EQUITY_PARENT:"BALANCE_SHEET",NON_CONTROLLING_INTERESTS:"BALANCE_SHEET",
  CASH_AND_EQUIVALENTS:"BALANCE_SHEET",INVENTORY:"BALANCE_SHEET",ACCOUNTS_RECEIVABLE:"BALANCE_SHEET",
  INVESTMENTS:"BALANCE_SHEET",SHORT_TERM_DEBT:"BALANCE_SHEET",LONG_TERM_DEBT:"BALANCE_SHEET",
  TOTAL_DEBT:"BALANCE_SHEET",RETAINED_EARNINGS:"BALANCE_SHEET",SHARE_CAPITAL:"BALANCE_SHEET",
  SHARES_OUTSTANDING:"BALANCE_SHEET",BOOK_VALUE_PER_SHARE:"BALANCE_SHEET",PPE:"BALANCE_SHEET",
  GOODWILL:"BALANCE_SHEET",INTANGIBLE_ASSETS:"BALANCE_SHEET",
  OPERATING_CASH_FLOW:"CASH_FLOW",INVESTING_CASH_FLOW:"CASH_FLOW",FINANCING_CASH_FLOW:"CASH_FLOW",
  CAPEX:"CASH_FLOW",NET_CHANGE_IN_CASH:"CASH_FLOW",OPENING_CASH:"CASH_FLOW",CLOSING_CASH:"CASH_FLOW",
  DIVIDENDS_PAID:"CASH_FLOW",FREE_CASH_FLOW:"CASH_FLOW",STOCK_COMPENSATION:"CASH_FLOW",FX_EFFECT_CASH:"CASH_FLOW",
  DIVIDEND_PER_SHARE:"OTHER",
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const body = await req.json().catch(() => null)
  const { ticker, periodType, fiscalYear, periodLabel, periodEnd, values } = body || {}
  if (!ticker || !periodType || !fiscalYear || !periodLabel || !values) {
    return Response.json({ error: "ticker, periodType, fiscalYear, periodLabel, values required" }, { status: 400 })
  }
  const co = await db.company.findUnique({ where: { ticker } })
  if (!co) return Response.json({ error: "company not found" }, { status: 404 })

  const endMd: Record<string, string> = { ANNUAL:"-12-31",SEMIANNUAL:"-06-30",QUARTERLY:"-03-31",NINE_MONTH:"-09-30" }
  const periodEndDate = periodEnd ? new Date(periodEnd) : new Date(fiscalYear + (endMd[periodType] || "-12-31"))

  // find or create the report for this period
  let rep = await db.financialReport.findFirst({
    where: { companyId: co.id, periodType, periodLabel, statementType: "CONSOLIDATED", processingStatus: { in: ["VALIDATED","APPROVED","EXTRACTED"] } },
    orderBy: { version: "desc" },
  })
  let createdReport = false
  if (!rep) {
    rep = await db.financialReport.create({ data: {
      companyId: co.id, reportType: periodType === "ANNUAL" ? "ANNUAL" : "INTERIM",
      periodType, statementType: "CONSOLIDATED", fiscalYear, periodLabel,
      periodEnd: periodEndDate, language: "EN",
      sourceName: "Inline Edit (Admin)", sourceUrl: null,
      processingStatus: "APPROVED", approvedBy: "admin", approvedAt: new Date(),
      extractionMethod: "MANUAL_ENTRY", parserVersion: "inline-edit@1", extractionConfidence: 1,
      isDemoData: false, documentType: "MANUAL_ENTRY",
      notes: "Inline edited from company page by admin",
    }})
    createdReport = true
  }

  let created = 0, updated = 0, cleared = 0, skipped = 0
  for (const [code, rawVal] of Object.entries(values)) {
    if (!METRIC_CODES.has(code)) { skipped++; continue }
    const existing = await db.financialValue.findFirst({ where: { reportId: rep.id, metricCode: code } })

    if (rawVal === null || rawVal === "" || rawVal === "null") {
      // user cleared the value — delete it if it exists (don't store zeros as "real")
      if (existing) {
        await db.financialValue.delete({ where: { id: existing.id } })
        cleared++
      }
      continue
    }
    const num = parseFloat(String(rawVal))
    if (!isFinite(num)) { skipped++; continue }

    if (existing) {
      // update with correction trail
      await db.financialValue.update({ where: { id: existing.id }, data: {
        value: num, normalizedValue: num,
        originalValue: existing.originalValue ?? existing.value,
        isManuallyCorrected: true, correctedBy: "admin", correctedAt: new Date(),
        correctionReason: "Inline edit from company page",
        validationStatus: "VALID",
        extractionMethod: "MANUAL_ENTRY",
      }})
      updated++
    } else {
      await db.financialValue.create({ data: {
        companyId: co.id, reportId: rep.id, metricCode: code,
        originalLabel: code, value: num, currency: "EGP", unit: "UNIT",
        normalizedValue: num, statementType: STMT_OF[code] || "OTHER", subPeriod: "CURRENT",
        extractionMethod: "MANUAL_ENTRY", confidence: 1, validationStatus: "VALID",
        validationNotes: "Inline edited by admin", isDemoData: false,
      }})
      created++
    }
  }

  await audit("INLINE_EDIT", { actor: "admin", entityType: "Company", entityId: co.id, details: `${ticker} ${periodLabel}: ${created} created, ${updated} updated, ${cleared} cleared, ${skipped} skipped${createdReport ? " (new report)" : ""}` })
  await recomputeCompany(co.id)

    invalidateServerCache()
  return Response.json({ ok: true, ticker, periodLabel, created, updated, cleared, skipped, newReport: createdReport })
}
