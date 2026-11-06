// Cross-platform production launcher for the standalone Next.js build.
//
// `next build` with `output: "standalone"` emits `.next/standalone/server.js`
// but does not copy the static assets or `public/` into that folder. This
// script performs those copies (idempotent), loads the project-root `.env`
// into the child process (the standalone server.js does NOT read .env files —
// without this a bare `npm start` on a VPS would boot with no DATABASE_URL),
// and then starts the server.
//
// Env precedence: variables already set in the shell ALWAYS win over .env
// values, so CI/Docker operators can override anything per deployment.
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const standalone = path.join(root, ".next", "standalone")

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("Standalone build not found. Run `npm run build` first.")
  process.exit(1)
}

// ---- load .env (root), then .env.production if present ----
function parseEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  const text = readFileSync(filePath, "utf8")
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // strip a single matching pair of surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) out[key] = value
  }
  return out
}

const envOverrides = {
  ...parseEnvFile(path.join(root, ".env")),
  ...parseEnvFile(path.join(root, ".env.production")),
}
for (const [key, value] of Object.entries(envOverrides)) {
  if (process.env[key] === undefined) process.env[key] = value
}
const loadedKeys = Object.keys(envOverrides)
if (loadedKeys.length) {
  console.log(`[start-standalone] loaded env keys: ${loadedKeys.join(", ")}`)
}
if (!process.env.DATABASE_URL) {
  console.error(
    "[start-standalone] WARNING: DATABASE_URL is not set (neither in the environment nor in .env). " +
      "The app will fail on the first database query."
  )
}

const staticSrc = path.join(root, ".next", "static")
const staticDest = path.join(standalone, ".next", "static")
if (existsSync(staticSrc)) {
  mkdirSync(path.dirname(staticDest), { recursive: true })
  cpSync(staticSrc, staticDest, { recursive: true, force: true })
}

const publicSrc = path.join(root, "public")
const publicDest = path.join(standalone, "public")
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true, force: true })
}

const port = process.env.PORT || "3000"
const child = spawn(process.execPath, [path.join(standalone, "server.js")], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", PORT: port, EGX_ROOT: root },
})

child.on("exit", (code) => process.exit(code ?? 0))
