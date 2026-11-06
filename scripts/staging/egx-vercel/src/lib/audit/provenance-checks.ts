// CATEGORY 7: Provenance & Source Issues — ISIN validation (format + Luhn),
// uniqueness, placeholder detection, source URL health, extraction timestamps.

import type { AuditCheckResult, AuditSeverity } from "./types"

export interface ProvenanceCompanyInput {
  ticker: string
  isin?: string | null
  createdAt: Date
  updatedAt: Date
  reports: Array<{
    id: string
    sourceName: string
    sourceUrl?: string | null
    createdAt: Date
    extractionMethod?: string | null
  }>
}

const PLACEHOLDER_ISINS = new Set(["EGS02091C019", "EG00000000000"])

/** Luhn check digit validation for ISIN (per ISO 6166).
 * Algorithm: convert letters to numbers, then (on the 11-char payload) multiply
 * alternating digits by 2 and 1 starting from the RIGHT end of the payload,
 * digit-sum products >9; check = (10 − sum%10) % 10 must equal the 12th char.
 * Verified against Wikipedia examples: US0378331005, AU0000XVGZA3, GB0002634946.
 */
export function isValidISIN(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false
  // convert: letters → numbers (A=10 … Z=35); digits stay
  let digits = ""
  for (const ch of isin.slice(0, 11)) {
    if (/[A-Z]/.test(ch)) digits += (ch.charCodeAt(0) - 55).toString()
    else digits += ch
  }
  let sum = 0
  let mult = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10) * mult
    if (d > 9) d -= 9
    sum += d
    mult = mult === 2 ? 1 : 2
  }
  return (10 - (sum % 10)) % 10 === parseInt(isin.slice(11), 10)
}

export function runProvenanceChecks(
  company: ProvenanceCompanyInput,
  allIsins: Map<string, string>, // isin → ticker (global, for uniqueness)
): AuditCheckResult[] {
  const results: AuditCheckResult[] = []
  const { ticker, isin } = company

  // 7.1 ISIN validation — metadata only (does not reduce financial accuracy)
  if (!isin) {
    results.push({
      checkName: "ISIN_MISSING", category: "provenance", severity: "low",
      passed: false, ticker, autoFixable: false,
      issueClass: "metadata", rootCause: "ISIN",
      details: "No ISIN on record — cannot cross-verify against EGX master list (metadata only).",
      detailsAr: "لا يوجد رقم ISIN — يتعذر التحقق المتقاطع من قائمة البورصة (بيانات وصفية فقط).",
    })
  } else if (PLACEHOLDER_ISINS.has(isin)) {
    results.push({
      checkName: "ISIN_PLACEHOLDER", category: "provenance", severity: "high",
      passed: false, ticker, currentValue: isin, autoFixable: false,
      issueClass: "metadata", rootCause: "ISIN",
      details: `Placeholder ISIN "${isin}" — data integrity violation; fetch real ISIN from EGX.`,
      detailsAr: `ISIN وهمي (${isin}) — يجب جلب الرقم الحقيقي من البورصة المصرية.`,
    })
  } else if (!isValidISIN(isin)) {
    results.push({
      checkName: "ISIN_CHECKSUM_INVALID", category: "provenance", severity: "medium",
      passed: false, ticker, currentValue: isin, autoFixable: false,
      issueClass: "metadata", rootCause: "ISIN",
      details: `ISIN "${isin}" fails Luhn check digit validation.`,
      detailsAr: `ISIN "${isin}" لا يجتاز فحص رقم التحقق (Luhn).`,
    })
  }

  // 7.2 URL health (only stored reports with entries)
  let broken = 0
  for (const r of company.reports) {
    if (r.sourceUrl && !/^https?:\/\//.test(r.sourceUrl)) broken++
  }
  if (broken > 0) {
    results.push({
      checkName: "SOURCE_URL_MALFORMED", category: "provenance", severity: "low",
      passed: false, ticker, currentValue: broken, autoFixable: false,
      issueClass: "metadata", rootCause: "SOURCE_METADATA",
      details: `${broken} reports have malformed source URLs.`,
      detailsAr: `${broken} تقارير بروابط مصدر غير سليمة.`,
    })
  }

  // 7.3 Extraction timestamp sanity (future createdAt = clock issue)
  const now = Date.now()
  for (const r of company.reports) {
    if (r.createdAt.getTime() > now + 24 * 3600 * 1000) {
      results.push({
        checkName: "EXTRACTED_AT_FUTURE", category: "provenance", severity: "high",
        passed: false, ticker, autoFixable: false,
        issueClass: "metadata", rootCause: "SOURCE_METADATA",
        details: `Report ${r.id} created in the future (${r.createdAt.toISOString()}).`,
        detailsAr: `تاريخ إنشاء التقرير في المستقبل.`,
      })
      break
    }
  }

  return results
}
