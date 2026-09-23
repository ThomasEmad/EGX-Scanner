import { NextRequest } from "next/server"
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { reportPeriodKey } from "@/lib/financial/periods"

// GET /api/v1/reports — report list with filters + pagination
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const companyId = url.searchParams.get("companyId") || ""
  const status = url.searchParams.get("status") || ""
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 15) || 15))

  const where: Record<string, unknown> = {}
  if (companyId) where.companyId = companyId
  if (status) where.processingStatus = status

  const [total, reports] = await Promise.all([
    db.financialReport.count({ where }),
    db.financialReport.findMany({
      where,
      include: {
        company: { select: { ticker: true, nameEn: true, nameAr: true } },
        _count: { select: { values: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return Response.json({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    reports: reports.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      company: r.company,
      reportType: r.reportType,
      periodType: r.periodType,
      periodLabel: r.periodLabel,
      fiscalYear: r.fiscalYear,
      periodEnd: r.periodEnd,
      publicationDate: r.publicationDate,
      sourceName: r.sourceName,
      processingStatus: r.processingStatus,
      extractionMethod: r.extractionMethod,
      fileHash: r.fileHash,
      fileSize: r.fileSize,
      version: r.version,
      isRestatement: r.isRestatement,
      isDemoData: r.isDemoData,
      notes: r.notes,
      valueCount: r._count.values,
      createdAt: r.createdAt,
    })),
  })
}

// POST /api/v1/reports — manual upload (admin). Pipeline start:
// upload → SHA-256 checksum → duplicate check → store → NEW_DOWNLOADED.
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return unauthorizedResponse()

  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: "VALIDATION", message: "Expected multipart form data" }, { status: 400 })

  const file = form.get("file") as File | null
  const companyId = (form.get("companyId") as string) || ""
  const reportType = (form.get("reportType") as string) || "INTERIM"
  const periodType = (form.get("periodType") as string) || "QUARTERLY"
  const fiscalYear = Number(form.get("fiscalYear"))
  const periodLabel = ((form.get("periodLabel") as string) || "").trim()
  const periodStartRaw = (form.get("periodStart") as string) || ""
  const periodEndRaw = (form.get("periodEnd") as string) || ""
  const publicationDateRaw = (form.get("publicationDate") as string) || ""
  const sourceName = ((form.get("sourceName") as string) || "Manual upload").trim()

  if (!file || !companyId || !fiscalYear || !periodLabel || !periodEndRaw) {
    return Response.json(
      { error: "VALIDATION", message: "file, companyId, fiscalYear, periodLabel and periodEnd are required" },
      { status: 400 }
    )
  }

  const company = await db.company.findUnique({ where: { id: companyId } })
  if (!company) return Response.json({ error: "NOT_FOUND", message: "Unknown company" }, { status: 404 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileHash = createHash("sha256").update(buffer).digest("hex")

  // ---- Duplicate protection (spec #13): do not process the same file again ----
  const duplicate = await db.financialReport.findUnique({ where: { fileHash } })
  if (duplicate) {
    await audit("UPLOAD_DUPLICATE", {
      actor: "admin",
      entityType: "FinancialReport",
      entityId: duplicate.id,
      details: `Duplicate upload rejected (hash ${fileHash.slice(0, 12)}…) — existing report ${duplicate.periodLabel}`,
    })
    return Response.json(
      {
        error: "DUPLICATE",
        message: `Duplicate detected: this exact document was already uploaded as "${duplicate.periodLabel}" (${duplicate.processingStatus}). The same file is not processed again.`,
        existingReport: { id: duplicate.id, periodLabel: duplicate.periodLabel, processingStatus: duplicate.processingStatus },
      },
      { status: 409 }
    )
  }

  // store file on disk (raw reports are treated as valuable source data)
  const storageDir = process.env.EGX_STORAGE_DIR || path.join(process.cwd(), "storage", "reports")
  await mkdir(storageDir, { recursive: true })
  const safeExt = path.extname(file.name || "").slice(0, 10) || ".bin"
  const storedName = `${fileHash.slice(0, 24)}${safeExt}`
  const storedPath = path.join(storageDir, storedName)
  await writeFile(storedPath, buffer)

  const report = await db.financialReport.create({
    data: {
      companyId,
      reportType,
      periodType,
      fiscalYear,
      periodLabel,
      periodStart: periodStartRaw ? new Date(periodStartRaw) : null,
      periodEnd: new Date(periodEndRaw),
      publicationDate: publicationDateRaw ? new Date(publicationDateRaw) : null,
      sourceName,
      localFileRef: storedPath,
      fileHash,
      fileSize: buffer.length,
      processingStatus: "NEW_DOWNLOADED",
      isDemoData: false,
      notes: `Uploaded file: ${file.name}`,
    },
  })

  await audit("UPLOAD", {
    actor: "admin",
    entityType: "FinancialReport",
    entityId: report.id,
    details: `${company.ticker} ${periodLabel} — ${file.name} (${buffer.length} bytes, sha256 ${fileHash.slice(0, 12)}…)`,
  })

  return Response.json(
    {
      report: {
        id: report.id,
        periodLabel: report.periodLabel,
        processingStatus: report.processingStatus,
        fileHash: report.fileHash,
        periodKey: reportPeriodKey(report),
      },
    },
    { status: 201 }
  )
}
