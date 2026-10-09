import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"

// GET /api/v1/admin/dashboard — admin-only dashboard stats.
// Returns internal counts that should not be exposed to regular users.

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return await unauthorizedResponse()
  }

  const [pendingReview, pendingReports] = await Promise.all([
    db.financialValue.count({ where: { validationStatus: "NEEDS_REVIEW" } }),
    db.financialReport.count({ where: { processingStatus: { in: ["NEW_DOWNLOADED", "NEEDS_REVIEW"] } } }),
  ])

  return Response.json({
    stats: {
      pendingReview,
      pendingReports,
    },
  })
}
