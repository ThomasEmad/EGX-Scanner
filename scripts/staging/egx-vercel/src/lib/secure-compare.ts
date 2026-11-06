// Timing-safe secret comparison utilities.
//
// Plain `===` on secrets leaks length/prefix information through timing
// side-channels. We hash both sides with SHA-256 first so the buffers are
// always 32 bytes, then compare in constant time — safe for any input length.
// Same primitive doubles as the token hasher: the DB stores only a SHA-256
// hash of session tokens, never the raw token (a DB leak must not yield
// working sessions).

import { createHash, timingSafeEqual } from "node:crypto"

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest()
}

/** Constant-time string equality (safe for secrets of any length). */
export function secureCompare(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  return timingSafeEqual(digest(a), digest(b))
}

/** Validates an `Authorization: Bearer <secret>` header against a configured secret. */
export function secureBearerMatch(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret) return false
  if (!header) return false
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return false
  return secureCompare(match[1], secret)
}

/**
 * SHA-256 hex of a session token. Sessions are stored hashed: createSession
 * returns the raw token to the client once, the DB keeps only this hash.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}
