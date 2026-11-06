// Local sanity test for v4.2 readSseContent logic (processLine + trailing flush).
// Feeds: (a) the REAL Pollinations 429 body (single line, NO trailing newline),
// (b) a normal SSE stream with content, (c) SSE without final [DONE] newline.

const BODY_429 = '{"status":429,"success":false,"error":{"code":"RATE_LIMITED","message":"Your previous request is still running. The Classic API answers 1 request at a time per IP."},"timestamp":"2026-11-06T19:36:12.055Z","fixUrl":"https://enter.pollinations.ai/?ref=classic"}'

const SSE_NORMAL = [
  'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{"reasoning":"thinking..."}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{"content":"Revenue"}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{"content":" is up."}}]}',
  '',
  'data: [DONE]',
  '',
].join('\n')

const SSE_NO_FINAL_NL = 'data: {"choices":[{"index":0,"delta":{"content":"Tail line."}}]}\ndata: [DONE]'

async function readSseLike(body, timeoutMs = 5000) {
  let buffer = '', content = '', raw = '', done = false
  const deadline = Date.now() + timeoutMs
  const processLine = (line) => {
    if (!line) return
    if (!line.startsWith('data:')) {
      if (raw.length < 400) raw += (raw ? '\n' : '') + line
      return
    }
    const data = line.slice(5).trim()
    if (data === '[DONE]') { done = true; return }
    try {
      const parsed = JSON.parse(data)
      const piece = parsed?.choices?.[0]?.delta?.content
      if (typeof piece === 'string') content += piece
    } catch { /* skip */ }
  }
  const stream = new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(body)); c.close() },
  })
  const res = new Response(stream)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  try {
    while (!done && Date.now() < deadline) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let nl
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        processLine(line)
      }
    }
    if (buffer.trim()) processLine(buffer.trim())
  } finally {
    reader.cancel().catch(() => {})
  }
  return { content, raw }
}

const a = await readSseLike(BODY_429)
console.log('A) 429 single-line body  -> content:', JSON.stringify(a.content), '| raw ok:', a.raw.includes('RATE_LIMITED') && a.raw.includes('429'))

const b = await readSseLike(SSE_NORMAL)
console.log('B) normal SSE           -> content:', JSON.stringify(b.content), '| raw:', JSON.stringify(b.raw))

const c = await readSseLike(SSE_NO_FINAL_NL)
console.log('C) SSE no final newline -> content:', JSON.stringify(c.content), '| raw:', JSON.stringify(c.raw))

const empty = await readSseLike('')
console.log('D) empty 200 body       -> content:', JSON.stringify(empty.content), '| raw:', JSON.stringify(empty.raw))

if (!a.raw.includes('RATE_LIMITED')) throw new Error('FAIL A: 429 body not captured')
if (b.content !== 'Revenue is up.') throw new Error('FAIL B: content wrong')
if (c.content !== 'Tail line.') throw new Error('FAIL C: tail content lost')
console.log('ALL LOGIC TESTS PASSED')
