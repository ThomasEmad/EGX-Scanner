// Company data-quality scoring (v2).
//
// The old single score conflated four different questions:
//   "are the numbers right?"        → accuracy
//   "do we have all the numbers?"   → completeness
//   "are the numbers current?"      → freshness
//   "can we trace the numbers?"     → provenance
//
// A company can have perfectly accurate figures but a missing ISIN, or complete
// figures that are two years old. Showing one number hid that distinction and
// made 99 companies look "critical" when most had no proven data error at all.
//
// Accuracy is the certification dimension: only blockers (material
// contradictions) reduce it. Coverage gaps, advisories and metadata never do.

import type { AuditIssue, AuditSeverity, Certification, ConfidenceBreakdown } from "./types"
import { classifyStoredIssue, type RootCause } from "./issue-class"

export interface ConfInput {
  ticker: string
  latestDataAgeMonths: number
  sources: string[]
  issues: AuditIssue[]
  criticalCoveragePct: number // 0-100
}

export interface ScoreResult {
  score: number
  rating: "high" | "medium" | "low" | "critical"
  breakdown: ConfidenceBreakdown
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))

export function computeConfidenceScore(input: ConfInput): ScoreResult {
  const open = input.issues.filter(i => i.status === "open" || i.status === "auto_fixed")
  const classified = open.map(i => ({ ...i, ...classifyStoredIssue(i) }))

  const blockers = classified.filter(i => i.issueClass === "blocker")
  const coverage = classified.filter(i => i.issueClass === "coverage")
  const advisories = classified.filter(i => i.issueClass === "advisory")
  const metadata = classified.filter(i => i.issueClass === "metadata")

  // ── Accuracy: one penalty per root-cause family, scaled by severity and by
  // how many periods are affected (capped), so a five-year problem is worse
  // than a one-year problem but does not saturate the score.
  const byRoot = new Map<string, { max: AuditSeverity; count: number }>()
  for (const b of blockers) {
    const prev = byRoot.get(b.rootCause)
    if (!prev) byRoot.set(b.rootCause, { max: b.severity as AuditSeverity, count: 1 })
    else {
      prev.count++
      prev.max = worseSeverity(prev.max, b.severity as AuditSeverity)
    }
  }
  let blockerPenalty = 0
  for (const { max, count } of byRoot.values()) {
    const base = max === "critical" ? 30 : max === "high" ? 18 : max === "medium" ? 8 : 2
    blockerPenalty += base + Math.min(10, (count - 1) * 1.5)
  }
  const advisoryPenalty = Math.min(8, advisories.length * 0.5)
  const accuracy = clamp(100 - blockerPenalty - advisoryPenalty)

  // ── Completeness: critical metric coverage + the number of coverage gaps.
  const gapPenalty = Math.min(45, coverage.length * 1.5)
  const completeness = clamp(input.criticalCoveragePct * 0.75 + (100 - gapPenalty) * 0.25)

  // ── Freshness
  const age = input.latestDataAgeMonths
  const freshness = age <= 6 ? 100 : age <= 12 ? 85 : age <= 18 ? 60 : age <= 24 ? 35 : 15

  // ── Provenance
  let provenance = 100
  const isinIssue = metadata.find(m => m.rootCause === "ISIN")
  if (isinIssue) {
    provenance -= isinIssue.description.toLowerCase().includes("placeholder") ? 40 : 20
  }
  const sourceIssue = metadata.find(m => m.rootCause === "SOURCE_METADATA")
  if (sourceIssue) provenance -= 10
  if (input.sources.length === 0) provenance -= 40
  else if (input.sources.length === 1) provenance -= 15
  else if (input.sources.length === 2) provenance -= 5
  provenance = clamp(provenance)

  // ── Overall (accuracy dominates: a wrong number is worse than a missing one)
  const overall = clamp(
    0.5 * accuracy + 0.25 * completeness + 0.15 * freshness + 0.1 * provenance,
  )

  // ── Certification
  const hasBlocker = blockers.length > 0
  const certification: Certification =
    hasBlocker || accuracy < 90
      ? "review_required"
      : accuracy >= 98 && freshness >= 50 && completeness >= 50
        ? "certified"
        : "provisional"

  // ── Legacy penalty fields (kept so the public breakdown stays comparable)
  const accIssues = blockers.filter(i => i.category === "accounting")
  const accPenalty = accIssues.reduce((sum, i) => sum + (i.severity === "critical" ? 12 : i.severity === "high" ? 6 : 2), 0)
  const conflictIssues = blockers.filter(i => i.category === "cross_source")
  const conflictPenalty = conflictIssues.reduce((sum, i) => sum + (i.severity === "critical" ? 15 : i.severity === "high" ? 7 : 3), 0)
  const anomalyIssues = blockers.filter(i => i.category === "temporal")
  const anomalyPenalty = anomalyIssues.reduce((sum, i) => sum + (i.severity === "critical" ? 10 : i.severity === "high" ? 5 : 0), 0)

  const breakdown: ConfidenceBreakdown = {
    coverage: Math.round(Math.min(50, (100 - input.criticalCoveragePct) * 0.5)),
    violations: Math.round(Math.min(50, accPenalty)),
    conflicts: Math.round(Math.min(30, conflictPenalty)),
    anomalies: Math.round(Math.min(30, anomalyPenalty)),
    stale: age > 18 ? 20 : age > 12 ? 10 : age > 9 ? 5 : 0,
    sourceDiversity: input.sources.length === 1 ? 10 : input.sources.length === 2 ? 5 : 0,
    isin: isinIssue ? 20 : 0,
    accuracy: Math.round(accuracy),
    completeness: Math.round(completeness),
    freshness,
    provenance: Math.round(provenance),
    certification,
    blockerCount: blockers.length,
    coverageGapCount: coverage.length,
    advisoryCount: advisories.length,
    metadataCount: metadata.length,
  }

  return {
    score: Math.round(overall),
    rating: overall >= 80 ? "high" : overall >= 60 ? "medium" : overall >= 30 ? "low" : "critical",
    breakdown,
  }
}

const SEVERITY_RANK: Record<AuditSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 }
function worseSeverity(a: AuditSeverity, b: AuditSeverity): AuditSeverity {
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a
}
