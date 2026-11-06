import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { validateRuleConditions, type ScanCondition } from "@/lib/financial/scanner"
import { requireAuth, unauthorizedResponse } from "@/lib/access"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"

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
// unavailable metrics are never silently ignored, spec #22).
// Security: requires a signed-in user — anonymous visitors could otherwise
// pollute the rules table / squat names (the classic open-write-endpoint hack).
// Deletion remains admin-only.
const NAME_MAX = 120
const DESCRIPTION_MAX = 500
const MAX_CONDITIONS = 12

export async function POST(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) return await unauthorizedResponse()

  const ip = getClientIp(req)
  const rateLimit = await checkEndpointRateLimit("scanner-create", ip)
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    return Response.json(
      { error: "RATE_LIMITED", message: "Too many scanner saves. Please try again later.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "VALIDATION", message: "Rule name is required" }, { status: 400 })
  }
  if (body.name.trim().length > NAME_MAX || (typeof body.nameAr === "string" && body.nameAr.trim().length > NAME_MAX)) {
    return Response.json({ error: "VALIDATION", message: `Name is limited to ${NAME_MAX} characters` }, { status: 400 })
  }
  if (typeof body.description === "string" && body.description.trim().length > DESCRIPTION_MAX) {
    return Response.json({ error: "VALIDATION", message: `Description is limited to ${DESCRIPTION_MAX} characters` }, { status: 400 })
  }
  const conditions = body.conditions
  if (!Array.isArray(conditions) || conditions.length === 0 || conditions.length > MAX_CONDITIONS) {
    return Response.json(
      { error: "VALIDATION", message: `Conditions must be a non-empty list of at most ${MAX_CONDITIONS} items` },
      { status: 400 }
    )
  }
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
      createdBy: userId,
    },
  })
  await audit("SCAN_RULE_CREATE", { actor: userId, entityType: "ScannerRule", entityId: rule.id, details: rule.name })
  return Response.json({ rule: { id: rule.id, name: rule.name, nameAr: rule.nameAr, description: rule.description, isPreset: false, presetKey: null, conditions: JSON.parse(rule.conditions), createdBy: rule.createdBy } }, { status: 201 })
}
