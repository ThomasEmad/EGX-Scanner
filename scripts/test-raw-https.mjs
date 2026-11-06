// Local validation of the rawHttps helper (same code as net-diag route).
import https from "node:https"

function rawHttps(host, path, body, headers, timeoutMs, maxBytes) {
  const t0 = Date.now()
  return new Promise((resolve) => {
    const req = https.request(
      { host, servername: host, path, method: body ? "POST" : "GET", headers, timeout: timeoutMs },
      (res) => {
        let bytes = 0
        const chunks = []
        res.on("data", (c) => {
          bytes += c.length
          if (chunks.length < 32) chunks.push(c)
          if (bytes >= maxBytes) res.destroy()
        })
        res.on("end", () =>
          resolve({ status: res.statusCode, sample: Buffer.concat(chunks).toString("utf8").slice(0, 160), bytes, ms: Date.now() - t0 })
        )
        res.on("close", () => {
          if (bytes >= maxBytes)
            resolve({ status: res.statusCode, sample: Buffer.concat(chunks).toString("utf8").slice(0, 160), bytes, ms: Date.now() - t0 })
        })
        res.on("error", (e) => resolve({ error: `res: ${e.message}`, bytes, ms: Date.now() - t0 }))
      }
    )
    req.on("timeout", () => req.destroy(new Error(`node:https timeout after ${timeoutMs}ms`)))
    req.on("error", (e) => resolve({ error: e.message, ms: Date.now() - t0, bytes: 0 }))
    if (body) req.write(body)
    req.end()
  })
}

const KEY = process.env.NVKEY || ""
if (!KEY) { console.error("set NVKEY"); process.exit(1) }

const body = JSON.stringify({ model: process.env.AI_MODEL || "z-ai/glm-5.3-flash", messages: [{ role: "user", content: "قل: تم" }], max_tokens: 40, temperature: 0.2 })
const r = await rawHttps("integrate.api.nvidia.com", "/v1/chat/completions", body, { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, 20000, 300)
console.log("POST:", JSON.stringify(r))
const g = await rawHttps("integrate.api.nvidia.com", "/v1/models", null, { Authorization: `Bearer ${KEY}` }, 15000, 200)
console.log("GET :", JSON.stringify(g))
process.exit(0)
