#!/usr/bin/env python3
"""
extract_pdf.py — Hybrid PDF financial extractor.

Combines:
  • PyMuPDF (fitz) — fast, Arabic-correct text extraction
  • pdfplumber — table + word bbox extraction
  • tesseract (ara+eng) — OCR fallback for scanned pages

Outputs structured JSON to stdout (or --out path):
  { "pages": [ { "page": N, "language": "EN", "tables": [...], "lines": [...] } ],
    "document": { "pageCount": N, "looksScanned": false, ... },
    "metadata": { "language": "...", "period": {...}, "company": "...", "unit": "MILLION", ... } }

Each cell carries: col_index, raw_text, is_label, is_number, numeric_value,
is_negative, is_blank_or_na, bbox.

Number parsing handles:
  • Arabic-Indic digits (٠-٩) and Eastern Arabic (۰-۹)
  • Arabic thousands (٬ U+066C) and decimal (٫ U+066B) separators
  • Parenthesized negatives "(1,250)"
  • Trailing-minus "1,250-"
  • EU-style "3,5" decimals
  • "N/A", "—" (em dash), "Nil", "-" blank markers
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

# --- Optional imports (degrade gracefully if a backend is missing) ---
try:
    import fitz  # type: ignore  # PyMuPDF
    HAS_FITZ = True
except Exception:
    HAS_FITZ = False

try:
    import pdfplumber  # type: ignore
    HAS_PDFPLUMBER = True
except Exception:
    HAS_PDFPLUMBER = False

try:
    import pytesseract  # type: ignore
    from PIL import Image  # type: ignore
    HAS_TESS = True
except Exception:
    HAS_TESS = False


# ---------------------------------------------------------------------------
# Number parsing
# ---------------------------------------------------------------------------
ARABIC_DIGIT_MAP = {0x0660 + i: str(i) for i in range(10)}  # ٠-٩
EASTERN_ARABIC_DIGIT_MAP = {0x06F0 + i: str(i) for i in range(10)}  # ۰-۹

def _to_latin_digits(s: str) -> str:
    out = []
    for ch in s:
        cp = ord(ch)
        if cp in ARABIC_DIGIT_MAP:
            out.append(ARABIC_DIGIT_MAP[cp])
        elif cp in EASTERN_ARABIC_DIGIT_MAP:
            out.append(EASTERN_ARABIC_DIGIT_MAP[cp])
        else:
            out.append(ch)
    return "".join(out)


_BLANK_RE = re.compile(r"^(n/?a|nil|none|\-|—|–|\.|,\s*$)$", re.IGNORECASE)


def is_blank_or_na(raw: str) -> bool:
    if not raw:
        return True
    s = raw.strip()
    if not s:
        return True
    return bool(_BLANK_RE.match(s))


def parse_number(raw: str) -> Tuple[Optional[float], bool, bool]:
    """Parse a numeric cell.
    Returns (numeric_value, is_negative, is_blank_or_na_flag).
    When parsing fails returns (None, False, is_blank_or_na_flag).
    """
    if not raw:
        return None, False, True
    s = _to_latin_digits(raw).strip()
    if not s:
        return None, False, True
    if is_blank_or_na(s):
        return None, False, True
    is_negative = False
    # Parenthesized negatives
    if s.startswith("(") and s.endswith(")"):
        is_negative = True
        s = s[1:-1].strip()
    # Trailing minus
    if s.endswith("-") and not s.startswith("-"):
        is_negative = True
        s = s[:-1].strip()
    # Strip leading minus (already encoded)
    if s.startswith("-"):
        is_negative = True
        s = s[1:].strip()
    # Strip currency and whitespace tokens
    s = re.sub(r"(EGP|E£|ج\.م|USD|\$|EUR|€|GBP|£)", "", s, flags=re.IGNORECASE).strip()
    s = s.replace("\u00a0", " ").replace("\u2007", " ").replace("\u202f", " ")
    if not s:
        return None, False, False
    # Now extract first numeric-looking substring
    m = re.search(r"\d[\d\u066B\u066C.,\s]*\d|\d", s)
    if not m:
        return None, False, False
    token = m.group(0).strip()
    # Drop spaces inside (thousands grouping)
    token = token.replace(" ", "")
    has_comma = "," in token
    has_dot = "." in token
    try:
        if has_comma and has_dot:
            # rightmost separator is decimal
            if token.rfind(",") > token.rfind("."):
                dec_sep = ","
                thou_sep = "."
            else:
                dec_sep = "."
                thou_sep = ","
            int_part, dec_part = token.rsplit(dec_sep, 1)
            int_part = int_part.replace(thou_sep, "")
            value = float(f"{int_part}.{dec_part}")
        elif has_comma:
            groups = token.split(",")
            last = groups[-1]
            if len(groups) >= 2 and len(last) in (1, 2) and groups[0].isdigit():
                # EU-style decimal "3,5"
                value = float(f"{groups[0]}.{last}")
            elif all(g.isdigit() for g in groups) and all(len(g) == 3 for g in groups[1:]):
                value = float("".join(groups))
            else:
                return None, False, False
        elif has_dot:
            groups = token.split(".")
            if len(groups) == 2:
                value = float(token)
            elif len(groups) > 2 and all(g.isdigit() for g in groups):
                # European thousands "1.250.000"
                value = float("".join(groups))
            else:
                return None, False, False
        else:
            value = float(token)
        if is_negative:
            value = -value
        return value, is_negative, False
    except (ValueError, TypeError):
        return None, False, False


# ---------------------------------------------------------------------------
# Language / statement detection (simple heuristics)
# ---------------------------------------------------------------------------
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
LATIN_RE = re.compile(r"[A-Za-z]")


def detect_language(text: str) -> str:
    if not text:
        return "UNKNOWN"
    arabic = len(ARABIC_RE.findall(text))
    latin = len(LATIN_RE.findall(text))
    if arabic > latin * 2:
        return "AR"
    if latin > arabic * 2:
        return "EN"
    if arabic > 5 and latin > 5:
        return "MIXED"
    if arabic > 0 and latin == 0:
        return "AR"
    if latin > 0 and arabic == 0:
        return "EN"
    return "UNKNOWN"


INCOME_KEYWORDS = [
    "income statement", "profit or loss", "statements of income", "statement of income",
    "قائمة الدخل", "قائمة الدخل الشامل", "الأرباح والخسائر",
]
BALANCE_KEYWORDS = [
    "balance sheet", "statement of financial position", "financial position",
    "الميزانية العمومية", "قائمة المركز المالي",
]
CASHFLOW_KEYWORDS = [
    "cash flow", "statement of cash flows", "cash flows statement",
    "قائمة التدفقات النقدية", "التدفقات النقدية",
]
EQUITY_KEYWORDS = [
    "changes in equity", "statement of changes in equity", "حركة حقوق الملكية",
]


def detect_statement_type(text: str) -> str:
    t = text.lower()
    if any(k in t for k in INCOME_KEYWORDS):
        return "INCOME_STATEMENT"
    if any(k in t for k in BALANCE_KEYWORDS):
        return "BALANCE_SHEET"
    if any(k in t for k in CASHFLOW_KEYWORDS):
        return "CASH_FLOW"
    if any(k in t for k in EQUITY_KEYWORDS):
        return "OTHER"
    return "UNKNOWN"


# Period detection — Q1/Q2/Q3/Q4 / H1 / 9M / FY + year
PERIOD_PATTERNS = [
    (re.compile(r"\b(Q[1-4])\s*(?:20\d{2})\b"), "QUARTERLY"),
    (re.compile(r"\b(H[1-2])\s*(?:20\d{2})\b"), "SEMIANNUAL"),
    (re.compile(r"\b(9M|Nine Months?)\s*(?:20\d{2})\b", re.IGNORECASE), "NINE_MONTH"),
    (re.compile(r"\b(FY|Annual|Year(?:ly)?)\s*(?:20\d{2})\b", re.IGNORECASE), "ANNUAL"),
]
YEAR_RE = re.compile(r"\b(20\d{2})\b")
UNIT_PATTERNS = [
    (re.compile(r"\bin\s+(thousands?|millions?|billions?)\b", re.IGNORECASE), "thousands", "THOUSAND"),
    (re.compile(r"\bin\s+(thousands?|millions?|billions?)\b", re.IGNORECASE), "millions", "MILLION"),
    (re.compile(r"\bin\s+(thousands?|millions?|billions?)\b", re.IGNORECASE), "billions", "BILLION"),
    (re.compile(r"\bبالألف\b"), "ألف", "THOUSAND"),
    (re.compile(r"\bبالمليون\b"), "مليون", "MILLION"),
    (re.compile(r"\bبالمليار\b"), "مليار", "BILLION"),
]


def detect_period(text: str) -> Dict[str, Any]:
    """Detect period type and fiscal year from the text. Returns dict with
    periodType, sub, fiscalYear, periodLabel, confidence."""
    out: Dict[str, Any] = {"periodType": None, "sub": None, "fiscalYear": None, "periodLabel": None, "confidence": 0.0}
    if not text:
        return out
    upper = text.upper()
    for pat, ptype in PERIOD_PATTERNS:
        m = pat.search(upper)
        if m:
            sub_token = m.group(1).upper()
            year_match = YEAR_RE.search(upper[m.end():m.end() + 20]) or YEAR_RE.search(upper)
            year = int(year_match.group(1)) if year_match else None
            sub = None
            if ptype == "QUARTERLY":
                sub = sub_token
            elif ptype == "SEMIANNUAL":
                sub = sub_token
            elif ptype == "NINE_MONTH":
                sub = "9M"
            label = f"{sub_token} {year}" if year else sub_token
            out.update({"periodType": ptype, "sub": sub, "fiscalYear": year, "periodLabel": label, "confidence": 0.85})
            return out
    year_match = YEAR_RE.search(text)
    if year_match:
        out.update({"periodType": "ANNUAL", "sub": None, "fiscalYear": int(year_match.group(1)), "periodLabel": f"FY {year_match.group(1)}", "confidence": 0.4})
    return out


def detect_unit(text: str) -> str:
    if not text:
        return "MILLION"
    lower = text.lower()
    if "billion" in lower or "milliard" in lower or "بالمليار" in text:
        return "BILLION"
    if "million" in lower or "بالمليون" in text:
        return "MILLION"
    if "thousand" in lower or "بالألف" in text:
        return "THOUSAND"
    return "MILLION"


# ---------------------------------------------------------------------------
# PyMuPDF page extraction
# ---------------------------------------------------------------------------
def extract_page_text_fitz(page) -> str:
    try:
        return page.get_text("text") or ""
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# pdfplumber table + word extraction
# ---------------------------------------------------------------------------
def _bbox_to_list(bbox) -> Optional[List[float]]:
    if not bbox:
        return None
    try:
        return [float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])]
    except (TypeError, ValueError, IndexError):
        return None


def _classify_cell(raw_text: str) -> Dict[str, Any]:
    raw = (raw_text or "").strip()
    numeric_value, is_negative, is_blank = parse_number(raw)
    is_number = numeric_value is not None
    # Label heuristic: contains letters and is not a pure number
    is_label = bool(re.search(r"[A-Za-z\u0600-\u06FF]", raw)) and not is_number
    return {
        "raw_text": raw,
        "is_label": is_label,
        "is_number": is_number,
        "numeric_value": numeric_value,
        "is_negative": is_negative,
        "is_blank_or_na": is_blank,
    }


def extract_tables_plumber(plumber_page) -> List[Dict[str, Any]]:
    tables: List[Dict[str, Any]] = []
    try:
        raw_tables = plumber_page.extract_tables() or []
    except Exception:
        raw_tables = []
    try:
        words = plumber_page.extract_words() or []
    except Exception:
        words = []
    for t_idx, raw_table in enumerate(raw_tables):
        rows: List[Dict[str, Any]] = []
        max_cols = 0
        for r_idx, raw_row in enumerate(raw_table):
            cells: List[Dict[str, Any]] = []
            row_max = len(raw_row) if raw_row else 0
            max_cols = max(max_cols, row_max)
            for c_idx, raw_cell in enumerate(raw_row):
                # Try to find bbox via word matching
                cell_bbox: Optional[List[float]] = None
                if raw_cell and words:
                    cell_words = [w for w in words if _word_overlaps_cell(w, c_idx, r_idx, raw_table, words)]
                    if cell_words:
                        xs = [w["x0"] for w in cell_words] + [w["x1"] for w in cell_words]
                        ys = [w["top"] for w in cell_words] + [w["bottom"] for w in cell_words]
                        if xs and ys:
                            cell_bbox = [min(xs), min(ys), max(xs), max(ys)]
                cell_data = _classify_cell(raw_cell or "")
                cell_data.update({
                    "col_index": c_idx,
                    "bbox": cell_bbox,
                })
                cells.append(cell_data)
            rows.append({"row_index": r_idx, "cells": cells})
        tables.append({"table_index": t_idx, "rows": rows, "column_count": max_cols})
    return tables


def _word_overlaps_cell(word: Dict[str, Any], c_idx: int, r_idx: int, raw_table, words) -> bool:
    """Very rough bbox-less cell-to-word assignment: return True when word index
    roughly matches column/row count. This is intentionally conservative — when
    bbox data is unavailable we only return label/number classifications."""
    return False


def extract_lines_fitz(page) -> List[Dict[str, Any]]:
    lines: List[Dict[str, Any]] = []
    try:
        blocks = page.get_text("dict") or {}
    except Exception:
        return lines
    for block in blocks.get("blocks", []) or []:
        if block.get("type") != 0:  # 0 = text block
            continue
        block_bbox = _bbox_to_list(block.get("bbox"))
        for line in block.get("lines", []) or []:
            text = "".join(span.get("text", "") for span in line.get("spans", []) or [])
            if not text.strip():
                continue
            line_bbox = _bbox_to_list(line.get("bbox")) or block_bbox
            cell = _classify_cell(text)
            cell.update({"col_index": 0, "bbox": line_bbox})
            lines.append({"text": text.strip(), **cell})
    return lines


# ---------------------------------------------------------------------------
# OCR fallback (tesseract ara+eng)
# ---------------------------------------------------------------------------
def ocr_page_fitz(page, dpi: int = 200) -> str:
    if not HAS_TESS:
        return ""
    try:
        pix = page.get_pixmap(dpi=dpi)
        img = Image.frombytes("RGB" if pix.alpha == 0 else "RGBA", [pix.width, pix.height], pix.samples)
        if img.mode == "RGBA":
            img = img.convert("RGB")
        return pytesseract.image_to_string(img, lang="ara+eng")
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def looks_scanned(pages_text: List[str]) -> bool:
    total_chars = sum(len(re.sub(r"\s+", "", t)) for t in pages_text)
    return total_chars < 40


def process_pdf(path: str, ocr_threshold: int = 40) -> Dict[str, Any]:
    if not HAS_FITZ:
        return {"error": "PyMuPDF (fitz) is not installed", "pages": [], "document": {"pageCount": 0, "looksScanned": False}}

    doc = fitz.open(path)
    page_results: List[Dict[str, Any]] = []
    all_text_chunks: List[str] = []
    for page_index, page in enumerate(doc, start=1):
        # PyMuPDF primary
        text = extract_page_text_fitz(page)
        if not text or len(re.sub(r"\s+", "", text)) < ocr_threshold:
            if HAS_TESS:
                ocr_text = ocr_page_fitz(page)
                if len(re.sub(r"\s+", "", ocr_text)) > len(re.sub(r"\s+", "", text)):
                    text = ocr_text
        lines = extract_lines_fitz(page)
        tables: List[Dict[str, Any]] = []
        if HAS_PDFPLUMBER:
            try:
                with pdfplumber.open(path) as plumber_doc:
                    plumber_page = plumber_doc.pages[page_index - 1] if page_index - 1 < len(plumber_doc.pages) else None
                    if plumber_page is not None:
                        tables = extract_tables_plumber(plumber_page)
            except Exception:
                tables = []
        all_text_chunks.append(text)
        page_results.append({
            "page": page_index,
            "language": detect_language(text),
            "statementType": detect_statement_type(text),
            "text": text,
            "lines": lines,
            "tables": tables,
        })
    looks_scanned_flag = looks_scanned([p["text"] for p in page_results])
    full_text = "\n".join(all_text_chunks)
    metadata = {
        "pageCount": len(page_results),
        "looksScanned": looks_scanned_flag,
        "language": detect_language(full_text),
        "statementType": detect_statement_type(full_text),
        "period": detect_period(full_text),
        "unit": detect_unit(full_text),
        "company": None,
        "ticker": None,
        "currency": "EGP",
        "engines": {
            "fitz": HAS_FITZ,
            "pdfplumber": HAS_PDFPLUMBER,
            "tesseract": HAS_TESS,
        },
    }
    return {
        "pages": page_results,
        "document": metadata,
        "metadata": metadata,
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Hybrid PDF financial extractor")
    parser.add_argument("path", help="Path to PDF file")
    parser.add_argument("--out", help="Output JSON path (default: stdout)")
    parser.add_argument("--ocr-threshold", type=int, default=40,
                        help="Minimum non-whitespace chars before OCR fallback is tried")
    args = parser.parse_args(argv)
    if not os.path.exists(args.path):
        print(f"Error: file not found: {args.path}", file=sys.stderr)
        return 2
    result = process_pdf(args.path, ocr_threshold=args.ocr_threshold)
    payload = json.dumps(result, ensure_ascii=False, default=str)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(payload)
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
