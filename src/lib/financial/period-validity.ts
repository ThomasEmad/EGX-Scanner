// Period validity helpers shared by read paths and the audit engine.
//
// A period whose end date is in the future cannot be an *announced actual*.
// The old audit tolerated 100 days of future dates, which let FY 2026 annual
// reports (periodEnd 2026-12-31) appear on the dashboard as "latest announced"
// in October 2026. A one-day tolerance keeps a filing whose period ends today
// valid while rejecting genuinely future periods.

export const PERIOD_END_TOLERANCE_MS = 24 * 60 * 60 * 1000

/** True when `periodEnd` is later than `now` plus a one-day tolerance. */
export function isFuturePeriodEnd(
  periodEnd: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!periodEnd) return false
  const end = periodEnd instanceof Date ? periodEnd : new Date(periodEnd)
  if (Number.isNaN(end.getTime())) return false
  return end.getTime() > now.getTime() + PERIOD_END_TOLERANCE_MS
}

/** Latest periodEnd that can be treated as an announced actual. */
export function latestAnnouncedPeriodEnd(now: Date = new Date()): Date {
  return new Date(now.getTime() + PERIOD_END_TOLERANCE_MS)
}
