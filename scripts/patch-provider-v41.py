#!/usr/bin/env python3
"""Apply provider v4.1 patch on top of v4.

readSseContent now ALSO captures non-`data:` raw lines (JSON error bodies can
arrive labeled text/event-stream, so the content-type gate alone misses them).
On an empty stream, a rate-limit body triggers the patient retry; any other
raw body is logged into the audit error for diagnosis.
"""
import shutil

TARGET = "/tmp/my-project/src/lib/ai/provider.ts"
MIRROR = "/tmp/my-project/scripts/patches/provider.ts"

src = open(TARGET).read()

edits = [
    # 1. readSseContent: capture raw non-data lines and return {content, raw}
    (
        '''async function readSseContent(res: Response, timeoutMs: number): Promise<string> {
  if (!res.body) throw new Error("AI provider returned no response body")
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let content = ""
  let done = false''',
        '''async function readSseContent(
  res: Response,
  timeoutMs: number
): Promise<{ content: string; raw: string }> {
  if (!res.body) throw new Error("AI provider returned no response body")
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let content = ""
  // Error bodies can arrive labeled text/event-stream, so the content-type
  // gate alone misses them — capture every non-`data:` line for diagnosis and
  // rate-limit detection.
  let raw = ""
  let done = false''',
    ),
    (
        '''        if (!line.startsWith("data:")) continue
        const data = line.slice(5).trim()''',
        '''        if (!line.startsWith("data:")) {
          if (raw.length < 400) raw += (raw ? "\\n" : "") + line
          continue
        }
        const data = line.slice(5).trim()''',
    ),
    (
        '''  } finally {
    reader.cancel().catch(() => {})
  }
  return content
}''',
        '''  } finally {
    reader.cancel().catch(() => {})
  }
  return { content, raw }
}''',
    ),
    # 2. caller: unified rate-limit handling for both gate paths
    (
        '''      // Accumulate `delta.content` from the SSE stream; `reasoning_content`
      // deltas (GLM reasoning models) are intentionally skipped.
      const content = await readSseContent(res, attempt.timeoutMs)
      if (!content.trim()) {
        lastError = `empty stream response (model ${attempt.model})`
        outcomes.push(`${attempt.model}@${attempt.timeoutMs}ms: empty stream`)
        continue
      }
      return { content, model: attempt.model }''',
        '''      // Accumulate `delta.content` from the SSE stream; `reasoning_content`
      // deltas (GLM reasoning models) are intentionally skipped.
      const { content, raw } = await readSseContent(res, attempt.timeoutMs)
      if (!content.trim()) {
        if (
          /RATE_LIMITED|"status"\\s*:\\s*429/.test(raw) &&
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
        lastError = raw.trim()
          ? `AI API error 200 non-SSE: ${raw.slice(0, 160)}`
          : `empty stream response (model ${attempt.model})`
        outcomes.push(`${attempt.model}@${attempt.timeoutMs}ms: ${raw.trim() ? "200 non-SSE body" : "empty stream"}`)
        continue
      }
      return { content, model: attempt.model }''',
    ),
]

for old, new in edits:
    if old not in src:
        raise SystemExit(f"ANCHOR NOT FOUND:\n{old[:150]}")
    if src.count(old) != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({src.count(old)}x):\n{old[:150]}")
    src = src.replace(old, new)

open(TARGET, "w").write(src)
shutil.copyfile(TARGET, MIRROR)
print("V4.1 PATCHED OK ->", TARGET, "| mirrored ->", MIRROR)
