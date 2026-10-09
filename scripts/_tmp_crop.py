import json, pymupdf as f
t = json.load(open("C:/Users/tomas/Downloads/EGX-Scanner-backup/statments/ocr-MASR/task-crop.json", encoding="utf-8"))
d = f.open("C:/Users/tomas/Downloads/EGX-Scanner-backup/statments/ocr-MASR/src/مدينة مصر للإسكان والتعمير/مدينة مجمعة 14-11-2024.pdf")
page = d[6]
w, h = page.rect.width, page.rect.height
pix = page.get_pixmap(dpi=240, clip={"x": 0, "y": h*0.1, "width": w*0.55, "height": h*0.75})
pix.save(t["png"])
print("ok")