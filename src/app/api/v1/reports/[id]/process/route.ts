import { readFile } from "node:fs/promises"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import {
  detectDocumentKind, extractFromCsv, extractFromText, extractFromPages,
  detectLanguage, detectStatementType, detectPeriod,
} from "@/lib/financial/extract"
import { parsePdf } from "@/lib/financial/pdf"
import { validateValues, type ValidatableValue } from "@/lib/financial/validate"
import { recomputeCompany, type RecomputeResult } from "@/lib/financial/recompute"

// POST /api/v1/reports/[id]/process — full extraction pipeline (admin):
//   PARSE → EXTRACT → NORMALIZE → VALIDATE → FINALIZE, every stage logged to
//   FinancialExtractionLog and every check emitted as a FinancialValidationResult row.
// Detection fill-in: language / statementType auto-detected only when the report's
// fields are UNKNOWN; a confidently detected period is logged as a SUGGESTION in the
// notes — the admin-confirmed period is never silently overwritten.
// Insufficient quality ⇒ NEEDS_REVIEW — bad extraction is never silently accepted
// and pipeline errors are never silently swallowed (status FAILED + error row).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const { id } = await params

  const report = await db.financialReport.findUnique({ where: { id }, include: { company: true } })
  if (!report) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  if (!report.localFileRef) {
    return Response.json({ error: "NO_FILE", message: "This report has no stored document to process" }, { status: 400 })
  }

  await db.financialReport.update({ where: { id }, data: { processingStatus: "PROCESSING", errorMessage: null } })

  try {
    // ---------- read stored document ----------
    let buffer: Buffer
    try {
      buffer = await readFile(report.localFileRef)
    } catch {
      const message = `Stored document could not be read: ${report.localFileRef}`
      await db.financialReport.update({ where: { id }, data: { processingStatus: "FAILED", errorMessage: message } })
      await db.financialExtractionLog.create({
        data: { reportId: id, stage: "PARSE", level: "ERROR", message },
      })
      await audit("PROCESS_ERROR", { actor: "system", entityType: "FinancialReport", entityId: id, details: message })
      return Response.json({ ok: false, error: message }, { status: 500 })
    }

    // ---------- PARSE stage ----------
    const kind = detectDocumentKind(buffer)
    await db.financialExtractionLog.create({
      data: { reportId: id, stage: "PARSE", level: "INFO", message: `Document kind detected: ${kind} (${buffer.length} bytes)`, details: JSON.stringify({ kind }) },
    })
    await audit("PROCESS", { actor: "admin", entityType: "FinancialReport", entityId: id, details: `Detected document kind: ${kind}` })

    let candidates: ValidatableValue[] = []
    let statusNote = ""
    let extractionMethod: string | null = null
    let fullText = ""
    let pdfPageCount: number | null = null

    // wipe previously extracted values + validation rows for this report (idempotent reprocessing)
    await db.financialValue.deleteMany({ where: { reportId: id } })
    await db.financialValidationResult.deleteMany({ where: { reportId: id } })

    /** Persist an early-exit outcome (no candidates) with structured rows + summary response */
    const finishWithoutCandidates = async (
      message: string,
      level: "WARN" | "ERROR",
      checkStatus: "WARNING" | "FAILED"
    ) => {
      const fillLanguage = report.language !== "UNKNOWN" || !fullText
        ? report.language
        : safeDetectLanguage(fullText)
      const fillStatement = report.statementType !== "UNKNOWN" || !fullText
        ? report.statementType
        : safeDetectStatementType(fullText)

      await db.financialValidationResult.createMany({
        data: [{
          reportId: id,
          checkName: "EXTRACTION",
          category: "COMPLETENESS",
          status: checkStatus,
          severity: "CRITICAL",
          details: message,
        }],
      })
      await db.financialExtractionLog.create({
        data: { reportId: id, stage: "EXTRACT", level, message },
      })
      await db.financialExtractionLog.create({
        data: { reportId: id, stage: "FINALIZE", level, message: `Final status: NEEDS_REVIEW — ${message}` },
      })
      await db.financialReport.update({
        where: { id },
        data: {
          processingStatus: "NEEDS_REVIEW",
          errorMessage: message,
          extractionMethod,
          parserVersion: "extract@2",
          extractionConfidence: null,
          language: fillLanguage,
          statementType: fillStatement,
          notes: message,
        },
      })
      await audit("EXTRACT", { actor: "system", entityType: "FinancialReport", entityId: id, details: message })
      return Response.json({
        ok: false,
        status: "NEEDS_REVIEW",
        message,
        extractedCount: 0,
        validCount: 0,
        needsReviewCount: 0,
        failedCount: 0,
        confidence: null,
        language: fillLanguage,
        statementType: fillStatement,
        checks: [{ checkName: "EXTRACTION", status: checkStatus, severity: "CRITICAL" }],
        notes: message,
        recompute: null,
      })
    }

    // ---------- EXTRACT stage ----------
    if (kind === "PDF") {
      const pdf = await parsePdf(buffer)
      pdfPageCount = pdf.pageCount
      if (pdf.looksScanned) {
        statusNote = "Scanned/image-based PDF — OCR not available in this environment; manual review required"
        return finishWithoutCandidates(statusNote, "WARN", "WARNING")
      }
      fullText = pdf.pages.map((p) => p.text).join("\n")
      extractionMethod = pdf.engine === "unpdf" ? "PDF_TEXT" : "PDF_ZLIB"
      if (pdf.error) {
        await db.financialExtractionLog.create({
          data: { reportId: id, stage: "PARSE", level: "WARN", message: `PDF parser note: ${pdf.error}` },
        })
      }
      try {
        candidates = await extractFromPages(pdf.pages)
      } catch (e) {
        statusNote = `Page extraction failed with an internal error: ${e instanceof Error ? e.message : String(e)}`
        return finishWithoutCandidates(statusNote, "ERROR", "FAILED")
      }
    } else if (kind === "TEXT") {
      const text = buffer.toString("utf8")
      fullText = text
      extractionMethod = "CSV_TEXT"
      const hasCommas = (text.match(/[,;]/g)?.length ?? 0) >= 3
      candidates = hasCommas ? extractFromCsv(text) : extractFromText(text)
    } else if (kind === "ZIP_OFFICE") {
      statusNote = "Excel/Word documents are not supported by this extraction pipeline yet. Export the statement to CSV (label, value, unit) or PDF and upload again."
      return finishWithoutCandidates(statusNote, "WARN", "WARNING")
    } else {
      statusNote = "Unknown document type — cannot be processed automatically. Manual review required."
      return finishWithoutCandidates(statusNote, "WARN", "WARNING")
    }

    if (candidates.length === 0) {
      statusNote = kind === "PDF"
        ? "Text-based PDF processed, but no financial labels from the metric registry were matched. The document may use non-standard terminology — manual review required."
        : "Text document processed, but no financial labels from the metric registry were matched. Manual review required."
      return finishWithoutCandidates(statusNote, "ERROR", "FAILED")
    }

    await db.financialExtractionLog.create({
      data: {
        reportId: id,
        stage: "EXTRACT",
        level: "INFO",
        message: `Extracted ${candidates.length} candidate value(s) via ${extractionMethod}${pdfPageCount ? ` from ${pdfPageCount} page(s)` : ""}`,
        details: JSON.stringify({ extractionMethod, candidateCodes: [...new Set(candidates.map((c) => c.metricCode))].sort(), candidateCount: candidates.length }),
      },
    })

    // ---------- auto-detection fill-in (never overwrites admin-confirmed fields) ----------
    const finalLanguage = report.language !== "UNKNOWN" ? report.language : safeDetectLanguage(fullText)
    const finalStatementType = report.statementType !== "UNKNOWN" ? report.statementType : safeDetectStatementType(fullText)
    if (report.language === "UNKNOWN" && finalLanguage !== "UNKNOWN") {
      await db.financialExtractionLog.create({
        data: { reportId: id, stage: "EXTRACT", level: "INFO", message: `Language auto-detected: ${finalLanguage}` },
      })
    }
    if (report.statementType === "UNKNOWN" && finalStatementType !== "UNKNOWN") {
      await db.financialExtractionLog.create({
        data: { reportId: id, stage: "EXTRACT", level: "INFO", message: `Statement type auto-detected: ${finalStatementType}` },
      })
    }

    // Period detection: a confident detection is recorded as a SUGGESTION only —
    // the admin-confirmed reporting period is never silently overwritten.
    let periodSuggestion = ""
    const detectedPeriod = fullText ? safeDetectPeriod(fullText) : null
    if (detectedPeriod && detectedPeriod.confidence >= 0.6) {
      periodSuggestion = `Period suggestion: ${detectedPeriod.periodLabel} (${detectedPeriod.periodType} ${detectedPeriod.fiscalYear}, confidence ${(detectedPeriod.confidence * 100).toFixed(0)}%) — admin-confirmed period not overwritten`
      await db.financialExtractionLog.create({
        data: {
          reportId: id,
          stage: "EXTRACT",
          level: "INFO",
          message: `Auto-detected period (suggestion only): ${detectedPeriod.periodLabel} — periodType=${detectedPeriod.periodType}, fiscalYear=${detectedPeriod.fiscalYear}, confidence=${detectedPeriod.confidence}`,
          details: JSON.stringify(detectedPeriod),
        },
      })
    }

    // ---------- NORMALIZE + VALIDATE stage ----------
    const validated = validateValues(candidates)

    // sourceText lives on the extracted candidates but not on the ValidatableValue
    // interface — map it by metricCode (validation keeps the first occurrence per code)
    const sourceTextByCode = new Map<string, string | null>()
    for (const c of candidates) {
      if (!sourceTextByCode.has(c.metricCode)) {
        sourceTextByCode.set(c.metricCode, (c as Partial<{ sourceText?: string | null }>).sourceText ?? null)
      }
    }

    // FinancialValue rows (original labels + units + confidence + source pages preserved)
    await db.financialValue.createMany({
      data: validated.results.map((r) => ({
        companyId: report.companyId,
        reportId: report.id,
        metricCode: r.metricCode,
        originalLabel: r.input.originalLabel,
        value: r.input.value,
        currency: r.input.currency || "EGP",
        unit: r.input.unit,
        normalizedValue: r.normalizedValue,
        statementType: r.statementType,
        sourcePage: r.input.sourcePage ?? null,
        sourceText: sourceTextByCode.get(r.metricCode) ?? null,
        extractionMethod: extractionMethod ?? "MANUAL_ENTRY",
        confidence: r.input.confidence ?? 1,
        validationStatus: r.validationStatus,
        validationNotes: r.validationNotes.join(" | ") || null,
        isDemoData: false,
      })),
    })

    // Structured per-check validation results
    if (validated.checks.length) {
      await db.financialValidationResult.createMany({
        data: validated.checks.map((c) => ({
          reportId: report.id,
          checkName: c.checkName,
          category: c.category,
          status: c.status,
          severity: c.severity,
          details: c.details,
        })),
      })
    }

    // unit summary for the NORMALIZE log (unitless metrics are never scaled)
    const unitTally = new Map<string, number>()
    for (const r of validated.results) unitTally.set(r.input.unit, (unitTally.get(r.input.unit) ?? 0) + 1)
    const unitSummary = [...unitTally.entries()].map(([u, n]) => `${u}×${n}`).join(", ")
    await db.financialExtractionLog.create({
      data: {
        reportId: id,
        stage: "NORMALIZE",
        level: "INFO",
        message: `Normalized ${validated.results.length} value(s) to plain EGP (units: ${unitSummary || "none"})`,
        details: JSON.stringify({ unitSummary }),
      },
    })

    const newStatus = validated.reportStatus
    const meanConfidence = validated.results.length
      ? Math.round((validated.results.reduce((acc, r) => acc + (r.input.confidence ?? 1), 0) / validated.results.length) * 100) / 100
      : null
    const notes = [statusNote, ...validated.reportNotes, periodSuggestion].filter(Boolean).join(" | ") || null

    await db.financialExtractionLog.create({
      data: {
        reportId: id,
        stage: "VALIDATE",
        level: newStatus === "VALIDATED" ? "INFO" : newStatus === "NEEDS_REVIEW" ? "WARN" : "ERROR",
        message: `Validation result: ${newStatus}${validated.reportNotes.length ? ` — ${validated.reportNotes.join(" | ")}` : " — all checks passed"}`,
        details: JSON.stringify({ reportStatus: newStatus, checks: validated.checks.length }),
      },
    })

    // ---------- FINALIZE stage ----------
    const finalizeMessage = `Final status: ${newStatus} — ${validated.results.length} value(s) extracted, confidence ${meanConfidence ?? "n/a"}${notes ? ` | ${notes}` : ""}`
    await db.financialExtractionLog.create({
      data: {
        reportId: id,
        stage: "FINALIZE",
        level: newStatus === "VALIDATED" ? "INFO" : newStatus === "NEEDS_REVIEW" ? "WARN" : "ERROR",
        message: finalizeMessage,
      },
    })

    await db.financialReport.update({
      where: { id },
      data: {
        processingStatus: newStatus,
        extractionMethod,
        parserVersion: "extract@2",
        extractionConfidence: meanConfidence,
        errorMessage: newStatus === "VALIDATED" ? null : (validated.reportNotes[0] ?? statusNote ?? null),
        language: finalLanguage,
        statementType: finalStatementType,
        notes,
      },
    })
    await audit("VALIDATE", {
      actor: "system",
      entityType: "FinancialReport",
      entityId: id,
      details: `${validated.results.length} values extracted → ${newStatus}. ${notes ?? ""}`,
    })

    // if fully validated, recompute the company metrics + events immediately
    let recompute: RecomputeResult | null = null
    if (newStatus === "VALIDATED") {
      recompute = await recomputeCompany(report.companyId)
    }

    return Response.json({
      ok: newStatus === "VALIDATED",
      status: newStatus,
      message: newStatus === "VALIDATED" ? undefined : (validated.reportNotes.join(" | ") || statusNote || undefined),
      extractedCount: validated.results.length,
      validCount: validated.results.filter((r) => r.validationStatus === "VALID").length,
      needsReviewCount: validated.results.filter((r) => r.validationStatus === "NEEDS_REVIEW").length,
      failedCount: validated.results.filter((r) => r.validationStatus === "FAILED").length,
      confidence: meanConfidence,
      language: finalLanguage,
      statementType: finalStatementType,
      checks: validated.checks.map((c) => ({ checkName: c.checkName, status: c.status, severity: c.severity })),
      notes,
      recompute,
    })
  } catch (e) {
    // NEVER silently fail: any pipeline error → FAILED + ERROR log + explicit 500 JSON
    const message = e instanceof Error ? e.message : String(e)
    await db.financialReport.update({
      where: { id },
      data: { processingStatus: "FAILED", errorMessage: message },
    }).catch(() => undefined)
    await db.financialExtractionLog.create({
      data: { reportId: id, stage: "FINALIZE", level: "ERROR", message: `Pipeline error: ${message}` },
    }).catch(() => undefined)
    await audit("PROCESS_ERROR", { actor: "system", entityType: "FinancialReport", entityId: id, details: message })
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}

/** Safe wrappers around the (parallel-upgraded) extraction detectors — any failure
 *  degrades to UNKNOWN instead of killing the pipeline. */
function safeDetectLanguage(text: string): string {
  try {
    return detectLanguage(text)
  } catch {
    return "UNKNOWN"
  }
}
function safeDetectStatementType(text: string): string {
  try {
    return detectStatementType(text)
  } catch {
    return "UNKNOWN"
  }
}
function safeDetectPeriod(text: string): ReturnType<typeof detectPeriod> {
  try {
    return detectPeriod(text)
  } catch {
    return null
  }
}
