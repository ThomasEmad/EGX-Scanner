import { PrismaClient } from '@prisma/client'

// Schema-version-keyed singleton: bumping SCHEMA_VERSION forces a fresh
// PrismaClient after `prisma db push` adds models (otherwise a dev server
// keeps the pre-push client without the new model delegates).
const SCHEMA_VERSION = 'v2-marketprice'
const cacheKey = `prisma_${SCHEMA_VERSION}`

const globalForPrisma = globalThis as unknown as Record<string, PrismaClient | undefined>

export const db =
  globalForPrisma[cacheKey] ??
  new PrismaClient({
    log: process.env.DB_QUERY_LOG === "1" ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma[cacheKey] = db
