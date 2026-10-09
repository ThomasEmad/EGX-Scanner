// one-off: high-DPI table-mode OCR test on MASR income statement page 6
import { createWorker } from "tesseract.js"
import fs from "fs"
import { execFileSync } from "child_process"

const task3 = JSON.parse(fs.readFileSync("C:/Users/tomas/Downloads/EGX-Scanner-backup/statments/ocr-MASR/task3.json", "utf8"))
const pdf = task3.pdf
const outPng = "C:/Users/tomas/Downloads/EGX-Scanner-backup/statments/masr-p6-hi.png"
const py = `import pymupdf as f\nd = f.open(r"""${pdf}""")\nd[6].get_pixmap(dpi=220).save(r"""${outPng}""")\nprint("ok")`
fs.writeFileSync("scripts/_tmp_render.py", py)
execFileSync("python", ["-W", "ignore", "scripts/_tmp_render.py"], { cwd: process.cwd() })

const worker = await createWorker(["ara", "eng"])
await worker.setParameters({ tessedit_pageseg_mode: "6" })
const { data } = await worker.recognize(outPng)
const lines = data.text.split("\n").filter((l) => l.trim())
console.log(lines.slice(0, 28).join("\n").slice(0, 1400))
await worker.terminate()
