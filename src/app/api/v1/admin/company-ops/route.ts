import { NextRequest } from "next/server"
import { invalidateServerCache } from "@/lib/server-cache"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { recomputeCompany } from "@/lib/financial/recompute"

// Admin company management API
// GET    ?action=list — list all companies with data status
// PATCH  — update company { id, ticker?, nameEn?, nameAr?, sector? }
// DELETE ?ticker=XXX — hard delete company + all data
// POST   — manual financial data entry

const METRIC_LABELS: Record<string, string> = {
  REVENUE: "الإيرادات", COGS: "تكلفة المبيعات", GROSS_PROFIT: "إجمالي الربح",
  OPERATING_INCOME: "الربح التشغيلي", PROFIT_BEFORE_TAX: "الربح قبل الضريبة",
  INCOME_TAX: "مصروف الضريبة", NET_PROFIT: "صافي الربح",
  TOTAL_ASSETS: "إجمالي الأصول", CURRENT_ASSETS: "الأصول المتداولة",
  NON_CURRENT_ASSETS: "الأصول غير المتداولة", TOTAL_LIABILITIES: "إجمالي الالتزامات",
  TOTAL_EQUITY: "حقوق المساهمين", CASH_AND_EQUIVALENTS: "النقد وما في حكمه",
  TOTAL_DEBT: "إجمالي الدين", OPERATING_CASH_FLOW: "التدفق النقدي التشغيلي",
  EPS: "ربحية السهم", SHARES_OUTSTANDING: "عدد الأسهم",
  DEPRECIATION: "الإهلاك", FINANCE_COST: "تكاليف التمويل",
}

const STMT_OF: Record<string, string> = {
  REVENUE: "INCOME_STATEMENT", COGS: "INCOME_STATEMENT", GROSS_PROFIT: "INCOME_STATEMENT",
  OPERATING_INCOME: "INCOME_STATEMENT", PROFIT_BEFORE_TAX: "INCOME_STATEMENT",
  INCOME_TAX: "INCOME_STATEMENT", NET_PROFIT: "INCOME_STATEMENT",
  FINANCE_COST: "INCOME_STATEMENT", DEPRECIATION: "INCOME_STATEMENT",
  TOTAL_ASSETS: "BALANCE_SHEET", CURRENT_ASSETS: "BALANCE_SHEET",
  NON_CURRENT_ASSETS: "BALANCE_SHEET", TOTAL_LIABILITIES: "BALANCE_SHEET",
  TOTAL_EQUITY: "BALANCE_SHEET", CASH_AND_EQUIVALENTS: "BALANCE_SHEET",
  TOTAL_DEBT: "BALANCE_SHEET",
  OPERATING_CASH_FLOW: "CASH_FLOW",
  EPS: "INCOME_STATEMENT", SHARES_OUTSTANDING: "BALANCE_SHEET",
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: {
      id: true, ticker: true, nameEn: true, nameAr: true, sector: true,
      sharesOutstanding: true,
      _count: { select: { reports: true, values: true, marketPrices: true } },
    },
    orderBy: { ticker: "asc" },
  })
  return Response.json({ companies })
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const body = await req.json()
  const { id, ticker, nameEn, nameAr, sector } = body
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  const data: Record<string, string> = {}
  if (ticker) {
    const dup = await db.company.findFirst({ where: { ticker, id: { not: id } } })
    if (dup) return Response.json({ error: "ticker already exists" }, { status: 409 })
    data.ticker = ticker.trim().toUpperCase()
  }
  if (nameEn) data.nameEn = nameEn
  if (nameAr !== undefined) data.nameAr = nameAr || null
  if (sector) data.sector = sector
  if (!Object.keys(data).length) return Response.json({ error: "nothing to update" }, { status: 400 })

  const updated = await db.company.update({ where: { id }, data })
  await audit("COMPANY_UPDATE", { actor: "admin", entityType: "Company", entityId: id, details: `Updated: ${JSON.stringify(data)}` })
  return Response.json({ ok: true, company: updated })
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const ticker = new URL(req.url).searchParams.get("ticker")
  if (!ticker) return Response.json({ error: "ticker required" }, { status: 400 })
  const co = await db.company.findUnique({ where: { ticker }, include: { _count: { select: { reports: true, values: true } } } })
  if (!co) return Response.json({ error: "not found" }, { status: 404 })
  await db.company.delete({ where: { id: co.id } })
  await audit("COMPANY_DELETE", { actor: "admin", entityType: "Company", entityId: co.id, details: `Deleted ${ticker} (${co.nameEn}) — ${co._count.reports} reports, ${co._count.values} values cascade-deleted` })
  return Response.json({ ok: true, deleted: ticker })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const body = await req.json()
  const { ticker, periodType, fiscalYear, periodLabel, periodEnd, values } = body
  if (!ticker || !periodType || !fiscalYear || !periodLabel || !values || typeof values !== "object") {
    return Response.json({ error: "ticker, periodType, fiscalYear, periodLabel, periodEnd, values required" }, { status: 400 })
  }
  const co = await db.company.findUnique({ where: { ticker } })
  if (!co) return Response.json({ error: "company not found" }, { status: 404 })

  const endMd: Record<string, string> = { ANNUAL: "-12-31", SEMIANNUAL: "-06-30", QUARTERLY: "-03-31", NINE_MONTH: "-09-30" }
  const periodEndDate = periodEnd ? new Date(periodEnd) : new Date(fiscalYear + (endMd[periodType] || "-12-31"))

  // check for existing report with same key
  const existing = await db.financialReport.findFirst({
    where: { companyId: co.id, periodType, periodLabel, statementType: "CONSOLIDATED", processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] } },
  })
  if (existing) return Response.json({ error: "report already exists for this period", reportId: existing.id }, { status: 409 })

  const rep = await db.financialReport.create({ data: {
    companyId: co.id,
    reportType: periodType === "ANNUAL" ? "ANNUAL" : "INTERIM",
    periodType, statementType: "CONSOLIDATED",
    fiscalYear, periodLabel, periodEnd: periodEndDate,
    language: "AR", sourceName: "Manual Entry (Admin)",
    processingStatus: "APPROVED", approvedBy: "admin", approvedAt: new Date(),
    extractionMethod: "MANUAL_ENTRY", parserVersion: "manual@1", extractionConfidence: 1,
    isDemoData: false, documentType: "MANUAL_ENTRY",
    notes: "Manually entered by admin via website UI",
  }})

  let valueCount = 0
  for (const [code, val] of Object.entries(values)) {
    const num = parseFloat(String(val))
    if (!isFinite(num) || !METRIC_LABELS[code]) continue
    await db.financialValue.create({ data: {
      companyId: co.id, reportId: rep.id, metricCode: code,
      originalLabel: METRIC_LABELS[code], value: num, currency: "EGP", unit: "UNIT",
      normalizedValue: num, statementType: STMT_OF[code] || "OTHER", subPeriod: "CURRENT",
      extractionMethod: "MANUAL_ENTRY", confidence: 1, validationStatus: "VALID",
      validationNotes: "Manually entered by admin", isDemoData: false,
    }})
    valueCount++
  }

  await audit("MANUAL_DATA_ENTRY", { actor: "admin", entityType: "Company", entityId: co.id, details: `Manual data: ${ticker} ${periodLabel} — ${valueCount} values` })
  await recomputeCompany(co.id)

    invalidateServerCache()
  return Response.json({ ok: true, reportId: rep.id, valuesEntered: valueCount, periodLabel })
}
