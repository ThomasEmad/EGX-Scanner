# -*- coding: utf-8 -*-
# Reads {zip, outDir} (or {pdf, outDir, pages}) from task.json — Arabic-safe (no CLI args).
import json, os, sys, zipfile, glob
import pymupdf

task = json.load(open(sys.argv[1], encoding="utf-8"))
out = {}
if "zip" in task:
    z = zipfile.ZipFile(task["zip"])
    z.extractall(task["outDir"])
    pdfs = glob.glob(os.path.join(task["outDir"], "**", "*.pdf"), recursive=True)
    out["pdfs"] = pdfs
elif "pdf" in task:
    doc = pymupdf.open(task["pdf"])
    pages = task.get("pages", list(range(len(doc))))
    for i in pages:
        pix = doc[i].get_pixmap(dpi=150)
        pix.save(os.path.join(task["outDir"], f"p{i}.png"))
    out["pages"] = len(doc)
json.dump(out, open(task["result"], "w", encoding="utf-8"), ensure_ascii=False)
print("OK")
