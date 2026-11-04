// Auto-fix engine (§7 of the prompt). Allowed fixes ONLY:
//   1. unit normalization (millions/thousands → raw EGP)
//   2. currency normalization flagged (USD→EGP conversion handled at fetch layer)
//   3. period type normalization (LTM vs FY preference — display layer)
//   4. source authority conflict resolution ( prefer higher authority )
//   5. sign error correction (negative → positive for never-negative metrics)
// FORBIDDEN (never auto-fix): balance sheet mismatches, NI > revenue,
//   outlier values, sector classification, ISIN placeholders.

import type { AuditIssue } from "./types"
import { SOURCE_AUTHORITY } from "./cross-source-checks"

export type AutoFixOutcome =
  | { kind: "allowed"; field: "unit" | "sign" | "source"; note: string }
  | { kind: "forbidden"; note: string }
  | { kind: "none" }

export function classifyAutoFix(issue: AuditIssue): AutoFixOutcome {
  switch (issue.category) {
    case "logical":
      if (issue.checkName === "SIGN_ERROR") {
        return { kind: "allowed", field: "sign", note: `Sign error corrected (negative → positive) on ${issue.metricCode}` }
      }
      return { kind: "forbidden", note: "Logical impossibilities require manual review" }

    case "cross_source":
      if (issue.checkName === "UNIT_MISMATCH") {
        return { kind: "allowed", field: "unit", note: "Unit normalized (millions/thousands scale correction)" }
      }
      if (issue.severity === "critical") {
        return { kind: "forbidden", note: "Critical cross-source conflict needs human review" }
      }
      return { kind: "allowed", field: "source", note: `Value from higher-authority source selected` }

    default:
      return { kind: "none" }
  }
}

/** Select winner among cross-source observations (authority hierarchy). */
export function selectAuthorityWinner<T extends { sourceName?: string }>(candidates: T[]): T | undefined {
  return [...candidates].sort((a, b) =>
    (SOURCE_AUTHORITY[(b.sourceName ?? "").toUpperCase()] ?? 0) - (SOURCE_AUTHORITY[(a.sourceName ?? "").toUpperCase()] ?? 0))[0]
}
