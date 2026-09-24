import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// GET /api/v1/admin/plans
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" } })
  return Response.json({ plans })
}

// POST /api/v1/admin/plans
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return unauthorizedResponse()
  try {
    const body = await req.json()
    const plan = await db.plan.create({
      data: {
        name: typeof body?.name === "string" ? body.name : "NEW",
        price: typeof body?.price === "number" ? body.price : 0,
        currency: typeof body?.currency === "string" ? body.currency : "EGP",
        durationDays: typeof body?.durationDays === "number" ? body.durationDays : 30,
        features: typeof body?.features === "string" ? body.features : "[]",
        isActive: body?.isActive !== false,
        isDefault: body?.isDefault === true,
        sortOrder: typeof body?.sortOrder === "number" ? body.sortOrder : 0,
      },
    })
    await audit("PLAN_CREATED", { actor: req.headers.get("x-admin-token") || "admin", entityType: "Plan", entityId: plan.id, details: `Created plan ${plan.name}` })
    return Response.json(plan, { status: 201 })
  } catch (e) {
    console.error("create plan error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
