#!/usr/bin/env python3
"""Post-process footers: add \\* ROMAN / \\* arabic switches to PAGE fields
mapped via section footerReference order, and strip empty <w:pgNumType/>."""
import re
import shutil
import sys
import zipfile
from pathlib import Path

path = Path(sys.argv[1])
tmp = Path("/tmp/docx-footer-patch")
if tmp.exists():
    shutil.rmtree(tmp)
tmp.mkdir(parents=True)
with zipfile.ZipFile(path) as z:
    z.extractall(tmp)

doc_xml = (tmp / "word" / "document.xml").read_text(encoding="utf-8")

# 1. Strip empty pgNumType (cover section emits it, confuses WPS)
doc_xml = re.sub(r"<w:pgNumType/>", "", doc_xml)

# 1b. Remove duplicated first TOC entry: the field paragraph already carries
# the first entry (hyperlink + PAGEREF) after the separate fldChar; the
# placeholder script also emits a plain copy right after it.
def _para_text(p: str) -> str:
    return "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))

field_para_re = re.compile(
    r'<w:p>(?:(?!</w:p>).)*?fldCharType="begin"(?:(?!</w:p>).)*?TOC \\h(?:(?!</w:p>).)*?'
    r'fldCharType="separate"(?:(?!</w:p>).)*?<w:hyperlink(?:(?!</w:p>).)*?</w:p>',
    flags=re.S,
)
m = field_para_re.search(doc_xml)
if m:
    ftext = _para_text(m.group(0))
    rest = doc_xml[m.end():]
    nxt = re.match(r"<w:p>.*?</w:p>", rest, flags=re.S)
    if nxt:
        ntxt = _para_text(nxt.group(0))
        if (
            "<w:hyperlink" not in nxt.group(0)
            and ntxt.strip().startswith(ftext.strip())
            and ftext.strip()
        ):
            doc_xml = doc_xml[: m.end()] + rest[nxt.end():]
            print("removed duplicate TOC entry:", ntxt[:50])

# 2. Find sectPr blocks in order and their footerReference r:ids
sect_blocks = re.findall(r"<w:sectPr[^>]*>.*?</w:sectPr>", doc_xml, flags=re.S)
foot_ids = []  # (section_index, r_id) in document order
for i, blk in enumerate(sect_blocks):
    m = re.search(r'<w:footerReference w:type="default" r:id="(rId\d+)"', blk)
    foot_ids.append((i, m.group(1) if m else None))
print("sections:", len(sect_blocks), "footer refs:", foot_ids)

rels_xml = (tmp / "word" / "_rels" / "document.xml.rels").read_text(encoding="utf-8")
rid_to_file = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(footer\d+\.xml)"', rels_xml))
print("rels:", rid_to_file)

# Expect: section with UPPER_ROMAN pgNumType fmt -> ROMAN footer; DECIMAL -> arabic
def fmt_of(block: str) -> str | None:
    m = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', block)
    return m.group(1) if m else None

for i, blk in enumerate(sect_blocks):
    fmt = fmt_of(blk)
    rid = foot_ids[i][1]
    if not rid or rid not in rid_to_file:
        continue
    fname = rid_to_file[rid]
    fpath = tmp / "word" / fname
    if not fpath.exists():
        continue
    fx = fpath.read_text(encoding="utf-8")
    if fmt == "upperRoman":
        sw = r" PAGE \* ROMAN \* MERGEFORMAT "
    else:
        sw = r" PAGE \* arabic \* MERGEFORMAT "
    fx2 = re.sub(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        lambda m: m.group(1) + sw + m.group(2),
        fx,
    )
    if fx2 != fx:
        fpath.write_text(fx2, encoding="utf-8")
        print(f"patched {fname} fmt={fmt} -> {sw.strip()}")

(tmp / "word" / "document.xml").write_text(doc_xml, encoding="utf-8")

# Repack
out = path.with_suffix(".tmp.docx")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for f in sorted(tmp.rglob("*")):
        if f.is_file():
            zf.write(f, f.relative_to(tmp).as_posix())
out.replace(path)
print("REPACK_OK", path)
