// Cross-platform production launcher for the standalone Next.js build.
//
// `next build` with `output: "standalone"` emits `.next/standalone/server.js`
// but does not copy the static assets or `public/` into that folder. This
// script performs those copies (idempotent) and then starts the server, so the
// same command works on Windows, macOS and Linux.
import { cpSync, existsSync, mkdirSync } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const standalone = path.join(root, ".next", "standalone")

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("Standalone build not found. Run `npm run build` first.")
  process.exit(1)
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
  env: { ...process.env, NODE_ENV: "production", PORT: port },
})

child.on("exit", (code) => process.exit(code ?? 0))
