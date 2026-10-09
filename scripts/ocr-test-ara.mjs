import { createWorker } from "tesseract.js"
const worker = await createWorker("ara") // Arabic model — reads Arabic-Indic digits natively
await worker.setParameters({ tessedit_pageseg_mode: "6" })
const { data } = await worker.recognize("C:/Users/tomas/Downloads/EGX-Scanner-backup/statments/masr-p6-hi.png")
const AR = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" }
const norm = (s) => s.replace(/[٠-٩]/g, (d) => AR[d] ?? d)
const lines = norm(data.text).split("\n").filter((l) => l.trim())
// show only lines that now contain real numbers
const interesting = lines.filter((l) => /\d{1,3}(,\d{3})+/.test(l)).slice(0, 20)
console.log(interesting.join("\n").slice(0, 1500))
await worker.terminate()
