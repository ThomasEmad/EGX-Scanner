import pymupdf as f
d = f.open(r"""C:\Users\tomas\Downloads\EGX-Scanner-backup\statments\ocr-MASR\src\مدينة مصر للإسكان والتعمير\مدينة مجمعة 14-11-2024.pdf""")
d[6].get_pixmap(dpi=220).save(r"""C:/Users/tomas/Downloads/EGX-Scanner-backup/statments/masr-p6-hi.png""")
print("ok")