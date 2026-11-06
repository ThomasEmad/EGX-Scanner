#!/usr/bin/env python3
"""Apply provider v4.2 patch on top of v4.1.

ROOT CAUSE FOUND: Pollinations' rate-limit JSON body is a single line with NO
trailing newline. readSseContent only processed complete \n-terminated lines,
so the JSON sat in `buffer` and was discarded — the audit kept saying
"empty stream" while the body was there all along.

v4.2: extract a processLine() helper, flush the trailing buffer after the
read loop, and let the patient retry also trigger when an instant empty 200
arrives with NO raw body at all (an empty body from a streaming endpoint is
anomalous either way — waiting out the per-IP slot is the right move).
"""
import shutil

TARGET = "/tmp/my-project/src/lib/ai/provider.ts"
MIRROR = "/tmp/my-project/scripts/patches/provider.ts"

src = open(TARGET).read()

OLD_FN = '''async function readSseContent(
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
  let done = false
  // Hard ceiling on top of the fetch signal so a stalled stream never lingers.
  const deadline = Date.now() + timeoutMs
  try {
    while (!done && Date.now() < deadline) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf("\\n")) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith("data:")) {
          if (raw.length < 400) raw += (raw ? "\\n" : "") + line
          continue
        }
        const data = line.slice(5).trim()
        if (data === "[DONE]") {
          done = true
          break
        }
        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[]
          }
          const piece = parsed?.choices?.[0]?.delta?.content
          if (typeof piece === "string") content += piece
        } catch {
          // partial/keep-alive frames — skip
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return { content, raw }
}'''

NEW_FN = '''async function readSseContent(
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
  let done = false
  // Hard ceiling on top of the fetch signal so a stalled stream never lingers.
  const deadline = Date.now() + timeoutMs

  // One SSE line. v4.2: JSON error bodies from the provider can be a SINGLE
  // line with no trailing newline — they used to sit in `buffer` and vanish,
  // which made a perfectly-diagnosable rate-limit response look like an
  // "empty stream".
  const processLine = (line: string): void => {
    if (!line) return
    if (!line.startsWith("data:")) {
      if (raw.length < 400) raw += (raw ? "\\n" : "") + line
      return
    }
    const data = line.slice(5).trim()
    if (data === "[DONE]") {
      done = true
      return
    }
    try {
      const parsed = JSON.parse(data) as {
        choices?: { delta?: { content?: string } }[]
      }
      const piece = parsed?.choices?.[0]?.delta?.content
      if (typeof piece === "string") content += piece
    } catch {
      // partial/keep-alive frames — skip
    }
  }

  try {
    while (!done && Date.now() < deadline) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf("\\n")) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        processLine(line)
      }
    }
    // v4.2: flush the trailing line the stream ended without a newline.
    if (buffer.trim()) processLine(buffer.trim())
  } finally {
    reader.cancel().catch(() => {})
  }
  return { content, raw }
}'''

OLD_CALLER = '''      const { content, raw } = await readSseContent(res, attempt.timeoutMs)
      if (!content.trim()) {
        if (
          /RATE_LIMITED|"status"\\s*:\\s*429/.test(raw) &&
          patientRetries < PATIENT_RETRY_MAX &&
          deadline - Date.now() > PATIENT_RETRY_MIN_REMAINING_MS
        ) {'''

NEW_CALLER = '''      const { content, raw } = await readSseContent(res, attempt.timeoutMs)
      if (!content.trim()) {
        // v4.2: patient-retry when the body says rate-limit OR when an
        // instant 200 arrives completely empty — from a streaming endpoint
        // both mean the per-IP slot was taken; it frees once the other
        // request finishes, so waiting out a slice of the unused budget
        // recovers the request instead of degrading to rule-based.
        if (
          (raw.trim() === "" || /RATE_LIMITED|"status"\\s*:\\s*429/.test(raw)) &&
          patientRetries < PATIENT_RETRY_MAX &&
          deadline - Date.now() > PATIENT_RETRY_MIN_REMAINING_MS
        ) {'''

for old, new in [(OLD_FN, NEW_FN), (OLD_CALLER, NEW_CALLER)]:
    if old not in src:
        raise SystemExit(f"ANCHOR NOT FOUND:\n{old[:200]}")
    if src.count(old) != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({src.count(old)}x):\n{old[:200]}")
    src = src.replace(old, new)

open(TARGET, "w").write(src)
shutil.copyfile(TARGET, MIRROR)
print("V4.2 PATCHED OK ->", TARGET, "| mirrored ->", MIRROR)
