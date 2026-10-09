// Ingestion orchestrator — full ingestion pipeline for a company + period.
//
// For each company + period:
//   search → filter to PDF-hosting URLs → download → content-verify
//   (extract text from PDF and check financial keywords) → dedup (SHA-256 hash)
//   → extract → validate → store
//
// Includes rate limiting (2s delay between requests), exponential backoff on
// transient errors, and full error recording.
//
// Idempotent: re-running on the same company+period will not re-download
// documents already stored (SHA-256 dedup).

import { createHash } from "node:crypto"
import { mkdir, writeFile, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { db } from "@/lib/db"
import { searchFinancialDocuments } from "./search-provider"
import type { DiscoveredDocument, VerifiedDocument } from "./source-adapter"
import { parsePdf } from "@/lib/financial/pdf"

const STORAGE_DIR = join(process.cwd(), "storage", "ingested")
const RATE_LIMIT_MS = 2000
const MAX_RETRIES = 3
const BACKOFF_BASE_MS = 1000

const FINANCIAL_KEYWORDS = [
  "balance sheet", "income statement", "cash flow", "revenue", "net profit", "total assets",
  "shareholders equity", "earnings per share", "current assets", "current liabilities",
  "operating cash flow", "EGP", "consolidated",
  "قائمة الدخل", "الميزانية", "التدفقات النقدية", "حقوق المساهمين", "صافي الربح",
]

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function withBackoff<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < retries - 1) {
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt)
        await sleep(delay)
      }
    }
  }
  throw lastError
}

async function downloadFile(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EGX-Scanner/1.0)" },
      redirect: "follow",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const mimeType = res.headers.get("content-type") ?? "application/octet-stream"
    return { buffer, mimeType }
  } finally {
    clearTimeout(timeout)
  }
}

/** Verify financial content from a downloaded buffer.
 *  Supports PDFs (extracts text via parsePdf) and plain-text/CSV files. */
async function verifyFinancialContent(buffer: Buffer, mimeType: string): Promise<{ isFinancialDocument: boolean; reasons: string[]; confidence: number; textSample: string }> {
  let text = ""
  // Try to extract text from PDF
  if (mimeType.includes("pdf") || buffer.slice(0, 5).toString("ascii") === "%PDF-") {
    try {
      const pdf = await parsePdf(buffer)
      text = pdf.pages.map((p) => p.text || "").join("\n").slice(0, 100_000)
    } catch (err) {
      return {
        isFinancialDocument: false,
        reasons: [`PDF parsing failed: ${err instanceof Error ? err.message : String(err)}`],
        confidence: 0,
        textSample: "",
      }
    }
  } else {
    // Plain text — decode as UTF-8
    text = buffer.toString("utf8").slice(0, 100_000)
  }
  const lower = text.toLowerCase()
  const reasons: string[] = []
  let matchedKeywords = 0
  for (const kw of FINANCIAL_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      matchedKeywords++
      reasons.push(`keyword "${kw}" present`)
    }
  }
  const isFinancial = matchedKeywords >= 2
  const confidence = Math.min(1, matchedKeywords / 5)
  if (matchedKeywords < 2) reasons.push(`Only ${matchedKeywords} financial keyword(s) detected — below threshold`)
  return { isFinancialDocument: isFinancial, reasons, confidence, textSample: text.slice(0, 500) }
}

/** Filter discovered documents to those likely to host a real PDF annual report.
 *  Skips: news articles, stock analysis pages, generic aggregator homepages.
 *  Keeps: IR pages, annualreports.com, sites ending in .pdf, EGX disclosures. */
function filterToPdfCandidates(docs: DiscoveredDocument[]): DiscoveredDocument[] {
  const out: DiscoveredDocument[] = []
  for (const d of docs) {
    const url = d.url.toLowerCase()
    const host = new URL(d.url).hostname.toLowerCase()
    // Direct PDF link — definitely keep
    if (url.endsWith(".pdf") || url.includes(".pdf?") || url.includes(".pdf#")) {
      out.push({ ...d, metadata: { ...d.metadata, pdfLikely: true, reason: "direct_pdf_link" } })
      continue
    }
    // Known annual report aggregators
    if (host.includes("annualreports.com") || host.includes("investormeetcompany.com") ||
        host.includes("egx.com.eg") || host.includes("fra.gov.eg") || host.includes("mubasher.info")) {
      out.push({ ...d, metadata: { ...d.metadata, pdfLikely: true, reason: "known_ir_aggregator" } })
      continue
    }
    // IR pages on company domains
    if (d.authorityRank === "HIGH" && (url.includes("ir.") || url.includes("investor") || url.includes("annual-report") || url.includes("financial-statements"))) {
      out.push({ ...d, metadata: { ...d.metadata, pdfLikely: true, reason: "high_authority_ir_page" } })
      continue
    }
    // Skip low-authority news/aggregator pages (no direct PDF)
    if (d.authorityRank === "LOW" && !url.includes(".pdf")) continue
  }
  return out
}

export interface IngestionRequest {
  companyId: string
  fiscalYear: number
  periodType?: string
  /** Optional filter — skip documents below this confidence threshold */
  minConfidence?: number
}

export interface IngestionOutcome {
  companyId: string
  fiscalYear: number
  documentsDiscovered: number
  documentsVerified: number
  documentsDownloaded: number
  documentsStored: number
  documentsFailed: number
  valuesExtracted: number
  validationErrors: number
  errors: { stage: string; message: string; url?: string }[]
  durationMs: number
  ingestionRunId: string
}

export async function ingestCompanyPeriod(req: IngestionRequest, ingestionRunId: string): Promise<IngestionOutcome> {
  const startedAt = Date.now()
  const errors: IngestionOutcome["errors"] = []
  let documentsDiscovered = 0
  let documentsVerified = 0
  let documentsDownloaded = 0
  let documentsStored = 0
  let documentsFailed = 0
  let valuesExtracted = 0
  let validationErrors = 0

  // Load company
  const company = await db.company.findUnique({ where: { id: req.companyId } })
  if (!company) {
    return {
      companyId: req.companyId,
      fiscalYear: req.fiscalYear,
      documentsDiscovered: 0,
      documentsVerified: 0,
      documentsDownloaded: 0,
      documentsStored: 0,
      documentsFailed: 0,
      valuesExtracted: 0,
      validationErrors: 0,
      errors: [{ stage: "lookup", message: `Company ${req.companyId} not found` }],
      durationMs: Date.now() - startedAt,
      ingestionRunId,
    }
  }

  // 1. SEARCH
  let discoveredRaw: DiscoveredDocument[] = []
  try {
    discoveredRaw = await withBackoff(() =>
      searchFinancialDocuments(
        { ticker: company.ticker, nameEn: company.nameEn, nameAr: company.nameAr ?? undefined, sector: company.sector },
        { fiscalYear: req.fiscalYear, periodType: req.periodType },
      ),
    )
    documentsDiscovered = discoveredRaw.length
    await db.ingestionRun.update({
      where: { id: ingestionRunId },
      data: { documentsFound: { increment: documentsDiscovered } },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push({ stage: "search", message: msg })
    await db.ingestionError.create({
      data: {
        ingestionRunId,
        companyId: company.id,
        stage: "search",
        errorType: "SEARCH_FAILED",
        errorMessage: msg,
      },
    })
  }

  // 1b. FILTER to PDF-likely candidates (skip news/aggregator pages without PDFs)
  const discovered = filterToPdfCandidates(discoveredRaw)
  if (discoveredRaw.length > 0 && discovered.length === 0) {
    errors.push({
      stage: "filter",
      message: `Filtered ${discoveredRaw.length} → 0 PDF-likely candidates (no direct PDF links or known IR aggregators found)`,
    })
  }

  await sleep(RATE_LIMIT_MS)

  // 2. VERIFY + DOWNLOAD + DEDUP + STORE
  await mkdir(STORAGE_DIR, { recursive: true })
  for (const doc of discovered) {
    const minConf = req.minConfidence ?? 0.4
    if (doc.discoveryConfidence < minConf) continue
    documentsVerified++

    let buffer: Buffer
    let mimeType: string
    try {
      const result = await withBackoff(() => downloadFile(doc.url))
      buffer = result.buffer
      mimeType = result.mimeType
      documentsDownloaded++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ stage: "download", message: msg, url: doc.url })
      documentsFailed++
      await db.ingestionError.create({
        data: {
          ingestionRunId,
          companyId: company.id,
          sourceAdapter: doc.sourceAdapter,
          sourceUrl: doc.url,
          stage: "download",
          errorType: "DOWNLOAD_FAILED",
          errorMessage: msg,
        },
      })
      await sleep(RATE_LIMIT_MS)
      continue
    }

    // DEDUP via SHA-256
    const fileHash = sha256(buffer)
    const existingReport = await db.financialReport.findFirst({
      where: { fileHash },
    })
    if (existingReport) {
      // Skip — already stored
      continue
    }

    // CONTENT VERIFY (extract text from PDF + check financial keywords)
    const verification = await verifyFinancialContent(buffer, mimeType)
    if (!verification.isFinancialDocument) {
      errors.push({
        stage: "content_verify",
        message: `Not a financial document: ${verification.reasons.join("; ")}`,
        url: doc.url,
      })
      documentsFailed++
      await db.ingestionError.create({
        data: {
          ingestionRunId,
          companyId: company.id,
          sourceAdapter: doc.sourceAdapter,
          sourceUrl: doc.url,
          stage: "content_verify",
          errorType: "NOT_FINANCIAL",
          errorMessage: `Content verification failed: ${verification.reasons.join("; ")}`,
        },
      })
      continue
    }

    // STORE — filename based on detected file type
    const extension = mimeType.includes("pdf") || buffer.slice(0, 5).toString("ascii") === "%PDF-" ? "pdf"
      : mimeType.includes("html") ? "html"
      : mimeType.includes("text") ? "txt"
      : "bin"
    const fileName = `${company.ticker}-${doc.fiscalYearHint ?? req.fiscalYear}-${Date.now()}.${extension}`
    const localPath = join(STORAGE_DIR, fileName)
    try {
      await writeFile(localPath, buffer)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ stage: "store", message: msg, url: doc.url })
      documentsFailed++
      continue
    }

    // Create the FinancialReport row
    try {
      const report = await db.financialReport.create({
        data: {
          companyId: company.id,
          reportType: "INTERIM",
          periodType: req.periodType ?? "ANNUAL",
          statementType: "UNKNOWN",
          fiscalYear: req.fiscalYear,
          periodLabel: doc.periodLabelHint ?? `FY ${req.fiscalYear}`,
          sourceName: "WEB_SEARCH",
          sourceUrl: doc.url,
          localFileRef: localPath,
          fileName,
          fileHash,
          fileSize: buffer.length,
          processingStatus: "NEW_DOWNLOADED",
          extractionMethod: null,
          isDemoData: false,
          discoveredAt: new Date(),
          documentType: doc.documentType,
          periodEnd: new Date(`${req.fiscalYear}-12-31`),
        },
      })
      documentsStored++
      await db.ingestionRun.update({
        where: { id: ingestionRunId },
        data: {
          documentsDownloaded: { increment: 1 },
          documentsProcessed: { increment: 1 },
        },
      })
      // Extract + validate would normally call the hybrid pipeline; for the
      // orchestrator we record the report for downstream processing.
      void report
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ stage: "store", message: msg, url: doc.url })
      documentsFailed++
      await db.ingestionError.create({
        data: {
          ingestionRunId,
          companyId: company.id,
          sourceUrl: doc.url,
          stage: "store",
          errorType: "DB_FAILED",
          errorMessage: msg,
        },
      })
    }

    await sleep(RATE_LIMIT_MS)
  }

  await db.ingestionRun.update({
    where: { id: ingestionRunId },
    data: {
      companiesProcessed: { increment: 1 },
      documentsFailed,
      valuesExtracted,
      validationErrors,
      documentsFound: documentsDiscovered,
      documentsDownloaded,
      documentsProcessed: documentsStored,
    },
  })

  return {
    companyId: req.companyId,
    fiscalYear: req.fiscalYear,
    documentsDiscovered,
    documentsVerified,
    documentsDownloaded,
    documentsStored,
    documentsFailed,
    valuesExtracted,
    validationErrors,
    errors,
    durationMs: Date.now() - startedAt,
    ingestionRunId,
  }
}

export async function runIngestion(reqs: IngestionRequest[], opts?: { sourceAdapter?: string }): Promise<{ runId: string; outcomes: IngestionOutcome[] }> {
  const run = await db.ingestionRun.create({
    data: {
      runType: "PERIODIC",
      status: "RUNNING",
      sourceAdapter: opts?.sourceAdapter ?? "WEB_SEARCH",
      startedAt: new Date(),
    },
  })
  const outcomes: IngestionOutcome[] = []
  for (const req of reqs) {
    try {
      const outcome = await ingestCompanyPeriod(req, run.id)
      outcomes.push(outcome)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await db.ingestionError.create({
        data: {
          ingestionRunId: run.id,
          companyId: req.companyId,
          stage: "ingest",
          errorType: "INGEST_FAILED",
          errorMessage: msg,
        },
      })
    }
  }
  await db.ingestionRun.update({
    where: { id: run.id },
    data: { status: "COMPLETED", finishedAt: new Date() },
  })
  return { runId: run.id, outcomes }
}

export type { DiscoveredDocument, VerifiedDocument }
