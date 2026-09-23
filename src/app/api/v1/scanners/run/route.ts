import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { runScan } from "@/lib/financial/scan-service"
import { validateRuleConditions, type PeriodBasis, type ScanCondition } from "@/lib/financial/scanner"
import { audit } from "@/lib/audit"

// POST /api/v1/scanners/run — run a preset/custom rule or inline conditions.
// Body: { ruleId? , conditions?, periodBasis: "LATEST_ANNUAL" | "LATEST_QUARTERLY" | "LATEST_TTM" }
// Results always include a per-condition explanation (spec #23).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const basis: PeriodBasis =
    body?.periodBasis === "LATEST_QUARTERLY"
      ? "LATEST_QUARTERLY"
      : body?.periodBasis === "LATEST_TTM"
        ? "LATEST_TTM"
        : "LATEST_ANNUAL"

  let conditions: ScanCondition[] | null = null
  let ruleId: string | null = null
  let ruleName = "Ad-hoc scan"

  if (body?.ruleId) {
    const rule = await db.scannerRule.findUnique({ where: { id: body.ruleId } })
    if (!rule) return Response.json({ error: "NOT_FOUND", message: "Scanner rule not found" }, { status: 404 })
    conditions = JSON.parse(rule.conditions) as ScanCondition[]
    ruleId = rule.id
    ruleName = rule.name
  } else if (Array.isArray(body?.conditions)) {
    conditions = body.conditions as ScanCondition[]
    if (typeof body?.name === "string" && body.name.trim()) ruleName = body.name.trim()
  }

  if (!conditions) {
    return Response.json({ error: "VALIDATION", message: "Provide ruleId or conditions" }, { status: 400 })
  }

  const validation = validateRuleConditions(conditions)
  const output = await runScan(conditions, basis)

  // persist run history when tied to a stored rule
  if (ruleId) {
    await db.scannerRun.create({
      data: {
        ruleId,
        ruleName,
        ruleSnapshot: JSON.stringify(conditions),
        periodBasis: basis,
        matchedCount: output.matched.length,
        matchedCompanyIds: JSON.stringify(output.matched.map((m) => m.companyId)),
      },
    })
    await audit("SCAN", { actor: "user", entityType: "ScannerRule", entityId: ruleId, details: `${ruleName} on ${basis}: ${output.matched.length} matched` })
  }

  return Response.json({ ...output, validationErrors: validation.errors, ruleId, ruleName })
}
