import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const trusted = ["VALIDATED", "APPROVED", "EXTRACTED"]
const [allReports, trustedReports, nonDeleted, validAll, validTrusted, validTrustedNonDeleted, needsReview] = await Promise.all([
  db.financialReport.count(),
  db.financialReport.count({ where: { processingStatus: { in: trusted } } }),
  db.financialReport.count({ where: { deletedAt: null } }),
  db.financialValue.count({ where: { validationStatus: "VALID" } }),
  db.financialValue.count({ where: { validationStatus: "VALID", report: { processingStatus: { in: trusted } } } }),
  db.financialValue.count({ where: { validationStatus: "VALID", report: { processingStatus: { in: trusted }, deletedAt: null } } }),
  db.financialValue.count({ where: { validationStatus: "NEEDS_REVIEW" } }),
])
console.log(JSON.stringify({ allReports, trustedReports, nonDeleted, validAll, validTrusted, validTrustedNonDeleted, needsReview }, null, 2))
await db.$disconnect()
