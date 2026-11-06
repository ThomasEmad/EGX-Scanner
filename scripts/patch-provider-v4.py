#!/usr/bin/env python3
"""Apply provider v4 patch: rate-limit-aware patient retry for Pollinations.

Edits /tmp/my-project/src/lib/ai/provider.ts in place and mirrors the result
to /tmp/my-project/scripts/patches/provider.ts (backup convention).
"""
import shutil

TARGET = "/tmp/my-project/src/lib/ai/provider.ts"
MIRROR = "/tmp/my-project/scripts/patches/provider.ts"

src = open(TARGET).read()

edits = [
    (
        'const DEFAULT_TIMEOUT_MS = 90_000\nconst ATTEMPT_GAP_MS = 2_000',
        '''const DEFAULT_TIMEOUT_MS = 90_000
const ATTEMPT_GAP_MS = 2_000
// v4: the anonymous tier answers an occupied per-IP slot with HTTP 200 + a
// JSON error body (never SSE). The slot frees when the other request
// finishes, so WAIT a slice of the unused budget and re-run the attempt.
const PATIENT_RETRY_MAX = 2
const PATIENT_RETRY_WAIT_MS = 12_000
const PATIENT_RETRY_MIN_REMAINING_MS = 20_000''',
    ),
    (
        '''//   If discovery itself fails, the configured names are used unchanged (v2
//   behavior). Future provider-side model retirements now self-heal with zero
//   code or env changes.''',
        '''//   If discovery itself fails, the configured names are used unchanged (v2
//   behavior). Future provider-side model retirements now self-heal with zero
//   code or env changes.
//   v4 (2026-11-07): Pollinations anonymous tier reports a busy per-IP slot
//   as HTTP 200 + JSON body ("RATE_LIMITED") — readSseContent saw no `data:`
//   frames and called it an "empty stream". v4 gates on content-type: a 200
//   without text/event-stream is an error in disguise; a rate-limit body
//   waits a slice of the unused budget and re-runs the SAME attempt (up to 2
//   times), because the per-IP slot frees the moment the other request ends.''',
    ),
    (
        '''  let lastError = ""
  const outcomes: string[] = []''',
        '''  let lastError = ""
  let patientRetries = 0
  const outcomes: string[] = []''',
    ),
    (
        '''      // Accumulate `delta.content` from the SSE stream; `reasoning_content`
      // deltas (GLM reasoning models) are intentionally skipped.
      const content = await readSseContent(res, attempt.timeoutMs)''',
        '''      // v4: non-SSE 200 bodies are provider errors in disguise (Pollinations
      // reports a busy per-IP slot this way). Gate on content-type, log the
      // body preview into the audit trail, and retry patiently on rate-limit.
      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("text/event-stream")) {
        const body = await res.text().catch(() => "")
        if (
          /RATE_LIMITED|"status"\\s*:\\s*429/.test(body.slice(0, 500)) &&
          patientRetries < PATIENT_RETRY_MAX &&
          deadline - Date.now() > PATIENT_RETRY_MIN_REMAINING_MS
        ) {
          patientRetries++
          outcomes.push(
            `${attempt.model}@${attempt.timeoutMs}ms: rate-limited (slot busy) -> patient retry #${patientRetries}`
          )
          await sleep(PATIENT_RETRY_WAIT_MS)
          i--
          continue
        }
        lastError = `AI API error 200 non-SSE: ${body.slice(0, 160)}`
        outcomes.push(`${attempt.model}@${attempt.timeoutMs}ms: 200 non-SSE body`)
        continue
      }

      // Accumulate `delta.content` from the SSE stream; `reasoning_content`
      // deltas (GLM reasoning models) are intentionally skipped.
      const content = await readSseContent(res, attempt.timeoutMs)''',
    ),
]

for old, new in edits:
    if old not in src:
        raise SystemExit(f"ANCHOR NOT FOUND:\n{old[:120]}")
    if src.count(old) != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({src.count(old)}x):\n{old[:120]}")
    src = src.replace(old, new)

open(TARGET, "w").write(src)
shutil.copyfile(TARGET, MIRROR)
print("PATCHED OK ->", TARGET, "| mirrored ->", MIRROR)
