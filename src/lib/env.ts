// Environment validation — fail fast on missing required production config.

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "ADMIN_PASSCODE",
]

const OPTIONAL_ENV_VARS = [
  "NEXT_PUBLIC_TEMP_EDIT_MODE",
]

export function validateEnv() {
  const missing: string[] = []
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
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
