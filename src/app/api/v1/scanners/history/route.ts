import { db } from "@/lib/db"

// GET /api/v1/scanners/history — recent scanner runs (audit of what was scanned,
// when, on which basis, and how many companies matched).

export async function GET() {
  const runs = await db.scannerRun.findMany({
    include: { rule: { select: { isPreset: true, presetKey: true } } },
    orderBy: { ranAt: "desc" },
    take: 20,
  })
  return Response.json({
    runs: runs.map((r) => ({
      id: r.id,
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      isPreset: r.rule?.isPreset ?? false,
      periodBasis: r.periodBasis,
      matchedCount: r.matchedCount,
      matchedCompanyIds: JSON.parse(r.matchedCompanyIds) as string[],
      ranAt: r.ranAt,
    })),
  })
}
