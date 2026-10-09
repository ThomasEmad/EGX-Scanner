// Digit-column OCR test: crop the number columns (RTL tables → left side),
// OCR with eng + digit whitelist. Integrity check for the OCR harvest.
import { createWorker } from "tesseract.js"
import fs from "fs"
import { execFileSync } from "child_process"

const BS = String.fromCharCode(92)
const sl = (p) => p.split(BS).join("/")

const task3 = JSON.parse(
  fs.readFileSync("C:/Users/tomas/Downloads/EGX-Scanner-backup/statments/ocr-MASR/task3.json", "utf8")
)
const cropTask = "C:/Users/tomas/Downloads/EGX-Scanner-backup/statments/ocr-MASR/task-crop.json"
const pngOut = "C:/Users/tomas/Downloads/EGX-Scanner-backup/statments/masr-digits.png"
const cropTaskFwd = sl(cropTask)
const pngFwd = sl(pngOut)
const pdfFwd = sl(task3.pdf)

const py = [
  'import json, pymupdf as f',
  `t = json.load(open("${cropTaskFwd}", encoding="utf-8"))`,
  `d = f.open("${pdfFwd}")`,
  'page = d[6]',
  'w, h = page.rect.width, page.rect.height',
  'pix = page.get_pixmap(dpi=240, clip={"x": 0, "y": h*0.1, "width": w*0.55, "height": h*0.75})',
  'pix.save(t["png"])',
  'print("ok")',
].join("\n")
fs.writeFileSync("scripts/_tmp_crop.py", py)
fs.writeFileSync(cropTask, JSON.stringify({ pdf: task3.pdf, png: pngOut }))
execFileSync("python", ["-W", "ignore", "scripts/_tmp_crop.py"], { cwd: process.cwd() })

;(async () => {
  const worker = await createWorker("eng")
  await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "0123456789,.()- " })
  const { data } = await worker.recognize(pngOut)
  const lines = data.text.split("\n").filter((l) => l.trim())
  console.log(lines.slice(0, 24).join("\n").slice(0, 1300))
  await worker.terminate()
})()
