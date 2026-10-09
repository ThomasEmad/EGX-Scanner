// Search-based document discovery — uses z-ai-web-dev-sdk to find financial
// documents (annual reports, quarterly filings) on the public web for a given
// company + period.
//
// Pipeline:
//   generateSearchQueries(company, period) → 4-8 EN+AR queries
//   webSearch(query, num) → cached z-ai SDK search
//   rankSearchResult(item) → HIGH/MEDIUM/LOW by source authority
//   verifySearchResult(item, company, period) → confidence + verification reasons
//   searchFinancialDocuments(company, period) → full pipeline → DiscoveredDocument[]
//
// IMPORTANT: this module MUST be imported server-side only (z-ai-web-dev-sdk
// is server-only per the project rules).

import ZAI, { type SearchFunctionResultItem } from "z-ai-web-dev-sdk"
import type { DiscoveredDocument } from "./source-adapter"

let zaiInstance: ZAI | null = null
async function getZai(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

// In-process cache: query → search results (avoids duplicate calls within a session)
const searchCache = new Map<string, SearchFunctionResultItem[]>()

/** Generate 4-8 EN+AR search queries for a given company + period.
 *  Includes queries that target PDFs directly (filetype:pdf). */
export function generateSearchQueries(
  company: { ticker: string; nameEn: string; nameAr?: string; sector?: string },
  period?: { fiscalYear?: number; periodType?: string },
): string[] {
  const queries: string[] = []
  const year = period?.fiscalYear ?? ""
  const periodLabel = periodLabelFor(period?.periodType, year as number)
  // English queries — PDF-targeted first
  queries.push(`${company.nameEn} annual report ${year} filetype:pdf`)
  queries.push(`${company.nameEn} financial statements ${year} pdf`)
  queries.push(`${company.nameEn} consolidated financial statements ${year} filetype:pdf`)
  queries.push(`${company.nameEn} annual report ${year} site:egx.com.eg`)
  queries.push(`${company.ticker} EGX annual report ${year} filetype:pdf`)
  if (period?.periodType === "QUARTERLY") {
    queries.push(`${company.nameEn} quarterly results ${year} filetype:pdf`)
    queries.push(`${company.ticker} ${periodLabel} financial results pdf`)
  } else if (period?.periodType === "SEMIANNUAL") {
    queries.push(`${company.nameEn} semi-annual report ${year} filetype:pdf`)
  } else {
    queries.push(`${company.nameEn} investor relations annual report ${year} pdf`)
    queries.push(`${company.nameEn} ${year} consolidated annual report filetype:pdf`)
  }
  queries.push(`${company.nameEn} ${year} financial disclosure EGX pdf`)
  // Arabic queries
  if (company.nameAr) {
    queries.push(`القوائم المالية ${company.nameAr} ${year} pdf`)
    queries.push(`تقرير سنوي ${company.nameAr} ${year} filetype:pdf`)
    queries.push(`${company.ticker} ${year} إفصاحات EGX pdf`)
    queries.push(`القوائم المالية المجمعة ${company.nameAr} ${year}`)
  }
  // Dedup & cap to 12 (more queries = better coverage for PDFs)
  return [...new Set(queries)].slice(0, 12)
}

function periodLabelFor(periodType?: string, year?: number): string {
  if (!year) return ""
  if (periodType === "QUARTERLY") return `Q1-Q4 ${year}`
  if (periodType === "SEMIANNUAL") return `H1 ${year}`
  if (periodType === "NINE_MONTH") return `9M ${year}`
  if (periodType === "ANNUAL") return `FY ${year}`
  return String(year)
}

/** Cached z-ai web search. */
export async function webSearch(query: string, num: number = 10): Promise<SearchFunctionResultItem[]> {
  const cacheKey = `${query}::${num}`
  const cached = searchCache.get(cacheKey)
  if (cached) return cached
  const zai = await getZai()
  try {
    const results = await zai.functions.invoke("web_search", { query, num })
    searchCache.set(cacheKey, results)
    return results
  } catch (err) {
    // Don't fail the whole pipeline on a single query error
    console.warn(`[search-provider] query "${query}" failed:`, err)
    searchCache.set(cacheKey, [])
    return []
  }
}

/** Rank a search result by source authority.
 *  HIGH: official IR sites, egx.com.eg, .gov.eg
 *  MEDIUM: reuters, bloomberg, major news outlets
 *  LOW: aggregators, generic PDF hosts */
export function rankSearchResult(item: SearchFunctionResultItem): "HIGH" | "MEDIUM" | "LOW" {
  const url = item.url.toLowerCase()
  const host = item.host_name?.toLowerCase() ?? ""
  if (url.includes(".gov.eg") || url.includes("egx.com.eg") || url.includes("ir.") || url.includes("investor")) {
    return "HIGH"
  }
  if (url.includes("reuters.com") || url.includes("bloomberg.com") || url.includes("investing.com") ||
      url.includes("marketwatch.com") || url.includes("ft.com") || url.includes("wsj.com")) {
    return "MEDIUM"
  }
  // IR-style / annual report signals
  if (url.includes("annual-report") || url.includes("financial-statements") ||
      url.includes("investor-relations") || url.endsWith(".pdf")) {
    return "HIGH"
  }
  return "LOW"
}

/** Verify a search result against the target company + period. Returns confidence
 *  0..1 plus a list of verification reasons. */
export function verifySearchResult(
  item: SearchFunctionResultItem,
  company: { ticker: string; nameEn: string; nameAr?: string },
  period?: { fiscalYear?: number; periodType?: string },
): { confidence: number; reasons: string[] } {
  const reasons: string[] = []
  let confidence = 0
  const text = `${item.name} ${item.snippet} ${item.url}`.toLowerCase()
  // Company name match
  const nameTokens = company.nameEn.toLowerCase().split(/\s+/).filter((t) => t.length >= 4)
  const matchedTokens = nameTokens.filter((t) => text.includes(t))
  if (matchedTokens.length === nameTokens.length && nameTokens.length > 0) {
    confidence += 0.4
    reasons.push(`Company name fully matched (${matchedTokens.length}/${nameTokens.length} tokens)`)
  } else if (matchedTokens.length > 0) {
    confidence += 0.2
    reasons.push(`Company name partially matched (${matchedTokens.length}/${nameTokens.length} tokens)`)
  }
  // Ticker match
  if (company.ticker && text.includes(company.ticker.toLowerCase())) {
    confidence += 0.2
    reasons.push(`Ticker "${company.ticker}" matched`)
  }
  // Period match
  if (period?.fiscalYear && text.includes(String(period.fiscalYear))) {
    confidence += 0.2
    reasons.push(`Fiscal year ${period.fiscalYear} mentioned`)
  }
  // Period type
  if (period?.periodType === "ANNUAL" && (text.includes("annual") || text.includes("سنوي"))) {
    confidence += 0.1
    reasons.push(`Annual report language detected`)
  }
  if (period?.periodType === "QUARTERLY" && (text.includes("quarter") || text.includes("ربع"))) {
    confidence += 0.1
    reasons.push(`Quarterly report language detected`)
  }
  // Authority rank
  const rank = rankSearchResult(item)
  if (rank === "HIGH") {
    confidence += 0.2
    reasons.push(`High-authority source: ${item.host_name}`)
  } else if (rank === "MEDIUM") {
    confidence += 0.1
    reasons.push(`Medium-authority source: ${item.host_name}`)
  } else {
    reasons.push(`Low-authority source: ${item.host_name}`)
  }
  // PDF signal
  if (text.endsWith(".pdf") || item.url.toLowerCase().endsWith(".pdf")) {
    confidence += 0.1
    reasons.push(`PDF document (likely a full filing)`)
  }
  return { confidence: Math.min(1, confidence), reasons }
}

/** Detect document type from URL + title. */
export function detectDocumentType(item: SearchFunctionResultItem): DiscoveredDocument["documentType"] {
  const text = `${item.name} ${item.url}`.toLowerCase()
  if (text.includes("annual") || text.includes("سنوي") || text.includes("year")) return "ANNUAL_REPORT"
  if (text.includes("quarter") || text.includes("interim") || text.includes("ربع")) return "INTERIM_REPORT"
  if (text.includes("earnings") || text.includes("results") || text.includes("نتائج")) return "EARNINGS_RELEASE"
  if (text.includes("presentation") || text.includes("slides")) return "PRESENTATION"
  return "OTHER"
}

/** Full search pipeline → DiscoveredDocument[]. */
export async function searchFinancialDocuments(
  company: { ticker: string; nameEn: string; nameAr?: string; sector?: string },
  period?: { fiscalYear?: number; periodType?: string },
): Promise<DiscoveredDocument[]> {
  const queries = generateSearchQueries(company, period)
  const allItems = new Map<string, SearchFunctionResultItem>()
  for (const q of queries) {
    const items = await webSearch(q, 10)
    for (const item of items) {
      allItems.set(item.url, item)
    }
  }
  const discovered: DiscoveredDocument[] = []
  for (const item of allItems.values()) {
    const verification = verifySearchResult(item, company, period)
    if (verification.confidence < 0.2) continue // skip irrelevant results
    discovered.push({
      sourceAdapter: "WEB_SEARCH",
      title: item.name,
      url: item.url,
      documentType: detectDocumentType(item),
      periodLabelHint: periodLabelFor(period?.periodType, period?.fiscalYear),
      periodTypeHint: period?.periodType,
      fiscalYearHint: period?.fiscalYear,
      authorityRank: rankSearchResult(item),
      snippet: item.snippet,
      discoveryConfidence: verification.confidence,
      publishedAt: item.date ? new Date(item.date) : undefined,
      metadata: { host: item.host_name, rank: item.rank, verificationReasons: verification.reasons },
    })
  }
  // Sort by discovery confidence desc, then authority rank
  discovered.sort((a, b) => {
    if (a.discoveryConfidence !== b.discoveryConfidence) return b.discoveryConfidence - a.discoveryConfidence
    const rankOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 }
    return rankOrder[b.authorityRank] - rankOrder[a.authorityRank]
  })
  return discovered
}
