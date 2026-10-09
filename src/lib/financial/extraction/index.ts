// Hybrid extraction pipeline (server-only).
//
// This module wraps the Python `extract_pdf.py` extractor (PyMuPDF + pdfplumber +
// tesseract OCR fallback) and runs matchMetrics() on the structured output.
//
// Usage:
//   const result = await extractPdfHybrid(buffer, "report-id.pdf")
//   // result.candidates → MatchedCandidate[] (validated against the registry)
//
// The Python script is invoked via child_process.spawn with the PDF bytes piped
// to a temp file. The JSON output is parsed into typed ExtractionResult, then
// matched against the canonical metric registry.

import { spawn } from "node:child_process"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ExtractionResult } from "./index-types"
import { matchMetrics, type MatchedCandidate } from "./match-metrics"

const EXTRACTOR_PATH = join(process.cwd(), "scripts", "extraction", "extract_pdf.py")
const PYTHON_BIN = process.env.PYTHON_BIN || "python3"

export interface HybridExtractionOptions {
  /** Override the inferred unit (THOUSAND, MILLION, BILLION). */
  defaultUnit?: string
  /** Override the inferred currency (default EGP). */
  defaultCurrency?: string
  /** OCR threshold for falling back to tesseract. */
  ocrThreshold?: number
}

export interface HybridExtractionResult {
  extraction: ExtractionResult
  candidates: MatchedCandidate[]
  pageCount: number
  looksScanned: boolean
  language: string
  statementType: string
  unit: string
  periodLabel: string | null
  fiscalYear: number | null
  periodType: string | null
  confidence: number
}

function spawnPython(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8") })
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8") })
    child.on("close", (code) => resolve({ stdout, stderr, code }))
    child.on("error", (err) => resolve({ stdout, stderr: err.message, code: -1 }))
  })
}

/**
 * Run the hybrid extraction pipeline on a PDF buffer.
 * Returns the structured extraction result and matched metric candidates.
 */
export async function extractPdfHybrid(
  buffer: Buffer,
  fileName: string = "document.pdf",
  opts?: HybridExtractionOptions,
): Promise<HybridExtractionResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "egx-extract-"))
  const tempPath = join(tempDir, fileName.replace(/[^A-Za-z0-9._-]/g, "_") || "document.pdf")
  try {
    await writeFile(tempPath, buffer)
    const args = [EXTRACTOR_PATH, tempPath]
    if (opts?.ocrThreshold !== undefined) {
      args.push("--ocr-threshold", String(opts.ocrThreshold))
    }
    const { stdout, stderr, code } = await spawnPython(args)
    if (code !== 0 || !stdout) {
      throw new Error(`extract_pdf.py failed (code=${code}): ${stderr || "no output"}`)
    }
    const extraction = JSON.parse(stdout) as ExtractionResult
    const candidates = matchMetrics(extraction, {
      defaultUnit: opts?.defaultUnit,
      defaultCurrency: opts?.defaultCurrency,
    })
    const md = extraction.metadata
    const confidence = candidates.length > 0
      ? Math.round((candidates.reduce((acc, c) => acc + c.confidence, 0) / candidates.length) * 100) / 100
      : 0
    return {
      extraction,
      candidates,
      pageCount: md.pageCount,
      looksScanned: md.looksScanned,
      language: md.language,
      statementType: md.statementType,
      unit: opts?.defaultUnit ?? md.unit ?? "MILLION",
      periodLabel: md.period?.periodLabel ?? null,
      fiscalYear: md.period?.fiscalYear ?? null,
      periodType: md.period?.periodType ?? null,
      confidence,
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export { matchMetrics, matchLabel } from "./match-metrics"
export * from "./index-types"
export type { MatchedCandidate } from "./match-metrics"
