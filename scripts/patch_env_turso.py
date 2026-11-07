#!/usr/bin/env python3
"""Patch env.ts: DATABASE_URL is satisfied by TURSO_DATABASE_URL too (the
Vercel/Turso deployment only sets the TURSO_* pair — the fail-loud boot check
logged a scary 'MISSING REQUIRED ENV: DATABASE_URL' on every instance even
though the dual-mode db client was perfectly connected)."""
import io, sys, shutil

SRC = "/tmp/my-project/src/lib/env.ts"
BAK = "/home/z/my-project/scripts/patches/env-pre-turso.ts.bak"

OLD = '''const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "ADMIN_PASSCODE",
]'''
NEW = '''// DATABASE_URL (local SQLite mode) OR TURSO_DATABASE_URL (Vercel/Turso mode)
// — the dual-mode db client in src/lib/db.ts accepts either.
const DATABASE_URL_VARS = ["DATABASE_URL", "TURSO_DATABASE_URL"]
const REQUIRED_ENV_VARS = [
  ...DATABASE_URL_VARS,
  "ADMIN_PASSCODE",
]'''

OLD_CHECK = '''export function validateEnv() {
  const missing: string[] = []
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`)
  }
}'''
NEW_CHECK = '''export function validateEnv() {
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
}'''

shutil.copy(SRC, BAK)
text = io.open(SRC, encoding="utf-8").read()
for old, new in [(OLD, NEW), (OLD_CHECK, NEW_CHECK)]:
    if old not in text:
        print("BLOCK NOT FOUND:", old[:50].replace("\n", "\\n")); sys.exit(1)
    text = text.replace(old, new, 1)
io.open(SRC, "w", encoding="utf-8").write(text)
print("patched OK")
