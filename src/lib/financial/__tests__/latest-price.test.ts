import { describe, expect, it } from "vitest"
import { latestPriceByCompany } from "../latest-price"

const row = (companyId: string, price: number, iso: string) => ({
  companyId,
  price,
  asOf: new Date(iso),
})

describe("latestPriceByCompany", () => {
  it("keeps the freshest snapshot per company", () => {
    const map = latestPriceByCompany([
      row("A", 10, "2026-01-01"),
      row("A", 12, "2026-06-01"),
      row("A", 11, "2026-03-01"),
      row("B", 5, "2025-12-31"),
    ])
    expect(map.get("A")?.price).toBe(12)
    expect(map.get("B")?.price).toBe(5)
    expect(map.size).toBe(2)
  })

  it("is correct even when rows arrive oldest-first", () => {
    const map = latestPriceByCompany([
      row("A", 10, "2026-01-01"),
      row("A", 12, "2026-06-01"),
    ])
    expect(map.get("A")?.price).toBe(12)
  })

  it("does not treat a missing price as zero", () => {
    const map = latestPriceByCompany([row("A", 0, "2026-01-01")])
    expect(map.get("A")?.price).toBe(0)
    expect(map.get("MISSING")).toBeUndefined()
  })

  it("returns an empty map for no rows", () => {
    expect(latestPriceByCompany([]).size).toBe(0)
  })
})
