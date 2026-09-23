// Audit logging helper (spec #31 — structured logging of manual edits, calculations, scans...)

import { db } from "@/lib/db"

export async function audit(
  action: string,
  opts: { actor?: string; entityType?: string; entityId?: string; details?: string } = {}
) {
  try {
    await db.auditLog.create({
      data: {
        actor: opts.actor ?? "system",
        action,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        details: opts.details ?? null,
      },
    })
  } catch (e) {
    console.error("audit log failed", e)
  }
}
