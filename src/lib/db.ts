import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

// Schema-version-keyed singleton: bumping SCHEMA_VERSION forces a fresh
// PrismaClient after `prisma db push` adds models (otherwise a dev server
// keeps the pre-push client without the new model delegates).
const SCHEMA_VERSION = 'v3-turso'
const cacheKey = `prisma_${SCHEMA_VERSION}`

const globalForPrisma = globalThis as unknown as Record<string, PrismaClient | undefined>

// ---------------------------------------------------------------------------
// Dual-mode Prisma client (Vercel/Turso + local SQLite):
//
//  • TURSO_DATABASE_URL set (libsql://… or file:…) → connect through the
//    libSQL driver adapter. This is the Vercel production path: Turso is a
//    hosted, SQLite-compatible database, so the schema and every query stay
//    identical to the local SQLite file mode.
//  • No TURSO_DATABASE_URL → classic SQLite client driven by DATABASE_URL
//    (local dev, sandbox server). Zero behaviour change.
// ---------------------------------------------------------------------------

function buildPrismaClient(): PrismaClient {
  const log = process.env.DB_QUERY_LOG === "1" ? ['query' as const] : ['error' as const]

  const tursoUrl = (process.env.TURSO_DATABASE_URL || '').trim()
  if (tursoUrl) {
    // The adapter builds its own @libsql/client connection from this config
    // (libsql://… + auth token for Turso, or file:… for local adapter tests).
    const adapter = new PrismaLibSQL({
      url: tursoUrl,
      authToken: (process.env.TURSO_AUTH_TOKEN || '').trim() || undefined,
    })
    return new PrismaClient({
      adapter,
      log,
    })
  }

  return new PrismaClient({ log })
}

// Exported for prisma/seed*.ts (they run outside the Next.js server process
// but must connect to the same target database — including Turso).
export { buildPrismaClient }

export const db =
  globalForPrisma[cacheKey] ??
  buildPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma[cacheKey] = db
