import { NextRequest } from "next/server"
import { createHash } from "node:crypto"
import path from "node:path"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import {
  detectDocumentKind, detectReportUnit, extractFromCsv, extractFromText, extractFromPages,
  detectLanguage, detectStatementType, detectPeriod,
} from "@/lib/financial/extract"
import { parsePdf } from "@/lib/financial/pdf"

// POST /api/v1/reports/analyze — pre-upload document analysis (admin).
// DRY RUN: no database write, no file storage. Answers "what is this document and
// what would the pipeline extract from it?" before the admin commits an upload:
// kind, scanned flag, engine, language, statement type, reporting unit, detected
// period, and the candidate metric codes the registry would match.

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024 // 30MB
const ALLOWED_EXTENSIONS = [".pdf", ".csv", ".txt"]

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return unauthorizedResponse()

  const form = await req.formData().catch(() => null)
  if (!form) {
    return Response.json({ error: "VALIDATION", message: "Expected multipart form data with a `file` field" }, { status: 400 })
  }

  const file = form.get("file") as File | null
  const companyId = ((form.get("companyId") as string) || "").trim()

  if (!file) {
    return Response.json({ error: "VALIDATION", message: "file is required" }, { status: 400 })
  }

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
  const fileHash = createHash("sha256").update(buffer).digest("hex")

  const warnings: string[] = []
  const kind = detectDocumentKind(buffer)

  // ---- Optional company context (read-only — analyze never writes) ----
  let companyContext: { id: string; ticker: string; nameEn: string } | null = null
  if (companyId) {
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, ticker: true, nameEn: true },
    })
    if (company) companyContext = company
    else warnings.push("Provided companyId does not match any known company")
  }

  let fullText = ""
  let pageCount: number | null = null
  let looksScanned = false
  let engine: "unpdf" | "zlib-fallback" | null = null
  let candidates: { metricCode: string }[] = []

  if (kind === "PDF") {
    const pdf = await parsePdf(buffer)
    pageCount = pdf.pageCount
    looksScanned = pdf.looksScanned
    engine = pdf.engine
    fullText = pdf.pages.map((p) => p.text).join("\n")
    if (pdf.error) warnings.push(`PDF parser note: ${pdf.error}`)
    if (looksScanned) {
      warnings.push("Scanned or image-based PDF — no usable text layer. Processing will route this document to manual review (no OCR in this environment).")
    }
    if (!looksScanned) {
      try {
        candidates = await extractFromPages(pdf.pages)
      } catch (e) {
        warnings.push(`Page extraction failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } else if (kind === "TEXT") {
    fullText = buffer.toString("utf8")
    const hasCommas = (fullText.match(/[,;]/g)?.length ?? 0) >= 3
    candidates = hasCommas ? extractFromCsv(fullText) : extractFromText(fullText)
  } else {
    warnings.push(`Unsupported document kind (${kind}) — export the statement to PDF, CSV or TXT and try again.`)
  }

  // ---- Deterministic auto-detection over the extracted text ----
  const language = fullText ? detectLanguage(fullText) : "UNKNOWN"
  const statementType = fullText ? detectStatementType(fullText) : "UNKNOWN"
  const reportUnit = fullText ? detectReportUnit(fullText) : "UNIT"
  const period = fullText ? detectPeriod(fullText) : null

  if (candidates.length === 0 && (kind === "PDF" || kind === "TEXT")) {
    warnings.push("No registry metric labels were matched — processing will likely require manual review.")
  }
  if (!period && fullText) {
    warnings.push("No reporting period could be detected from the document text.")
  }

  const candidateCodes = [...new Set(candidates.map((c) => c.metricCode))].sort()

  return Response.json({
    ok: true,
    detection: {
      fileName: baseName,
      fileSize: buffer.length,
      fileHash,
      documentKind: kind,
      pageCount,
      looksScanned,
      engine,
      language,
      statementType,
      reportUnit,
      period,
      candidateCount: candidates.length,
      candidateCodes,
      warnings,
      ...(companyContext ? { companyId: companyContext.id, company: { ticker: companyContext.ticker, nameEn: companyContext.nameEn } } : {}),
    },
  })
}
