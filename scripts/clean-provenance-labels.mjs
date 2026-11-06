// Clean provenance/internal-marker labels that leak into the user-facing UI.
//
// The statements table on the company page shows each row's source label
// (originalLabel) as a bilingual hint. That is useful for real line items
// ("Capital Stock"), but values imported by maintenance tooling carry internal
// markers in the label — "COPIED from H1 2026 balance sheet (source: ...)",
// "AUDIT_QUARANTINE: ...", "ASKBORA_SYNC ...". Those must never be visible to
// end users (product decision: no data provenance in the public UI).
//
// This script rewrites such labels to the canonical registry label for the
// metric (labelEn from /api/v1/metrics, falling back to a prettified code).
// Only rows that are actually user-visible are touched: validationStatus=VALID
// (the public APIs filter to VALID everywhere). Admin-only views keep their
// notes untouched — provenance stays useful for the review workflow there.
//
// Usage:
//   node scripts/clean-provenance-labels.mjs           → dry run (default)
//   node scripts/clean-provenance-labels.mjs --apply   → rewrite labels
//
// Every apply writes an AuditLog entry (actor: maintenance-script).

import { PrismaClient } from "@prisma/client"

const APPLY = process.argv.includes("--apply")
const PORT = process.env.PORT || "3000"
const BASE = `http://127.0.0.1:${PORT}`

const db = new PrismaClient()

// Internal markers that must never reach a public page. Kept explicit so the
// rewrite is deterministic and reviewable.
const MARKER_TESTS = [
  (l) => l.startsWith("COPIED from"),
  (l) => /askborsa/i.test(l),
  (l) => /yahoo/i.test(l),
  (l) => l.includes("AUDIT_QUARANTINE"),
  (l) => l.includes("(source:"),
  (l) => /\(derived/i.test(l),
  (l) => /^DERIVED /.test(l),
  (l) => /copied from/i.test(l),
  (l) => /MEDIAN[_ ]?FILL/i.test(l),
  (l) => /\bIMPUTED\b/i.test(l),
  (l) => /\bCARRY[- ]?FORWARD\b/i.test(l),
  (l) => /annual summary/i.test(l),
]

const isMarked = (label) => MARKER_TESTS.some((t) => t(label))

// A raw metric code ("NET_PROFIT_PARENT") is tooling output, not a label —
// replace it with the canonical registry name.
const isRawCode = (s) => /^[A-Z0-9_]+$/.test(s)

// Labels that are entirely tooling output (no human-readable line item inside)
// fall straight back to the canonical registry label.
const PURE_TOOLING = /^(askborsa|derived|copied|q4 balance sheet copied|fy\d{4} annual summary)/i

function cleanLabel(label, code, canonical) {
  const canon = canonical[code] ?? prettifyCode(code)
  const l = label.trim()
  if (PURE_TOOLING.test(l)) return canon
  // "<line item> (AskBorsa Q1 2025)" / "(source: …)" / "(derived: …)" →
  // keep the human line-item name, drop the tooling parenthetical.
  const stripped = l.replace(/\s*\((?:askborsa|source|yahoo|derived)[^)]*\)\s*$/i, "").trim()
  if (stripped && stripped !== l) {
    if (isRawCode(stripped)) return canon
    if (PURE_TOOLING.test(stripped)) return canon
    return stripped
  }
  return canon
}

function prettifyCode(code) {
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

async function loadCanonicalLabels() {
  try {
    const res = await fetch(`${BASE}/api/v1/metrics`)
    if (!res.ok) throw new Error(`metrics API ${res.status}`)
    const data = await res.json()
    const map = {}
    for (const m of data.rawMetrics ?? []) map[m.code] = m.labelEn
    return map
  } catch (e) {
    console.warn(`[warn] could not load registry from ${BASE} (${e.message}) — falling back to prettified codes`)
    return {}
  }
}

async function main() {
  const canonical = await loadCanonicalLabels()

  // marked VALID rows only — exactly the set the public APIs serve
  const candidates = await db.financialValue.findMany({
    where: { validationStatus: "VALID" },
    select: { id: true, metricCode: true, originalLabel: true },
  })
  const rows = candidates.filter((r) => r.originalLabel && isMarked(r.originalLabel))

  console.log(`[clean-labels] marked VALID labels found: ${rows.length}`)
  const byMetric = {}
  for (const r of rows) {
    byMetric[r.metricCode] = (byMetric[r.metricCode] ?? 0) + 1
    const to = cleanLabel(r.originalLabel, r.metricCode, canonical)
    console.log(`  ${r.metricCode}: "${r.originalLabel}" → "${to}"`)
  }
  console.log(`[clean-labels] by metric:`, JSON.stringify(byMetric))

  if (!APPLY) {
    console.log("[clean-labels] dry run — nothing written. Re-run with --apply to rewrite labels.")
    await db.$disconnect()
    return
  }
  if (rows.length === 0) {
    console.log("[clean-labels] nothing to do.")
    await db.$disconnect()
    return
  }

  let updated = 0
  for (const r of rows) {
    const to = cleanLabel(r.originalLabel, r.metricCode, canonical)
    if (to === r.originalLabel) continue
    const res = await db.financialValue.updateMany({
      where: { id: r.id, validationStatus: "VALID" },
      data: { originalLabel: to },
    })
    updated += res.count
  }
  console.log(`[clean-labels] applied: ${updated}/${rows.length} labels rewritten`)

  await db.auditLog.create({
    data: {
      actor: "maintenance-script",
      action: "CLEAN_PROVENANCE_LABELS",
      entityType: "FinancialValue",
      details: `Rewrote ${updated} user-visible labels carrying internal markers (AskBorsa refs, copy notes, derivation formulas, source refs) to clean line-item/canonical registry labels. Metrics: ${Object.keys(byMetric).join(", ") || "none"}.`,
    },
  })
  console.log("[clean-labels] audit log written.")
  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
