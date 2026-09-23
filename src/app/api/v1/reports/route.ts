import { NextRequest } from "next/server"
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { PERIOD_TYPES, reportPeriodKey } from "@/lib/financial/periods"

// GET /api/v1/reports — report list with filters + pagination (admin review queue feed).
// Optional filters: companyId, status, statementType.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const companyId = url.searchParams.get("companyId") || ""
  const status = url.searchParams.get("status") || ""
  const statementType = url.searchParams.get("statementType") || ""
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 15) || 15))

  const where: Record<string, unknown> = {}
  if (companyId) where.companyId = companyId
  if (status) where.processingStatus = status
  if (statementType) where.statementType = statementType.toUpperCase()

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
      statementType: r.statementType,
      language: r.language,
      processingStatus: r.processingStatus,
      extractionMethod: r.extractionMethod,
      parserVersion: r.parserVersion,
      extractionConfidence: r.extractionConfidence,
      errorMessage: r.errorMessage,
      fileHash: r.fileHash,
      fileSize: r.fileSize,
      fileName: r.fileName,
      uploadedBy: r.uploadedBy,
      version: r.version,
      isRestatement: r.isRestatement,
      supersedesId: r.supersedesId,
      isDemoData: r.isDemoData,
      notes: r.notes,
      valueCount: r._count.values,
      createdAt: r.createdAt,
    })),
  })
}

// POST /api/v1/reports — manual upload (admin). Pipeline start:
// sanitize + validate → SHA-256 → exact-duplicate 409 → logical-duplicate VERSIONING
// (restatement supersedes the previous version) → store → NEW_DOWNLOADED + UPLOAD log.
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024 // 30MB
const ALLOWED_EXTENSIONS = [".pdf", ".csv", ".txt"]
const REPORT_TYPES = ["ANNUAL", "INTERIM", "OTHER"]
const STATEMENT_TYPES = ["CONSOLIDATED", "STANDALONE", "UNKNOWN"]
const LANGUAGES = ["EN", "AR", "MIXED", "UNKNOWN"]

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return unauthorizedResponse()

  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: "VALIDATION", message: "Expected multipart form data" }, { status: 400 })

  const file = form.get("file") as File | null
  const companyId = ((form.get("companyId") as string) || "").trim()
  const reportTypeRaw = (((form.get("reportType") as string) || "INTERIM") as string).trim().toUpperCase()
  const periodTypeRaw = (((form.get("periodType") as string) || "QUARTERLY") as string).trim().toUpperCase()
  const statementTypeRaw = (((form.get("statementType") as string) || "CONSOLIDATED") as string).trim().toUpperCase()
  const languageRaw = (((form.get("language") as string) || "UNKNOWN") as string).trim().toUpperCase()
  const fiscalYear = Number(form.get("fiscalYear"))
  const periodLabel = ((form.get("periodLabel") as string) || "").trim()
  const periodStartRaw = (form.get("periodStart") as string) || ""
  const periodEndRaw = (form.get("periodEnd") as string) || ""
  const publicationDateRaw = (form.get("publicationDate") as string) || ""
  const sourceName = ((form.get("sourceName") as string) || "Manual upload").trim()
  const sourceUrl = ((form.get("sourceUrl") as string) || "").trim() || null
  const notesRaw = ((form.get("notes") as string) || "").trim()

  if (!file || !companyId || !fiscalYear || !periodLabel || !periodEndRaw) {
    return Response.json(
      { error: "VALIDATION", message: "file, companyId, fiscalYear, periodLabel and periodEnd are required" },
      { status: 400 }
    )
  }
  if (!REPORT_TYPES.includes(reportTypeRaw)) {
    return Response.json({ error: "VALIDATION", message: `reportType must be one of ${REPORT_TYPES.join(" | ")}` }, { status: 400 })
  }
  if (!(PERIOD_TYPES as readonly string[]).includes(periodTypeRaw)) {
    return Response.json({ error: "VALIDATION", message: `periodType must be one of ${PERIOD_TYPES.join(" | ")}` }, { status: 400 })
  }
  if (!STATEMENT_TYPES.includes(statementTypeRaw)) {
    return Response.json({ error: "VALIDATION", message: `statementType must be one of ${STATEMENT_TYPES.join(" | ")}` }, { status: 400 })
  }
  if (!LANGUAGES.includes(languageRaw)) {
    return Response.json({ error: "VALIDATION", message: `language must be one of ${LANGUAGES.join(" | ")}` }, { status: 400 })
  }
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2100) {
    return Response.json({ error: "VALIDATION", message: "fiscalYear must be an integer between 1900 and 2100" }, { status: 400 })
  }

  const periodEnd = new Date(periodEndRaw)
  if (Number.isNaN(periodEnd.getTime())) {
    return Response.json({ error: "VALIDATION", message: "periodEnd must be a valid date (ISO string)" }, { status: 400 })
  }
  const periodStart = periodStartRaw ? new Date(periodStartRaw) : null
  if (periodStart && Number.isNaN(periodStart.getTime())) {
    return Response.json({ error: "VALIDATION", message: "periodStart must be a valid date (ISO string)" }, { status: 400 })
  }
  const publicationDate = publicationDateRaw ? new Date(publicationDateRaw) : null
  if (publicationDate && Number.isNaN(publicationDate.getTime())) {
    return Response.json({ error: "VALIDATION", message: "publicationDate must be a valid date (ISO string)" }, { status: 400 })
  }

  const company = await db.company.findUnique({ where: { id: companyId } })
  if (!company) return Response.json({ error: "NOT_FOUND", message: "Unknown company" }, { status: 404 })

  // ---- Filename sanitization (never trust client paths) ----
  const originalName = file.name || "upload"
  const baseName = path.basename(originalName)
  if (!baseName || baseName === "." || baseName === ".." || baseName.includes("..") || baseName.includes("/") || baseName.includes("\\")) {
    return Response.json({ error: "VALIDATION", message: "Invalid file name" }, { status: 400 })
  }

  // ---- Extension whitelist ----
  const ext = path.extname(baseName).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return Response.json(
      { error: "VALIDATION", message: `Unsupported file extension "${ext || "(none)"}" — allowed: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    )
  }

  // ---- Size cap ----
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: "FILE_TOO_LARGE", message: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit (${file.size} bytes)` },
      { status: 413 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: "FILE_TOO_LARGE", message: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit (${buffer.length} bytes)` },
      { status: 413 }
    )
  }

  // ---- Magic-byte check: a claimed PDF must really be a PDF ----
  if (ext === ".pdf" && !buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    return Response.json(
      { error: "VALIDATION", message: "File claims to be a PDF but does not start with the %PDF- signature — upload refused" },
      { status: 400 }
    )
  }

  const fileHash = createHash("sha256").update(buffer).digest("hex")

  // ---- Exact duplicate protection (spec #13): never process the same bytes again ----
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

  // ---- Logical duplicate → VERSIONING (restatement flow, spec #12) ----
  // Same (company, periodType, periodLabel, statementType) but different bytes = a
  // new VERSION that supersedes the previous one; history is never destroyed.
  const latestSameIdentity = await db.financialReport.findFirst({
    where: { companyId, periodType: periodTypeRaw, periodLabel, statementType: statementTypeRaw },
    orderBy: { version: "desc" },
  })
  const version = latestSameIdentity ? latestSameIdentity.version + 1 : 1
  const isRestatement = !!latestSameIdentity
  const supersedesId = latestSameIdentity ? latestSameIdentity.id : null

  // store file on disk (raw reports are treated as valuable source data)
  const storageDir = process.env.EGX_STORAGE_DIR || path.join(process.cwd(), "storage", "reports")
  await mkdir(storageDir, { recursive: true })
  const storedName = `${fileHash.slice(0, 24)}${ext}`
  const storedPath = path.join(storageDir, storedName)
  await writeFile(storedPath, buffer)

  const notes = [notesRaw, `Uploaded file: ${baseName}`].filter(Boolean).join(" | ")

  const report = await db.financialReport.create({
    data: {
      companyId,
      reportType: reportTypeRaw,
      periodType: periodTypeRaw,
      statementType: statementTypeRaw,
      fiscalYear,
      periodLabel,
      periodStart,
      periodEnd,
      publicationDate,
      language: languageRaw,
      sourceName,
      sourceUrl,
      localFileRef: storedPath,
      fileName: baseName,
      fileHash,
      fileSize: buffer.length,
      processingStatus: "NEW_DOWNLOADED",
      uploadedBy: "admin",
      version,
      isRestatement,
      supersedesId,
      isDemoData: false,
      notes,
    },
  })

  // Pipeline traceability starts at upload: record the UPLOAD stage
  await db.financialExtractionLog.create({
    data: {
      reportId: report.id,
      stage: "UPLOAD",
      level: "INFO",
      message: `Uploaded "${baseName}" (${buffer.length} bytes, sha256 ${fileHash.slice(0, 12)}…) — version ${version}${isRestatement ? `, supersedes report ${supersedesId}` : ""}; awaiting processing`,
      details: JSON.stringify({ fileName: baseName, fileSize: buffer.length, fileHash, statementType: statementTypeRaw, language: languageRaw, version }),
    },
  })

  await audit(isRestatement ? "UPLOAD_REVISION" : "UPLOAD", {
    actor: "admin",
    entityType: "FinancialReport",
    entityId: report.id,
    details: isRestatement
      ? `${company.ticker} ${periodLabel} REVISION v${version} supersedes v${latestSameIdentity!.version} — ${baseName} (${buffer.length} bytes, sha256 ${fileHash.slice(0, 12)}…, ${statementTypeRaw})`
      : `${company.ticker} ${periodLabel} — ${baseName} (${buffer.length} bytes, sha256 ${fileHash.slice(0, 12)}…, ${statementTypeRaw})`,
  })

  return Response.json(
    {
      report: {
        id: report.id,
        periodLabel: report.periodLabel,
        processingStatus: report.processingStatus,
        fileHash: report.fileHash,
        periodKey: reportPeriodKey(report),
        statementType: report.statementType,
        language: report.language,
        version: report.version,
        isRestatement: report.isRestatement,
        supersedesId: report.supersedesId,
      },
      superseded: isRestatement,
      version,
    },
    { status: 201 }
  )
}
