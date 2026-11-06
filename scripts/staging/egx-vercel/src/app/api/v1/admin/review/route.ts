import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { recomputeCompany } from "@/lib/financial/recompute"
import { invalidateServerCache } from "@/lib/server-cache"

// GET  /api/v1/admin/review            → review queue: reports holding quarantined values
// GET  /api/v1/admin/review?reportId=  → one report: full meta + every value with its status/notes
// POST /api/v1/admin/review            → actions: approve_report | delete_review_values |
//                                        promote_values | reject_report
//
// The review queue powers the admin approval workflow: an operator inspects the
// quarantined (NEEDS_REVIEW) values, then either approves the report as-is,
// deletes the invented values (freeing slots for re-import), promotes false
// positives back to VALID, or rejects the whole report.

const TRUSTED = ["VALIDATED", "APPROVED", "EXTRACTED"]

function quarantineReason(note: string | null | undefined): string | null {
  if (!note) return null
  const m = note.match(/AUDIT_QUARANTINE:\s*([^—(]+)/)
  if (!m) return null
  return m[1].trim().slice(0, 60)
}

function shortNote(note: string | null | undefined, max = 140): string | null {
  if (!note) return null
  return note.length > max ? `${note.slice(0, max)}…` : note
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const url = new URL(req.url)
  const reportId = url.searchParams.get("reportId")

  // ---- single report detail -------------------------------------------------
  if (reportId) {
    const rep = await db.financialReport.findUnique({
      where: { id: reportId },
      select: {
        id: true, companyId: true, periodType: true, periodLabel: true, fiscalYear: true,
        statementType: true, sourceName: true, sourceUrl: true, processingStatus: true,
        extractionMethod: true, parserVersion: true, createdAt: true, approvedAt: true,
        company: { select: { ticker: true, nameEn: true, nameAr: true } },
        values: {
          select: {
            id: true, metricCode: true, originalLabel: true, value: true, normalizedValue: true,
            unit: true, currency: true, subPeriod: true, statementType: true,
            validationStatus: true, validationNotes: true, extractionMethod: true, updatedAt: true,
          },
          orderBy: [{ statementType: "asc" }, { metricCode: "asc" }],
        },
      },
    })
    if (!rep) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
    return Response.json({
      report: {
        ...rep,
        values: rep.values.map((v) => ({ ...v, validationNotes: shortNote(v.validationNotes) })),
      },
    })
  }

  // ---- queue ----------------------------------------------------------------
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 60) || 60, 200)
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0)

  // reports holding at least one quarantined value
  const groups = await db.financialValue.groupBy({
    by: ["reportId"],
    where: { validationStatus: "NEEDS_REVIEW", report: { deletedAt: null, processingStatus: { in: TRUSTED } } },
    _count: { _all: true },
    orderBy: { _count: { reportId: "desc" } },
    take: limit + 40,
    skip: offset,
  })
  const ids = groups.map((g) => g.reportId)
  if (!ids.length) return Response.json({ queue: [], total: 0 })

  const [reports, validCounts, notes] = await Promise.all([
    db.financialReport.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, periodType: true, periodLabel: true, fiscalYear: true, sourceName: true,
        processingStatus: true, createdAt: true,
        company: { select: { ticker: true, nameEn: true, nameAr: true } },
        _count: { select: { values: true } },
      },
    }),
    db.financialValue.groupBy({
      by: ["reportId"],
      where: { reportId: { in: ids }, validationStatus: "VALID" },
      _count: { _all: true },
    }),
    db.financialValue.findMany({
      where: { reportId: { in: ids }, validationStatus: "NEEDS_REVIEW" },
      select: { reportId: true, validationNotes: true },
    }),
  ])

  const validBy = new Map(validCounts.map((v) => [v.reportId, v._count._all]))
  const reasonsBy = new Map<string, Map<string, number>>()
  for (const n of notes) {
    const r = quarantineReason(n.validationNotes)
    if (!r) continue
    const m = reasonsBy.get(n.reportId) ?? new Map()
    m.set(r, (m.get(r) ?? 0) + 1)
    reasonsBy.set(n.reportId, m)
  }

  const queue = reports
    .map((r) => ({
      id: r.id,
      ticker: r.company.ticker,
      nameEn: r.company.nameEn,
      nameAr: r.company.nameAr,
      periodType: r.periodType,
      periodLabel: r.periodLabel,
      fiscalYear: r.fiscalYear,
      sourceName: r.sourceName,
      processingStatus: r.processingStatus,
      createdAt: r.createdAt,
      valuesTotal: r._count.values,
      valuesValid: validBy.get(r.id) ?? 0,
      valuesReview: groups.find((g) => g.reportId === r.id)?._count._all ?? 0,
      topReasons: [...(reasonsBy.get(r.id) ?? new Map()).entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => ({ reason, count })),
    }))
    .sort((a, b) => b.valuesReview - a.valuesReview)

  return Response.json({ queue, total: queue.length })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const body = await req.json().catch(() => null) as {
    reportId?: string
    action?: "approve_report" | "delete_review_values" | "promote_values" | "reject_report"
    valueIds?: string[]
  } | null
  const { reportId, action } = body ?? {}
  if (!reportId || !action) {
    return Response.json({ error: "reportId and action are required" }, { status: 400 })
  }
  const rep = await db.financialReport.findUnique({
    where: { id: reportId },
    select: {
      id: true, companyId: true, periodLabel: true, processingStatus: true,
      company: { select: { ticker: true } },
    },
  })
  if (!rep) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  let result: Record<string, unknown> = { ok: true }

  if (action === "approve_report") {
    await db.financialReport.update({
      where: { id: reportId },
      data: { processingStatus: "APPROVED", approvedBy: "admin", approvedAt: new Date(), reviewedBy: "admin", reviewedAt: new Date() },
    })
    result = { ...result, processingStatus: "APPROVED" }
  } else if (action === "delete_review_values") {
    const where = {
      reportId,
      validationStatus: "NEEDS_REVIEW",
      ...(body?.valueIds?.length ? { id: { in: body.valueIds } } : {}),
    }
    const del = await db.financialValue.deleteMany({ where })
    const left = await db.financialValue.count({ where: { reportId } })
    if (left === 0) {
      await db.financialReport.update({ where: { id: reportId }, data: { deletedAt: new Date(), deletedBy: "admin", processingStatus: "REJECTED" } })
      result = { ...result, deletedValues: del.count, reportRemoved: true }
    } else {
      result = { ...result, deletedValues: del.count, valuesLeft: left }
    }
  } else if (action === "promote_values") {
    const where = {
      reportId,
      validationStatus: "NEEDS_REVIEW",
      ...(body?.valueIds?.length ? { id: { in: body.valueIds } } : {}),
    }
    const rows = await db.financialValue.findMany({ where, select: { id: true, validationNotes: true } })
    const stamp = `ADMIN_PROMOTED: admin confirmed this value as an observed actual (${new Date().toISOString().slice(0, 10)}).`
    for (const r of rows) {
      await db.financialValue.update({
        where: { id: r.id },
        data: {
          validationStatus: "VALID",
          validationNotes: `${stamp}${r.validationNotes ? ` Previous: ${shortNote(r.validationNotes, 110)}` : ""}`,
        },
      })
    }
    result = { ...result, promoted: rows.length }
  } else if (action === "reject_report") {
    await db.financialReport.update({
      where: { id: reportId },
      data: { deletedAt: new Date(), deletedBy: "admin", processingStatus: "REJECTED" },
    })
    result = { ...result, rejected: true }
  } else {
    return Response.json({ error: "UNKNOWN_ACTION" }, { status: 400 })
  }

  await recomputeCompany(rep.companyId).catch((e) => {
    console.error("recompute after review action failed:", e)
  })
  invalidateServerCache()
  await audit("REVIEW_EDIT", {
    actor: "admin",
    entityType: "FinancialReport",
    entityId: reportId,
    details: `${rep.company.ticker} ${rep.periodLabel}: ${action} → ${JSON.stringify(result)}`,
  })
  return Response.json(result)
}
