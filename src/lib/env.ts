// Environment validation — fail fast on missing required production config.

// DATABASE_URL (local SQLite mode) OR TURSO_DATABASE_URL (Vercel/Turso mode)
// — the dual-mode db client in src/lib/db.ts accepts either.
const DATABASE_URL_VARS = ["DATABASE_URL", "TURSO_DATABASE_URL"]
const REQUIRED_ENV_VARS = [
  ...DATABASE_URL_VARS,
  "ADMIN_PASSCODE",
]

const OPTIONAL_ENV_VARS = [
  "NEXT_PUBLIC_TEMP_EDIT_MODE",
]

export function validateEnv() {
  const missing: string[] = []
  for (const key of REQUIRED_ENV_VARS) {
    // any one of a DB-URL group satisfies the database requirement
    const group = DATABASE_URL_VARS.includes(key) ? DATABASE_URL_VARS : [key]
    if (!group.some((k) => process.env[k])) {
      missing.push(key)
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`)
  }
}

export function getEnv(key: string, fallback?: string): string {
  const value = process.env[key]
  if (!value && fallback === undefined) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value || fallback || ""
}
