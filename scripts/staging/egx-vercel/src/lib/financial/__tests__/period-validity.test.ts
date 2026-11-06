import { describe, it, expect } from "vitest"
import { isFuturePeriodEnd, latestAnnouncedPeriodEnd } from "../period-validity"

describe("period validity", () => {
  const now = new Date("2026-10-29T12:00:00.000Z")

  it("rejects a period that ends in the future", () => {
    expect(isFuturePeriodEnd("2026-12-31T00:00:00.000Z", now)).toBe(true)
    expect(isFuturePeriodEnd(new Date("2026-10-31T00:00:00.000Z"), now)).toBe(true)
  })

  it("accepts a period that ends today or earlier", () => {
    expect(isFuturePeriodEnd("2026-10-29T00:00:00.000Z", now)).toBe(false)
    expect(isFuturePeriodEnd("2026-09-30T00:00:00.000Z", now)).toBe(false)
  })

  it("does not invent a future date from missing/invalid input", () => {
    expect(isFuturePeriodEnd(null, now)).toBe(false)
    expect(isFuturePeriodEnd(undefined, now)).toBe(false)
    expect(isFuturePeriodEnd("not-a-date", now)).toBe(false)
  })

  it("exposes the same cutoff used by read paths", () => {
    expect(latestAnnouncedPeriodEnd(now).toISOString()).toBe("2026-10-30T12:00:00.000Z")
  })
})
