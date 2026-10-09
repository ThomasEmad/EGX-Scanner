import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/admin-auth"
import { unauthorizedResponse } from "@/lib/access"
import { runIngestion, type IngestionRequest } from "@/lib/ingestion/orchestrator"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/ingestion/run — start an ingestion run for one or more
// company+period combinations. Returns the runId + per-company outcomes.
//
// Body: { companies?: string[]; period?: { fiscalYear: number; periodType?: string }; minConfidence?: number }
// If companies is omitted, all active companies are processed.
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const body = await req.json().catch(() => ({})) as {
    companies?: string[]
    fiscalYear?: number
    periodType?: string
    minConfidence?: number
  }
  const fiscalYear = body.fiscalYear ?? new Date().getFullYear() - 1
  const periodType = body.periodType ?? "ANNUAL"

  const companies = body.companies && body.companies.length > 0
    ? await db.company.findMany({ where: { id: { in: body.companies }, isActive: true } })
    : await db.company.findMany({ where: { isActive: true }, take: 20 })

  if (companies.length === 0) {
    return Response.json({ error: "NO_COMPANIES", message: "No active companies to ingest" }, { status: 400 })
  }

  const reqs: IngestionRequest[] = companies.map((c) => ({
    companyId: c.id,
    fiscalYear,
    periodType,
    minConfidence: body.minConfidence,
  }))

  await audit("INGEST_START", { actor: "admin", entityType: "IngestionRun", details: `Starting ingestion for ${companies.length} companies, FY ${fiscalYear} ${periodType}` })

  // Run ingestion in the background; the HTTP response returns immediately
  // with the runId so the caller can poll /runs for status.
  const result = await runIngestion(reqs)
  return Response.json({
    ok: true,
    runId: result.runId,
    companiesRequested: companies.length,
    outcomes: result.outcomes.map((o) => ({
      companyId: o.companyId,
      fiscalYear: o.fiscalYear,
      documentsDiscovered: o.documentsDiscovered,
      documentsVerified: o.documentsVerified,
      documentsDownloaded: o.documentsDownloaded,
      documentsStored: o.documentsStored,
      documentsFailed: o.documentsFailed,
      valuesExtracted: o.valuesExtracted,
      durationMs: o.durationMs,
      errorCount: o.errors.length,
    })),
  })
}
