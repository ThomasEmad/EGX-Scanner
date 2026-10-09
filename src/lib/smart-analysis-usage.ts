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
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  await db.smartAnalysisUsage.upsert({
    where: { userId_year_month: { userId, year, month } },
    create: {
      userId,
      year,
      month,
      usageCount: 1,
      resetAt: new Date(year, month + 1, 1),
    },
    update: {
      usageCount: { increment: 1 },
    },
  })
}

export async function canUseSmartAnalysis(userId: string, isPremium: boolean): Promise<boolean> {
  if (isPremium) return true
  const usage = await getSmartAnalysisUsage(userId)
  return usage.usageCount < 3
}
