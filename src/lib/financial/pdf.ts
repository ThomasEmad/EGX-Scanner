// PDF parsing layer (server-only).
// Primary engine: unpdf (pdf.js serverless build) — robust text extraction with
// per-page mapping. Fallback: minimal zlib-based extractor (original scanner).
// A scanned/image PDF yields looksScanned=true → pipeline routes it to NEEDS_REVIEW.

import { inflateSync, inflateRawSync } from "node:zlib"

export interface PdfPage {
  pageNumber: number
  text: string
}

export interface PdfParseResult {
  pages: PdfPage[]
  pageCount: number
  looksScanned: boolean
  engine: "unpdf" | "zlib-fallback"
  error?: string
}

/** Minimal deterministic fallback text extraction for simple text-based PDFs. */
export function extractPdfTextZlib(buffer: Buffer): { pages: PdfPage[]; pageCount: number } {
  const raw = buffer.toString("latin1")
  const pages: PdfPage[] = []
  let pageNumber = 0
  const streamRe = /stream\r?\n?/g
  let match: RegExpExecArray | null

  while ((match = streamRe.exec(raw)) !== null) {
    const start = match.index + match[0].length
    const end = raw.indexOf("endstream", start)
    if (end === -1) continue
    const streamBytes = buffer.subarray(start, end)
    let content = ""
    try {
      content = inflateSync(streamBytes).toString("latin1")
    } catch {
      try {
        content = inflateRawSync(streamBytes).toString("latin1")
      } catch {
        content = streamBytes.toString("latin1") // uncompressed stream
      }
    }
    if (content.includes("BT") && (content.includes("Tj") || content.includes("TJ"))) {
      pageNumber++
      pages.push({ pageNumber, text: parseContentStreamZlib(content) })
    }
  }

  if (pages.length === 0) {
    // no content streams found — treat whole doc as one page of nothing
    return { pages: [{ pageNumber: 1, text: "" }], pageCount: 1 }
  }
  return { pages, pageCount: pages.length }
}

function parseContentStreamZlib(content: string): string {
  let working = content
    .replace(/\bT\*/g, "\n")
    .replace(/\bTD\b/g, "\n")
    .replace(/\bET\b/g, "\n")
    .replace(/-?[\d.]+\s+Td/g, "\n")
    .replace(/-?[\d.]+\s+-?[\d.]+\s+Tm/g, "\n")

  const out: string[] = []
  const showRe = /\(((?:\\.|[^\\()])*)\)\s*Tj|\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/g
  let m: RegExpExecArray | null
  while ((m = showRe.exec(working)) !== null) {
    if (m[1] !== undefined) {
      out.push(unescapePdfStringZlib(m[1]))
    } else if (m[2] !== undefined) {
      const inner = m[2].match(/\(((?:\\.|[^\\()])*)\)/g) || []
      out.push(inner.map((s) => unescapePdfStringZlib(s.slice(1, -1))).join(""))
    }
  }
  return out.join(" ")
}

function unescapePdfStringZlib(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
}

function looksScannedCheck(pages: PdfPage[]): boolean {
  const all = pages.map((p) => p.text).join("\n")
  const alphanumeric = all.replace(/[^A-Za-z0-9\u0600-\u06FF]/g, "")
  return alphanumeric.length < 40
}

/** Parse a PDF into per-page text. unpdf first; zlib fallback on any failure/empty result. */
export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { totalPages, text } = await extractText(pdf, { mergePages: false })
    const pageTexts = Array.isArray(text) ? text : [text]
    const pages: PdfPage[] = pageTexts.map((t, i) => ({ pageNumber: i + 1, text: t ?? "" }))
    const hasAnyText = pages.some((p) => p.text.replace(/\s+/g, "").length > 20)
    if (hasAnyText) {
      return { pages, pageCount: totalPages || pages.length, looksScanned: looksScannedCheck(pages), engine: "unpdf" }
    }
    // unpdf parsed but produced no usable text — try zlib fallback before declaring scanned
    const fb = extractPdfTextZlib(buffer)
    if (fb.pages.some((p) => p.text.replace(/\s+/g, "").length > 20)) {
      return { pages: fb.pages, pageCount: fb.pageCount, looksScanned: looksScannedCheck(fb.pages), engine: "zlib-fallback" }
    }
    return {
      pages,
      pageCount: totalPages || pages.length,
      looksScanned: true,
      engine: "unpdf",
      error: "No extractable text layer found (likely scanned or image-based)",
    }
  } catch (e) {
    try {
      const fb = extractPdfTextZlib(buffer)
      const hasText = fb.pages.some((p) => p.text.replace(/\s+/g, "").length > 20)
      if (hasText) {
        return { pages: fb.pages, pageCount: fb.pageCount, looksScanned: looksScannedCheck(fb.pages), engine: "zlib-fallback" }
      }
      return {
        pages: fb.pages,
        pageCount: fb.pageCount,
        looksScanned: true,
        engine: "zlib-fallback",
        error: `PDF parsing failed (${e instanceof Error ? e.message : String(e)}) — no text layer found`,
      }
    } catch (fbError) {
      return {
        pages: [],
        pageCount: 0,
        looksScanned: true,
        engine: "zlib-fallback",
        error: `PDF parsing failed: ${e instanceof Error ? e.message : String(e)}; fallback failed: ${fbError instanceof Error ? fbError.message : String(fbError)}`,
      }
    }
  }
}
