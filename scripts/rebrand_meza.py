#!/usr/bin/env python3
"""Rebrand EGX-Scanner -> Meza across the codebase.

Ordered literal replacements first (controlled context), then a
case-aware regex fallback for any leftover compound. Keeps factual
references to the Egyptian Exchange ("EGX", "EGX30") untouched — only
the brand compounds (egx-scanner / EGX Scanner / EGX Financial
Scanner / egxscanner ...) are rewritten. Domain strings become
__MEZA_HOST__ / __MEZA_URL__ tokens to be substituted once the new
Vercel domain is known.
"""
import os, re, sys

ROOT = "/tmp/my-project"
SKIP_DIRS = {"node_modules", ".next", ".git", "out", "backups", "download", ".vercel", ".turbo"}
TEXT_EXT = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".svg", ".py", ".sh",
            ".prisma", ".example", ".yml", ".yaml", ".css", ".html", ".txt", ""}

LITERAL = [
    ("ThomasEmad/EGX-Scanner", "ThomasEmad/meza"),
    ("https://egx-scanner.com", "__MEZA_URL__"),
    ("egx-scanner-ashy.vercel.app", "__MEZA_HOST__"),
    ("egx-scanner.com", "__MEZA_HOST__"),
    ("EGX Financial Scanner", "Meza"),
    ("EGX-Scanner", "Meza"),
    ("EGX Scanner", "Meza"),
    ("EGX scanner", "Meza"),
    ("egx-financial-scanner", "meza"),
    ("EGXScanner", "Meza"),
    ("egx-scanner", "meza"),
    ("egxscanner", "meza"),
]
FALLBACK = re.compile(r"(?i)egx[ _\-]?scanner|egxscanner")

def leftmap(m):
    s = m.group(0)
    return "Meza" if any(c.isupper() for c in s) else "meza"

def candidate_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = os.path.join(dirpath, fn)
            ext = os.path.splitext(fn)[1]
            if ext in TEXT_EXT or ext == "":
                # skip obvious binaries / big data
                try:
                    if os.path.getsize(p) > 2_000_000:
                        continue
                    with open(p, encoding="utf-8") as f:
                        f.read(4096)
                except Exception:
                    continue
                yield p

TOTAL_FILES = 0
TOTAL_HITS = 0
for p in candidate_files():
    try:
        s = open(p, encoding="utf-8").read()
    except Exception:
        continue
    orig = s
    for a, b in LITERAL:
        s = s.replace(a, b)
    # fallback: any leftover compound (mixed case variants)
    if FALLBACK.search(s):
        s = FALLBACK.sub(leftmap, s)
    if s != orig:
        n = sum(1 for _ in re.finditer(r"(?i)egx[ _\-]?scanner|egxscanner", orig))
        rel = os.path.relpath(p, ROOT)
        print(f"{rel}: {n}")
        open(p, "w", encoding="utf-8").write(s)
        TOTAL_FILES += 1
        TOTAL_HITS += n

print(f"\nfiles changed: {TOTAL_FILES}, brand occurrences replaced: {TOTAL_HITS}")

# verification pass: nothing left anywhere readable
left = 0
for p in candidate_files():
    try:
        s = open(p, encoding="utf-8").read()
    except Exception:
        continue
    for m in FALLBACK.finditer(s):
        print("LEFTOVER:", os.path.relpath(p, ROOT), "->", m.group(0)[:40])
        left += 1
print("leftover occurrences:", left)
sys.exit(1 if left else 0)
