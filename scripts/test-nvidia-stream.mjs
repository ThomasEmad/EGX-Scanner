// Reproduce exactly what provider.ts does, from the sandbox, to isolate
// large-prompt + streaming behavior on NVIDIA's endpoint.
const BASE = process.env.NVBASE || "https://integrate.api.nvidia.com/v1";
const KEY = process.env.NVKEY || "";
if (!KEY) { console.error("set NVKEY"); process.exit(1); }

function bigPrompt(sizeKB) {
  // realistic-ish JSON blob of the target size
  const chunk = JSON.stringify({ metric: "value", period: "FY 2025", note: "x".repeat(60) });
  const arr = [];
  let bytes = 0;
  while (bytes < sizeKB * 1024) { arr.push(chunk); bytes += chunk.length; }
  return "Company data (JSON):\n[" + arr.join(",\n") + "]";
}

async function attempt(label, sizeKB, stream) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 70000);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: "z-ai/glm-5.3-flash",
        messages: [
          { role: "system", content: "You are a senior equity analyst. Output markdown." },
          { role: "user", content: bigPrompt(sizeKB) + "\n\nقل تحليلاً من سطرين فقط." },
        ],
        temperature: 0.5,
        stream,
      }),
      signal: ctrl.signal,
    });
    const ttfb = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text();
      console.log(`${label}: HTTP ${res.status} after ${ttfb}ms: ${body.slice(0, 150)}`);
      return;
    }
    if (!stream) {
      const j = await res.json();
      console.log(`${label}: OK non-stream ${ttfb}ms, content=${(j.choices?.[0]?.message?.content || "").slice(0, 60)}`);
      return;
    }
    let firstByteAt = null, total = "";
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", done = false;
    while (!done) {
      const c = await reader.read();
      if (c.done) break;
      if (firstByteAt === null) firstByteAt = Date.now() - t0;
      buf += dec.decode(c.value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (d === "[DONE]") { done = true; break; }
        try { const p = JSON.parse(d); const piece = p?.choices?.[0]?.delta?.content; if (typeof piece === "string") total += piece; } catch {}
      }
    }
    console.log(`${label}: OK stream TTFB=${firstByteAt}ms total=${Date.now() - t0}ms len=${total.length} :: ${total.slice(0, 80)}`);
  } catch (e) {
    console.log(`${label}: FAILED after ${Date.now() - t0}ms :: ${e.message}`);
  } finally { clearTimeout(timer); }
}

(async () => {
  await attempt("small+stream  ", 1, true);
  await attempt("40KB+stream   ", 42, true);
  await attempt("40KB+nonstream", 42, false);
})();
