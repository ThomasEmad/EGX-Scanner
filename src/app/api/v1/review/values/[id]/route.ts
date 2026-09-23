import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { normalizeToEgp, isUnit } from "@/lib/financial/units"
import { RAW_METRIC_MAP } from "@/lib/financial/registry"
import { recomputeCompany } from "@/lib/financial/recompute"

// POST /api/v1/review/values/[id] — admin review actions: approve | edit | reject.
// Every manual correction is logged (spec #17).

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const { id } = await params
  const body = await req.json().catch(() => null)

  const value = await db.financialValue.findUnique({ where: { id } })
  if (!value) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const action = body?.action
  if (!["approve", "edit", "reject"].includes(action)) {
    return Response.json({ error: "VALIDATION", message: "action must be approve | edit | reject" }, { status: 400 })
  }

  if (action === "approve") {
    await db.financialValue.update({
      where: { id },
      data: { validationStatus: "VALID", validationNotes: (value.validationNotes ? value.validationNotes + " | " : "") + "Manually approved by admin" },
    })
    await audit("REVIEW_APPROVE", { actor: "admin", entityType: "FinancialValue", entityId: id, details: `${value.metricCode} = ${value.value} ${value.unit} approved` })
  }

  if (action === "edit") {
    const newValue = Number(body?.value)
    const newMetricCode = typeof body?.metricCode === "string" ? body.metricCode : value.metricCode
    const newUnit = typeof body?.unit === "string" && isUnit(body.unit) ? body.unit : value.unit
    if (!Number.isFinite(newValue)) {
      return Response.json({ error: "VALIDATION", message: "value must be a finite number" }, { status: 400 })
    }
    if (!RAW_METRIC_MAP[newMetricCode]) {
      return Response.json({ error: "VALIDATION", message: `Unknown metric code "${newMetricCode}"` }, { status: 400 })
    }
    await db.financialValue.update({
      where: { id },
      data: {
        value: newValue,
        unit: newUnit,
        metricCode: newMetricCode,
        normalizedValue: normalizeToEgp(newValue, newUnit),
        validationStatus: "VALID",
        validationNotes: (value.validationNotes ? value.validationNotes + " | " : "") + `Manually corrected by admin (was ${value.metricCode} = ${value.value} ${value.unit})`,
      },
    })
    await audit("REVIEW_EDIT", {
      actor: "admin",
      entityType: "FinancialValue",
      entityId: id,
      details: `Corrected ${value.metricCode} = ${value.value} ${value.unit} → ${newMetricCode} = ${newValue} ${newUnit}`,
    })
  }

  if (action === "reject") {
    await db.financialValue.update({
      where: { id },
      data: { validationStatus: "FAILED", validationNotes: (value.validationNotes ? value.validationNotes + " | " : "") + "Rejected by admin" },
    })
    await audit("REVIEW_REJECT", { actor: "admin", entityType: "FinancialValue", entityId: id, details: `${value.metricCode} = ${value.value} rejected` })
  }

  // refresh report status: if no more review items, mark validated
  const remaining = await db.financialValue.count({ where: { reportId: value.reportId, validationStatus: "NEEDS_REVIEW" } })
  const report = await db.financialReport.findUnique({ where: { id: value.reportId }, select: { processingStatus: true, companyId: true } })
  if (report && remaining === 0 && report.processingStatus === "NEEDS_REVIEW") {
    await db.financialReport.update({ where: { id: value.reportId }, data: { processingStatus: "VALIDATED" } })
  }

  const recompute = await recomputeCompany(value.companyId)
  return Response.json({ ok: true, remaining, recompute })
}
