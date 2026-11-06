// Mock end-to-end tests for provider.ts v3 self-healing model discovery.
// Run: node /home/z/my-project/scripts/test-provider-v3.ts
import {
  chatComplete,
  scoreModelId,
  pickBestModel,
  _resetDiscoveryCacheForTests,
  _resetQuarantineForTests,
} from "/tmp/my-project/src/lib/ai/provider.ts"

let failures = 0
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`)
  if (!cond) failures++
}

// ---------- pure scoring tests ----------
check("flash beats lite", pickBestModel(["gemini-3.5-flash-lite", "gemini-3.8-flash"]) === "gemini-3.8-flash")
check("newer version wins", pickBestModel(["gemini-2.5-flash", "gemini-3.8-flash"]) === "gemini-3.8-flash")
check("non-chat excluded", pickBestModel(["text-embedding-004", "gemini-3.6-flash"]) === "gemini-3.6-flash")
check("tts excluded", pickBestModel(["gemini-3.8-flash-tts", "gemini-3.6-flash"]) === "gemini-3.6-flash")
check("preview penalized", pickBestModel(["gemini-3.1-pro-preview", "gemini-3.6-flash"]) === "gemini-3.6-flash")
check("exclude works", pickBestModel(["gemini-3.8-flash", "gemini-3.6-flash"], "gemini-3.8-flash") === "gemini-3.6-flash")
check("glm flash scored", scoreModelId("z-ai/glm-5.3-flash") > 0)
check("empty pool null", pickBestModel([], undefined as string | undefined) === null)

// ---------- fetch mock harness ----------
type Call = { url: string; init?: RequestInit }
let calls: Call[] = []
let modelListHandler: (call: Call, n: number) => Response | Promise<Response>
let chatHandler: (call: Call, body: any, n: number) => Response | Promise<Response>

function sse(text: string): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`))
      c.enqueue(enc.encode("data: [DONE]\n\n"))
      c.close()
    },
  })
  return new Response(stream, { status: 200 })
}

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } })
}

globalThis.fetch = (async (url: any, init?: any) => {
  const call: Call = { url: String(url), init }
  calls.push(call)
  const u = new URL(call.url)
  if (u.pathname.endsWith("/models")) return modelListHandler(call, calls.length)
  if (u.pathname.endsWith("/chat/completions")) {
    const body = JSON.parse(String(init.body))
    return chatHandler(call, body, calls.length)
  }
  return new Response("not found", { status: 404 })
}) as typeof fetch

const SYSTEM = "أنت محلل مالي."
const USER = "حلل الشركة."

async function resetEnv(model: string, base = "https://generativelanguage.googleapis.com/v1beta/openai") {
  process.env.AI_API_KEY = "fake-key"
  process.env.AI_BASE_URL = base
  process.env.AI_MODEL = model
  delete process.env.AI_MODEL_FALLBACK
  _resetDiscoveryCacheForTests()
  _resetQuarantineForTests()
  calls = []
}
const postedModels = () =>
  calls.filter((c) => c.url.endsWith("/chat/completions")).map((c) => JSON.parse(String(c.init!.body)).model)
const discoveryCalls = () => calls.filter((c) => c.url.endsWith("/models")).length

// ---------- scenario 1a: pinned model NOT in live list → pre-flight swap ----------
await resetEnv("gemini-2.5-flash")
modelListHandler = () =>
  jsonRes({
    data: [
      { id: "models/gemini-3.8-flash" },
      { id: "models/gemini-3.5-flash-lite" },
      { id: "models/gemini-3.8-flash-tts" },
      { id: "models/text-embedding-004" },
      { id: "models/gemini-4-argon" },
    ],
  })
chatHandler = () => sse("تحليل سليم")
const r1a = await chatComplete({ system: SYSTEM, user: USER, timeoutMs: 60_000 })
check("S1a result model is best live", r1a.model === "gemini-3.8-flash", r1a.model)
check("S1a never POSTed the dead pin", !postedModels().includes("gemini-2.5-flash"), postedModels().join(","))
check("S1a content ok", r1a.content === "تحليل سليم")

// ---------- scenario 1b: dead pin still LISTED (Google does this) → one wasted POST, then recovery ----------
await resetEnv("gemini-2.5-flash")
modelListHandler = () =>
  jsonRes({
    data: [
      { id: "models/gemini-2.5-flash" }, // listed but retired server-side
      { id: "models/gemini-3.8-flash" },
      { id: "models/gemini-3.5-flash-lite" },
      { id: "models/text-embedding-004" },
    ],
  })
chatHandler = (_c, body) => {
  if (body.model === "gemini-2.5-flash")
    return jsonRes({ error: { code: 404, message: "This model models/gemini-2.5-flash is no longer available." } }, 404)
  return sse("تحليل سليم")
}
const r1b = await chatComplete({ system: SYSTEM, user: USER, timeoutMs: 60_000 })
check("S1b recovered to best live model", r1b.model === "gemini-3.8-flash", r1b.model)
check("S1b dead model POSTed only once", postedModels().filter((m) => m === "gemini-2.5-flash").length === 1, postedModels().join(","))
check("S1b did not waste attempts on tts/embedding", postedModels().every((m) => m === "gemini-2.5-flash" || m === "gemini-3.8-flash" || m === "gemini-3.5-flash-lite"), postedModels().join(","))

// ---------- scenario 2: pinned model dies mid-request → same-request rewire ----------
await resetEnv("gemini-3.8-flash")
let listCalls = 0
modelListHandler = () => {
  listCalls++
  if (listCalls === 1)
    return jsonRes({ data: [{ id: "models/gemini-3.8-flash" }, { id: "models/gemini-3.5-flash-lite" }] })
  return jsonRes({ data: [{ id: "models/gemini-3.9-flash" }, { id: "models/gemini-3.5-flash-lite" }] })
}
let chatCalls = 0
chatHandler = (_c, body) => {
  chatCalls++
  if (chatCalls === 1 && body.model === "gemini-3.8-flash")
    return jsonRes(
      { error: { code: 404, message: "This model models/gemini-3.8-flash is no longer available." } },
      404
    )
  return sse("تم بعد إعادة التوصيل")
}
const r2 = await chatComplete({ system: SYSTEM, user: USER, timeoutMs: 60_000 })
check("S2 recovered on new live model", r2.model === "gemini-3.9-flash", r2.model)
check("S2 discovery ran pre-flight + re-plan", discoveryCalls() === 2, String(discoveryCalls()))
check("S2 content ok", r2.content === "تم بعد إعادة التوصيل")

// ---------- scenario 3: discovery unavailable → configured names (v2 behavior) ----------
await resetEnv("gemini-3.6-flash")
modelListHandler = () => jsonRes({ error: { message: "boom" } }, 500)
chatHandler = (_c, body) => sse(`استخدمت ${body.model}`)
const r3 = await chatComplete({ system: SYSTEM, user: USER, timeoutMs: 60_000 })
check("S3 falls back to configured model", r3.model === "gemini-3.6-flash", r3.model)
check("S3 discovery attempted once", discoveryCalls() === 1, String(discoveryCalls()))

// ---------- scenario 4: small budget skips discovery entirely ----------
await resetEnv("gemini-2.5-flash")
modelListHandler = () => jsonRes({ data: [{ id: "models/gemini-3.8-flash" }] })
chatHandler = (_c, body) => sse(`استخدمت ${body.model}`)
const r4 = await chatComplete({ system: SYSTEM, user: USER, timeoutMs: 10_000 })
check("S4 small budget keeps configured model", r4.model === "gemini-2.5-flash", r4.model)
check("S4 no discovery GET issued", discoveryCalls() === 0, String(discoveryCalls()))

// ---------- scenario 5: cache reuse — second request in TTL window skips discovery GET ----------
await resetEnv("gemini-2.5-flash")
let listCalls5 = 0
modelListHandler = () => {
  listCalls5++
  return jsonRes({ data: [{ id: "models/gemini-3.8-flash" }, { id: "models/gemini-3.5-flash-lite" }] })
}
chatHandler = () => sse("ok")
await chatComplete({ system: SYSTEM, user: USER, timeoutMs: 60_000 })
const after1 = discoveryCalls()
await chatComplete({ system: SYSTEM, user: USER, timeoutMs: 60_000 })
check("S5 second request reused cache", discoveryCalls() === after1 && listCalls5 === 1, `${discoveryCalls()} calls, handler hits ${listCalls5}`)

// ---------- scenario 6: serving hang → quarantine → instant fail-fast ----------
await resetEnv("z-ai/glm-5.3-flash")
let hangCalls = 0
modelListHandler = () => jsonRes({ data: [{ id: "z-ai/glm-5.3-flash" }] })
chatHandler = () => {
  hangCalls++
  // Simulate NVIDIA's serving hang: the request never returns an HTTP status.
  throw new DOMException("The operation was aborted due to timeout", "TimeoutError")
}
const t0 = Date.now()
let err6 = ""
try {
  await chatComplete({ system: SYSTEM, user: USER, timeoutMs: 10_000 })
} catch (e) {
  err6 = e instanceof Error ? e.message : String(e)
}
const firstMs = Date.now() - t0
check("S6 first hang request reports attempt chain", err6.includes("AI failed after 1/1 attempts"), err6.slice(0, 120))
const t1 = Date.now()
let err6b = ""
try {
  await chatComplete({ system: SYSTEM, user: USER, timeoutMs: 10_000 })
} catch (e) {
  err6b = e instanceof Error ? e.message : String(e)
}
const secondMs = Date.now() - t1
check("S6 second request quarantined instantly", err6b.includes("quarantined") && secondMs < 200, `${secondMs}ms: ${err6b.slice(0, 100)}`)
check("S6 quarantine avoided new HTTP calls", hangCalls === 1, String(hangCalls))
_resetQuarantineForTests()

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
