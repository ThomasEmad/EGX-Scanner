// Standalone types for the hybrid extraction pipeline.
// These mirror the JSON shape produced by scripts/extraction/extract_pdf.py.

export type DetectedLanguage = "EN" | "AR" | "MIXED" | "UNKNOWN"
export type DetectedStatementType =
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "CASH_FLOW"
  | "OTHER"
  | "UNKNOWN"

export interface ExtractionBbox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface ExtractionCell {
  col_index: number
  raw_text: string
  is_label: boolean
  is_number: boolean
  numeric_value: number | null
  is_negative: boolean
  is_blank_or_na: boolean
  bbox: ExtractionBbox | null
}

export interface ExtractionRow {
  row_index: number
  cells: ExtractionCell[]
}

export interface ExtractionTable {
  table_index: number
  rows: ExtractionRow[]
  column_count: number
}

export interface ExtractionLine {
  text: string
  is_label: boolean
  is_number: boolean
  numeric_value: number | null
  is_negative: boolean
  is_blank_or_na: boolean
  col_index: number
  bbox: ExtractionBbox | null
}

export interface ExtractionPage {
  page: number
  language: DetectedLanguage
  statementType: DetectedStatementType
  text: string
  lines: ExtractionLine[]
  tables: ExtractionTable[]
}

export interface ExtractionPeriod {
  periodType: string | null
  sub: string | null
  fiscalYear: number | null
  periodLabel: string | null
  confidence: number
}

export interface ExtractionMetadata {
  pageCount: number
  looksScanned: boolean
  language: DetectedLanguage
  statementType: DetectedStatementType
  period: ExtractionPeriod
  unit: string
  company: string | null
  ticker: string | null
  currency: string
  engines: {
    fitz: boolean
    pdfplumber: boolean
    tesseract: boolean
  }
}

export interface ExtractionResult {
  pages: ExtractionPage[]
  document: ExtractionMetadata
  metadata: ExtractionMetadata
}
