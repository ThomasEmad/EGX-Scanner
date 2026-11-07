import { PrismaClient } from '@prisma/client'

// Postgres-first Prisma client (Neon / Supabase / Vercel Postgres compatible).
//
//   • DATABASE_URL = postgres://… (or postgresql://…) → standard Prisma engine.
//     On serverless (Vercel) point it at the POOLED connection string
//     (Supabase :6543 pgbouncer / Neon -pooler host) and keep the direct
//     (unpooled) URL for migrations and one-off scripts.
//
//   • Migration note: production ran on Turso/libSQL until the free plan's
//     row-read quota blocked all queries. The stack moved to hosted Postgres;
//     the libSQL adapter path was removed (see git history for db.ts v3).
//
const SCHEMA_VERSION = 'v4-postgres'
const cacheKey = `prisma_${SCHEMA_VERSION}`

const globalForPrisma = globalThis as unknown as Record<string, PrismaClient | undefined>

function buildPrismaClient(): PrismaClient {
  const log = process.env.DB_QUERY_LOG === "1" ? ['query' as const] : ['error' as const]
  return new PrismaClient({ log })
}

// Exported for prisma/seed*.ts (they run outside the Next.js server process
// but must connect to the same target database).
export { buildPrismaClient }

export const db =
  globalForPrisma[cacheKey] ??
  buildPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma[cacheKey] = db
