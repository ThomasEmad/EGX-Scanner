// OCR phase-A v2 — Arabic-safe: all Arabic paths pass via JSON files to the
// python helper (never through the command line). Renders pages → tesseract.
import { createWorker } from "tesseract.js"
import fs from "fs"
import path from "path"
import { execFileSync } from "node:child_process"

const [zipGlob, ticker] = process.argv.slice(2)
if (!zipGlob || !ticker) { console.error("usage: node ocr-phase-a.mjs <zipGlob> <ticker>"); process.exit(1) }

const STAT = "C:/Users/tomas/Downloads/EGX-Scanner-backup/statments"
const outDir = path.join(STAT, `ocr-${ticker}`)
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

// 1) resolve zip via python glob → result JSON
const task1 = path.join(outDir, "task1.json")
fs.writeFileSync(task1, JSON.stringify({ zipGlob, outDir: path.join(outDir, "src"), result: path.join(outDir, "res1.json") }))
execFileSync("python", ["-W", "ignore", "-c", `
import json, glob, os
t = json.load(open(r'${task1.replace(/\\/g, "/")}', encoding='utf-8'))
g = glob.glob(t['zipGlob'])
json.dump({'zip': os.path.abspath(g[0]) if g else ''}, open(t['result'], 'w', encoding='utf-8'))
`], { cwd: STAT })
const res1 = JSON.parse(fs.readFileSync(path.join(outDir, "res1.json"), "utf8"))
if (!res1.zip) { console.error("NO ZIP"); process.exit(1) }
console.log("zip:", path.basename(res1.zip))

// 2) extract + list PDFs (python helper, Arabic-safe)
const task2 = path.join(outDir, "task2.json")
fs.writeFileSync(task2, JSON.stringify({ zip: res1.zip, outDir: path.join(outDir, "src"), result: path.join(outDir, "res2.json") }))
execFileSync("python", ["-W", "ignore", path.join("scripts", "render_pages.py").replace(/\\/g, "/"), task2.replace(/\\/g, "/")], { cwd: process.cwd() })
const pdfs = JSON.parse(fs.readFileSync(path.join(outDir, "res2.json"), "utf8")).pdfs
console.log("pdfs:", pdfs.length)

// 3) choose newest مجمعة
const withScore = pdfs.map((p) => {
  const base = path.basename(p)
  const isMogamaa = /مجمعة|المجمعة|مجمع/.test(base)
  const dates = [...base.matchAll(/(\d{1,2})-(\d{1,2})-(20\d\d)/g)].map((m) => Number(`${m[3]}${m[2].padStart(2, "0")}${m[1].padStart(2, "0")}`))
  const yearScore = Math.max(0, ...[...base.matchAll(/(20\d\d)/g)].map((m) => Number(m[1])))
  return { p, score: (isMogamaa ? 1e8 : 0) + Math.max(0, ...dates, yearScore * 100) }
})
withScore.sort((a, b) => b.score - a.score)
const chosen = withScore[0].p
console.log("chosen:", path.basename(chosen))

// 4) render ALL pages (python)
const pagesDir = path.join(outDir, "pages")
fs.mkdirSync(pagesDir, { recursive: true })
const task3 = path.join(outDir, "task3.json")
fs.writeFileSync(task3, JSON.stringify({ pdf: chosen, outDir: pagesDir, result: path.join(outDir, "res3.json") }))
execFileSync("python", ["-W", "ignore", path.join("scripts", "render_pages.py").replace(/\\/g, "/"), task3.replace(/\\/g, "/")], { cwd: process.cwd() })
const nPages = JSON.parse(fs.readFileSync(path.join(outDir, "res3.json"), "utf8")).pages
console.log("pages:", nPages)

// 5) OCR every page
;(async () => {
  const worker = await createWorker(["ara", "eng"])
  const out = fs.createWriteStream(path.join(outDir, `ocr-${ticker}.jsonl`))
  for (let i = 0; i < nPages; i++) {
    const png = path.join(pagesDir, `p${i}.png`)
    if (!fs.existsSync(png)) continue
    try {
      const { data } = await worker.recognize(png)
      out.write(JSON.stringify({ page: i, text: data.text }) + "\n")
      console.log("page", i, "chars:", data.text.length)
    } catch (e) {
      console.error("page", i, "ERR", String(e).slice(0, 60))
    }
  }
  out.end()
  await worker.terminate()
  console.log("PHASE-A DONE:", path.join(outDir, `ocr-${ticker}.jsonl`))
})()
