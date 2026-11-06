import { db } from "@/lib/db"

export interface UsageWindow {
  year: number
  month: number
  usageCount: number
  remaining: number
  limit: number
  resetAt: string | null
}

export async function getSmartAnalysisUsage(userId: string): Promise<UsageWindow> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const record = await db.smartAnalysisUsage.findUnique({
    where: { userId_year_month: { userId, year, month } },
  })

  const usageCount = record?.usageCount ?? 0
  const resetAt = record?.resetAt ? record.resetAt.toISOString() : new Date(year, month + 1, 1).toISOString()

  return {
    year,
    month,
    usageCount,
    remaining: Math.max(0, 3 - usageCount),
    limit: 3,
    resetAt,
  }
}

export async function incrementSmartAnalysisUsage(userId: string): Promise<void> {
  const { year, month } = userIdYearMonth(userId)
  await db.smartAnalysisUsage.upsert({
    where: { userId_year_month: { userId, year, month } },
    create: {
      userId,
      year,
      month,
      usageCount: 1,
      resetAt: new Date(year, month, 1), // first day of the NEXT month (Date months are 0-based)
    },
    update: {
      usageCount: { increment: 1 },
    },
  })
}

function userIdYearMonth(userId: string): { userId: string; year: number; month: number } {
  const now = new Date()
  return { userId, year: now.getFullYear(), month: now.getMonth() + 1 }
}

/**
 * Atomic quota consumption for the free-tier Smart Analysis limit.
 *
 * Race safety: the previous canUseSmartAnalysis()-then-increment() pair was a
 * check-then-act window — N parallel POSTs all read usageCount=2 and all
 * generated, burning 3+N LLM calls for a 3-call quota. The conditional
 * updateMany ({ usageCount: { lt: limit } }) makes the check and the
 * increment one indivisible write; the create branch handles the missing-row
 * case and the unique-violation retry collapses concurrent creates.
 *
 * Returns true when one unit of quota was consumed, false when the limit is
 * already exhausted.
 */
export async function consumeSmartAnalysisUsage(userId: string, limit = 3): Promise<boolean> {
  const { year, month } = userIdYearMonth(userId)

  // Fast path: row exists and is below the limit → single atomic increment.
  // NOTE: updateMany takes a WhereInput — scalar filters only. The compound
  // unique shorthand (userId_year_month) exists solely on WhereUniqueInput
  // (findUnique/update/upsert) and would throw PrismaClientValidationError.
  const bumped = await db.smartAnalysisUsage.updateMany({
    where: { userId, year, month, usageCount: { lt: limit } },
    data: { usageCount: { increment: 1 } },
  })
  if (bumped.count === 1) return true

  // Row may not exist yet — create it at count 1. Losing a create race to a
  // concurrent request is fine: that request already consumed a unit, so we
  // just re-run the conditional increment against its committed row.
  try {
    await db.smartAnalysisUsage.create({
      data: {
        userId,
        year,
        month,
        usageCount: 1,
        resetAt: new Date(year, month, 1),
      },
    })
    return true
  } catch {
    const retry = await db.smartAnalysisUsage.updateMany({
      where: { userId, year, month, usageCount: { lt: limit } },
      data: { usageCount: { increment: 1 } },
    })
    return retry.count === 1
  }
}

export async function canUseSmartAnalysis(userId: string, isPremium: boolean): Promise<boolean> {
  if (isPremium) return true
  const usage = await getSmartAnalysisUsage(userId)
  return usage.usageCount < 3
}
