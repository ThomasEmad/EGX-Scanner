import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/admin-auth"
import { unauthorizedResponse } from "@/lib/access"

// GET /api/v1/admin/ingestion/runs — list recent ingestion runs with their
// stats and per-stage error counts.
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 100)
  const runs = await db.ingestionRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { errors: { take: 10, orderBy: { createdAt: "desc" } } },
  })
  return Response.json({
    runs: runs.map((r) => ({
      id: r.id,
      runType: r.runType,
      status: r.status,
      sourceAdapter: r.sourceAdapter,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      companyFilter: r.companyFilter,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      companiesProcessed: r.companiesProcessed,
      documentsFound: r.documentsFound,
      documentsDownloaded: r.documentsDownloaded,
      documentsProcessed: r.documentsProcessed,
      documentsFailed: r.documentsFailed,
      valuesExtracted: r.valuesExtracted,
      validationErrors: r.validationErrors,
      errorMessage: r.errorMessage,
      recentErrors: r.errors.map((e) => ({
        stage: e.stage,
        errorType: e.errorType,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt,
        companyId: e.companyId,
      })),
    })),
    count: runs.length,
  })
}
