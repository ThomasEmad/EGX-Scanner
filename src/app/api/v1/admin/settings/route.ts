import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"

// GET /api/v1/admin/settings
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const settings = await db.setting.findMany()
  const map: Record<string, unknown> = {}
  for (const s of settings) {
    if (s.type === "number") map[s.key] = Number(s.value)
    else if (s.type === "boolean") map[s.key] = s.value === "true"
    else if (s.type === "json") {
      try { map[s.key] = JSON.parse(s.value) } catch { map[s.key] = s.value }
    } else map[s.key] = s.value
  }
  return Response.json(map)
}

// POST /api/v1/admin/settings
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return unauthorizedResponse()
  try {
    const body = await req.json()
    if (!body || typeof body !== "object") return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 })
    const entries = Array.isArray(body) ? body : [body]
    const results: Record<string, unknown> = {}
    for (const entry of entries) {
      const key = typeof entry?.key === "string" ? entry.key.trim() : ""
      const value = typeof entry?.value === "string" ? entry.value : JSON.stringify(entry?.value ?? "")
      const type = typeof entry?.type === "string" ? entry.type : "string"
      const description = typeof entry?.description === "string" ? entry.description : undefined
      if (!key) continue
      const record = await db.setting.upsert({
        where: { key },
        update: { value, type, description: description ?? undefined },
        create: { key, value, type, description },
      })
      results[record.key] = record.type === "number" ? Number(record.value) : record.type === "boolean" ? record.value === "true" : record.value
    }
    return Response.json(results)
  } catch (e) {
    console.error("settings update error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
