import { describe, it, expect } from "vitest"
import { withKeyLock } from "../key-lock"

describe("withKeyLock (per-key async mutex)", () => {
  it("serializes concurrent calls on the same key", async () => {
    const order: string[] = []
    let active = 0
    let maxActive = 0

    const task = (id: string, delayMs: number) => async () => {
      active++
      maxActive = Math.max(maxActive, active)
      order.push(`start:${id}`)
      await new Promise((r) => setTimeout(r, delayMs))
      order.push(`end:${id}`)
      active--
    }

    await Promise.all([
      withKeyLock("k", task("a", 15)),
      withKeyLock("k", task("b", 5)),
      withKeyLock("k", task("c", 1)),
    ])

    expect(maxActive).toBe(1) // never two holders at once
    expect(order).toEqual([
      "start:a", "end:a",
      "start:b", "end:b",
      "start:c", "end:c",
    ])
  })

  it("runs different keys in parallel", async () => {
    let aStarted = false
    let aDone = false

    const a = withKeyLock("k1", async () => {
      aStarted = true
      await new Promise((r) => setTimeout(r, 30))
      aDone = true
    })
    const b = withKeyLock("k2", async () => {
      // b must not wait for a's key
      expect(aStarted).toBe(true)
      expect(aDone).toBe(false)
    })

    await Promise.all([a, b])
    expect(aDone).toBe(true)
  })

  it("propagates the fn's rejection but keeps the queue usable", async () => {
    await expect(
      withKeyLock("err", async () => {
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")

    // the next caller still runs (queue not poisoned by the failed holder)
    const result = await withKeyLock("err", async () => "recovered")
    expect(result).toBe("recovered")
  })

  it("returns the fn's result", async () => {
    const result = await withKeyLock("val", async () => 42)
    expect(result).toBe(42)
  })
})
