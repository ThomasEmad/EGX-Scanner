// Next.js instrumentation — runs once when the server process boots.
// Warms the expensive market-wide caches (scanner contexts + dashboard preset
// cards) in the background so the first visitor doesn't pay the ~20s build cost.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  // On Vercel every function instance is ephemeral: a market-wide warm-up at
  // boot burns ~20s and hundreds of MB per instance (four full-scanner
  // contexts over all companies) for caches that die with the instance, and
  // the giant cross-company queries repeatedly trip Turso's server-side
  // response-memory guard ("Resource exhausted: mem_hrana_response") — the
  // OOM-killed instances and 500 responses of 2026-11-06 came exactly from
  // this. Only the long-lived standalone server warms caches at boot.
  const isServerless = Boolean(process.env.VERCEL)

  // Fail-loud (not fail-crash) config check — a standalone server that boots
  // with a missing ADMIN_PASSCODE would otherwise only fail on first admin
  // login, far from the cause.
  try {
    const { validateEnv } = await import("@/lib/env")
    validateEnv()
  } catch (e) {
    console.error("[boot] MISSING REQUIRED ENV:", e instanceof Error ? e.message : e)
  }

  // Surface silent background failures (SWR refreshers, SSE timers, spawned
  // scripts) — unlogged rejections made production issues undiscoverable.
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason instanceof Error ? (reason.stack ?? reason.message) : reason)
  })
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err?.stack ?? String(err))
  })

  // Expired user sessions accumulate forever without this (rows are only
  // deleted lazily when the exact token is re-presented). Daily is plenty.
  const cleanupSessions = async () => {
    try {
      const { cleanupExpiredSessions } = await import("@/lib/auth")
      await cleanupExpiredSessions()
    } catch {
      // best-effort
    }
  }
  setTimeout(() => void cleanupSessions(), 5 * 60 * 1000).unref?.()
  setInterval(() => void cleanupSessions(), 24 * 60 * 60 * 1000).unref?.()
  // SQLite durability/scale pragmas. WAL lets readers and the (single) writer
  // run concurrently — with the default journal mode every write blocked all
  // reads, which is fatal at 10k concurrent visitors. journal_mode is a
  // persistent DB property; asserting it here makes restores self-healing.
  // (Turso rejects PRAGMA statements over its HTTP protocol — skip there.)
  if (!process.env.TURSO_DATABASE_URL) {
    try {
      const { db } = await import("@/lib/db")
      // journal_mode/busy_timeout PRAGMAs RETURN a result row — they must run
      // through $queryRawUnsafe ($executeRawUnsafe rejects result-returning
      // statements on SQLite).
      await db.$queryRawUnsafe("PRAGMA journal_mode=WAL;")
      await db.$executeRawUnsafe("PRAGMA synchronous=NORMAL;")
      await db.$queryRawUnsafe("PRAGMA busy_timeout=10000;")
    } catch {
      // best-effort: the DB was switched to WAL persistently; ignore boot races
    }
  }
  if (!isServerless) {
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
    }, 0)
  }
}
