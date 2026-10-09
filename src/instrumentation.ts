// Next.js instrumentation — runs once when the server process boots.
// Warms the expensive market-wide caches (scanner contexts + dashboard preset
// cards) in the background so the first visitor doesn't pay the ~20s build cost.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  setTimeout(() => {
    void (async () => {
      try {
        const { getPresetScannerCards, buildScanContextsCached } = await import("@/lib/financial/scan-service")
        await Promise.allSettled([
          getPresetScannerCards(),
          buildScanContextsCached("LATEST_ANNUAL"),
          buildScanContextsCached("LATEST_QUARTERLY"),
          buildScanContextsCached("LATEST_TTM"),
        ])
      } catch {
        // warm-up is best-effort; the cache fills on first real request otherwise
      }
    })()
  }, 3000)
}
