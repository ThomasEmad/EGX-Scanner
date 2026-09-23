import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// DELETE /api/v1/scanners/[id] — remove a custom rule (presets cannot be deleted)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(_req)) return unauthorizedResponse()
  const { id } = await params
  const rule = await db.scannerRule.findUnique({ where: { id } })
  if (!rule) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  if (rule.isPreset) return Response.json({ error: "FORBIDDEN", message: "Preset rules cannot be deleted" }, { status: 403 })
  await db.scannerRule.delete({ where: { id } })
  await audit("SCAN_RULE_DELETE", { actor: "admin", entityType: "ScannerRule", entityId: id, details: rule.name })
  return Response.json({ ok: true })
}
