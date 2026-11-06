// Generates the static brand assets referenced by SEO metadata:
//   public/logo.png      — 512×512 raster of logo.svg (schema.org logo)
//   public/og-image.png  — 1200×630 Open Graph / Twitter card image
//
// Run: node scripts/generate-brand-assets.mjs
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import sharp from "sharp"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = path.join(root, "public")

const logoSvg = await readFile(path.join(publicDir, "logo.svg"))

// 512×512 logo on a solid brand tile so the mark stays legible on light and
// dark social surfaces.
const logoPng = await sharp(logoSvg, { density: 384 })
  .resize(512, 512, { fit: "contain", background: { r: 45, g: 45, b: 45, alpha: 1 } })
  .png()
  .toBuffer()
await writeFile(path.join(publicDir, "logo.png"), logoPng)

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="60%" stop-color="#101b2f"/>
      <stop offset="100%" stop-color="#0d2a24"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1060" cy="120" r="220" fill="#34d399" opacity="0.08"/>
  <circle cx="1120" cy="560" r="260" fill="#22d3ee" opacity="0.07"/>
  <rect x="72" y="86" width="96" height="96" rx="20" fill="#2d2d2d" stroke="#ffffff" stroke-opacity="0.18"/>
  <text x="120" y="150" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700"
        fill="#ffffff" text-anchor="middle">Z</text>
  <text x="196" y="132" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600"
        fill="#9fb3c8" letter-spacing="3">EGX · EGYPTIAN EXCHANGE</text>
  <text x="196" y="180" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700"
        fill="#ffffff">Financial Scanner</text>
  <text x="72" y="300" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700"
        fill="#ffffff">Source-traceable financial data</text>
  <text x="72" y="352" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700"
        fill="url(#accent)">for Egyptian stocks.</text>
  <text x="72" y="422" font-family="Arial, Helvetica, sans-serif" font-size="28"
        fill="#cbd5e1">Statements · Ratios · Sector rankings · Data-quality provenance</text>
  <g font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#94a3b8">
    <text x="72" y="540">Arabic + English</text>
    <text x="300" y="540">Latest verified period per metric</text>
    <text x="700" y="540">egx-scanner.com</text>
  </g>
  <rect x="72" y="470" width="1056" height="2" fill="#ffffff" opacity="0.12"/>
</svg>`

const ogPng = await sharp(Buffer.from(ogSvg)).png().toBuffer()
await writeFile(path.join(publicDir, "og-image.png"), ogPng)

console.log("Wrote public/logo.png and public/og-image.png")
