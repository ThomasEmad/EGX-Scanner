import { db } from "@/lib/db"

// GET /api/v1/settings/public
export async function GET() {
  const keys = [
    "PREMIUM_ENABLED",
    "ADS_ENABLED",
    "PREMIUM_PRICE",
    "PREMIUM_CURRENCY",
    "PREMIUM_DURATION_DAYS",
    "PAYMENT_PHONE",
    "WHATSAPP_NUMBER",
    "PAYMENT_INSTRUCTIONS",
  ]
  const settings = await db.setting.findMany({ where: { key: { in: keys } } })
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
