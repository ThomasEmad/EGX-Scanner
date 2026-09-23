import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { validateRuleConditions, type ScanCondition } from "@/lib/financial/scanner"
import { audit } from "@/lib/audit"

// GET /api/v1/scanners — preset + custom scanner rules
export async function GET() {
  const rules = await db.scannerRule.findMany({
    where: { isActive: true },
    orderBy: [{ isPreset: "desc" }, { createdAt: "asc" }],
  })
  return Response.json({
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      nameAr: r.nameAr,
      description: r.description,
      isPreset: r.isPreset,
      presetKey: r.presetKey,
      conditions: JSON.parse(r.conditions),
      createdBy: r.createdBy,
    })),
  })
}

// POST /api/v1/scanners — save a custom scanner rule (conditions are validated —
// unavailable metrics are never silently ignored, spec #22)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "VALIDATION", message: "Rule name is required" }, { status: 400 })
  }
  const conditions = body.conditions
  const validation = validateRuleConditions(conditions as ScanCondition[])
  if (!validation.valid) {
    return Response.json({ error: "VALIDATION", message: "Invalid rule", errors: validation.errors }, { status: 400 })
  }

  const existing = await db.scannerRule.findUnique({ where: { name: body.name.trim() } })
  if (existing) {
    return Response.json({ error: "DUPLICATE", message: "A rule with this name already exists" }, { status: 409 })
  }

  const rule = await db.scannerRule.create({
    data: {
      name: body.name.trim(),
      nameAr: body.nameAr?.trim() || null,
      description: body.description?.trim() || null,
      isPreset: false,
      conditions: JSON.stringify(conditions),
      createdBy: "admin",
    },
  })
  await audit("SCAN_RULE_CREATE", { actor: "admin", entityType: "ScannerRule", entityId: rule.id, details: rule.name })
  return Response.json({ rule: { id: rule.id, name: rule.name, nameAr: rule.nameAr, description: rule.description, isPreset: false, presetKey: null, conditions: JSON.parse(rule.conditions), createdBy: rule.createdBy } }, { status: 201 })
}
