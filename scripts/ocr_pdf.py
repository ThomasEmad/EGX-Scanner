"""
ocr_pdf.py — render a PDF's pages to PNGs with PyMuPDF for OCR.
Usage: python scripts/ocr_pdf.py <pdf> <outdir> [dpi] [firstPage] [lastPage]
"""
import sys
import os
import pymupdf

pdf_path = sys.argv[1]
outdir = sys.argv[2]
dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 200
first = int(sys.argv[4]) if len(sys.argv) > 4 else 1
last = int(sys.argv[5]) if len(sys.argv) > 5 else 10 ** 9

os.makedirs(outdir, exist_ok=True)
doc = pymupdf.open(pdf_path)
count = 0
for i, page in enumerate(doc, start=1):
    if i < first or i > last:
        continue
    pix = page.get_pixmap(dpi=dpi)
    out = os.path.join(outdir, f"page-{i:03d}.png")
    pix.save(out)
    count += 1
    print(f"page {i} → {out} ({pix.width}x{pix.height})", flush=True)
print(f"rendered {count} pages at {dpi}dpi", flush=True)
