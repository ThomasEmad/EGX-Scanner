// Source adapter interface — the abstraction used by the ingestion orchestrator
// to discover, verify, and download financial documents from external sources.

export interface DiscoveredDocument {
  /** Adapter that produced this discovery */
  sourceAdapter: string
  /** Title of the document (often the search result title) */
  title: string
  /** URL to download the document */
  url: string
  /** Likely document type */
  documentType: "ANNUAL_REPORT" | "INTERIM_REPORT" | "EARNINGS_RELEASE" | "PRESENTATION" | "OTHER"
  /** Period label hint ("FY 2024", "Q2 2025", "H1 2024") */
  periodLabelHint?: string
  /** Period type hint */
  periodTypeHint?: string
  /** Fiscal year hint */
  fiscalYearHint?: number
  /** Authority ranking (HIGH for official IR sites, MEDIUM for news, LOW for aggregators) */
  authorityRank: "HIGH" | "MEDIUM" | "LOW"
  /** Snippet / preview text */
  snippet?: string
  /** Discovery confidence 0..1 */
  discoveryConfidence: number
  /** When the document was published (best-effort) */
  publishedAt?: Date
  /** Free-form metadata */
  metadata?: Record<string, unknown>
}

export interface VerifiedDocument extends DiscoveredDocument {
  /** Verification confidence 0..1 (post content verification) */
  verificationConfidence: number
  /** Verification reasons (free text, machine-readable hints) */
  verificationReasons: string[]
  /** SHA-256 hash of the downloaded file (for dedup) */
  fileHash?: string
  /** File size in bytes */
  fileSize?: number
  /** Local storage path */
  localPath?: string
  /** MIME type detected from magic bytes */
  mimeType?: string
}

export interface FinancialSourceAdapter {
  /** Adapter name (unique identifier) */
  name: string
  /** Adapter type */
  kind: "MANUAL_UPLOAD" | "AUTO_COLLECTOR" | "EXTERNAL_API" | "SEED_DEMO" | "WEB_SEARCH"
  /** Discover documents for a given company + period */
  discover(company: { ticker: string; nameEn: string; sector?: string }, period?: { fiscalYear: number; periodType?: string }): Promise<DiscoveredDocument[]>
  /** Download a discovered document */
  download(doc: DiscoveredDocument): Promise<{ buffer: Buffer; mimeType: string; fileHash: string; fileSize: number }>
  /** Verify the downloaded content (financial keyword check) */
  verifyContent(buffer: Buffer, doc: DiscoveredDocument): Promise<{ isFinancialDocument: boolean; reasons: string[]; confidence: number }>
}

/** Adapter registry — adapters register themselves for orchestrator lookup. */
const adapters = new Map<string, FinancialSourceAdapter>()

export function registerSourceAdapter(adapter: FinancialSourceAdapter): void {
  adapters.set(adapter.name, adapter)
}

export function getSourceAdapter(name: string): FinancialSourceAdapter | undefined {
  return adapters.get(name)
}

export function listSourceAdapters(): FinancialSourceAdapter[] {
  return [...adapters.values()]
}

export function clearSourceAdapters(): void {
  adapters.clear()
}
