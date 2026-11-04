const fs = require("fs")
const lines = fs.readFileSync("src/components/egx/scanners-view.tsx", "utf8").split("\n")
let p = 0, b = 0
let inString = false, strChar = "", inTemplate = false, inComment = false
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  for (let j = 0; j < line.length; j++) {
    const ch = line[j]
    if (inComment) { if (ch === "*" && line[j + 1] === "/") { inComment = false; j++; } continue; }
    if (inString) { if (ch === "\\") { j++; continue; } if (ch === strChar) { inString = false; } continue; }
    if (inTemplate) { if (ch === "\\") { j++; continue; } if (ch === "`") { inTemplate = false; } continue; }
    if (ch === "/" && line[j + 1] === "/") { while (j < line.length) j++; continue; }
    if (ch === "/" && line[j + 1] === "*") { inComment = true; j++; continue; }
    if (ch === "'" || ch === '"') { inString = true; strChar = ch; continue; }
    if (ch === "`") { inTemplate = true; continue; }
    if (ch === "(") p++; if (ch === ")") p--; if (ch === "{") b++; if (ch === "}") b--
  }
  if (i >= 700 && i <= 786) {
    console.log((i + 1).toString().padStart(4), "p=", p, "b=", b, " ", line.trim().slice(0, 55))
  }
}
console.log("final p=", p, "b=", b)
