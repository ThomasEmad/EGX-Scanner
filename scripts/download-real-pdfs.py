#!/usr/bin/env python3
"""
download-real-pdfs.py — Robust downloader for real EGX annual report PDFs.

Uses requests library with:
  - Session persistence (handles cookies + sticky sessions)
  - Automatic retry on connection drops (urllib3 Retry)
  - Stream + chunked write (so partial files don't waste memory)
  - Resume support via Range header
  - Long timeout + backoff

If a download fails after 5 retries, the file is removed (no partial junk).
"""

from __future__ import annotations
import os
import sys
import time
from pathlib import Path
from urllib3.util.retry import Retry
import requests
from requests.adapters import HTTPAdapter

OUT_DIR = Path("storage/real-pdfs")
OUT_DIR.mkdir(parents=True, exist_ok=True)

TARGETS = [
    {
        "name": "ETEL-FY2023-Annual-Report.pdf",
        "url": "https://ir.te.eg/IRMedia/Financial_Information/2023/Financial_Information048fa29c-b6d9-41a2-8802-725eafdbb590.pdf",
        "ticker": "ETEL",
        "period": "FY2023",
    },
    {
        "name": "ETEL-FY2020-Integrated-Annual-Report.pdf",
        "url": "https://ir.te.eg/IRMedia/Financial_Information/2023/Financial_Informationf4203974-0282-4202-9cfc-6c58c420b91b.pdf",
        "ticker": "ETEL",
        "period": "FY2020",
    },
    {
        "name": "ETEL-FY2018-Annual-Report.pdf",
        "url": "https://ir.te.eg/IRMedia/Financial_Information/2019/Financial_Information95fb160d-b706-4edd-b322-e1bd3b25bc86.pdf",
        "ticker": "ETEL",
        "period": "FY2018",
    },
]


def make_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=10,                    # up to 10 retries
        connect=10,
        read=10,
        status=5,                     # retry on 5xx
        backoff_factor=2,             # 2, 4, 8, 16, 32, 60, 60, 60... seconds
        status_forcelist=[429, 500, 502, 503, 504],
        raise_on_status=False,
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=2, pool_maxsize=2)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "application/pdf,*/*",
        "Accept-Encoding": "identity",  # avoid gzip so we get real Content-Length
        "Connection": "keep-alive",
    })
    return s


def download_with_resume(session: requests.Session, url: str, out_path: Path) -> bool:
    """Stream-download a URL with resume support."""
    # Determine the size already on disk (if any)
    existing_size = out_path.stat().st_size if out_path.exists() else 0

    headers = {}
    if existing_size > 0:
        headers["Range"] = f"bytes={existing_size}-"

    print(f"  GET {url[:90]}...")
    if existing_size > 0:
        print(f"  Resuming from byte {existing_size:,}")

    try:
        resp = session.get(url, headers=headers, stream=True, timeout=(30, 60))
        if resp.status_code == 416:
            # Range not satisfiable — file already complete on server side
            print(f"  416 — file already complete on disk")
            return True
        if resp.status_code != 200 and resp.status_code != 206:
            print(f"  ✗ HTTP {resp.status_code}")
            return False

        total = int(resp.headers.get("Content-Length", 0))
        if resp.status_code == 206:
            total += existing_size  # partial response — add to existing
        if total > 0:
            print(f"  Total size: {total / 1024 / 1024:.1f} MB")

        mode = "ab" if existing_size > 0 else "wb"
        bytes_written = existing_size
        last_report = time.time()
        with open(out_path, mode) as f:
            for chunk in resp.iter_content(chunk_size=64 * 1024):
                if chunk:
                    f.write(chunk)
                    bytes_written += len(chunk)
                    now = time.time()
                    if now - last_report > 10:
                        pct = (bytes_written / total * 100) if total else 0
                        print(f"    {bytes_written / 1024 / 1024:.1f} MB / {(total / 1024 / 1024):.1f} MB ({pct:.1f}%)")
                        last_report = now
        print(f"  ✓ Downloaded {bytes_written / 1024 / 1024:.1f} MB → {out_path.name}")
        return True
    except Exception as e:
        print(f"  ✗ Error: {type(e).__name__}: {e}")
        return False


def main():
    session = make_session()
    success = []
    failed = []

    for t in TARGETS:
        out_path = OUT_DIR / t["name"]
        print(f"\n=== [{t['ticker']}] {t['period']} ===")
        print(f"  Output: {out_path}")

        ok = False
        for attempt in range(1, 4):  # 3 outer attempts
            print(f"  Attempt {attempt}/3...")
            if download_with_resume(session, t["url"], out_path):
                ok = True
                break
            time.sleep(5)

        if ok:
            # Verify it's a real PDF
            with open(out_path, "rb") as f:
                head = f.read(5)
            if head == b"%PDF-":
                size = out_path.stat().st_size
                if size < 100_000:
                    print(f"  ✗ File too small ({size} bytes) — likely truncated")
                    out_path.unlink(missing_ok=True)
                    failed.append(t)
                else:
                    print(f"  ✓ Verified PDF ({size / 1024 / 1024:.1f} MB)")
                    success.append(t)
            else:
                print(f"  ✗ Not a PDF (head: {head!r})")
                out_path.unlink(missing_ok=True)
                failed.append(t)
        else:
            failed.append(t)
            if out_path.exists():
                out_path.unlink(missing_ok=True)  # remove partial

    print(f"\n=== SUMMARY ===")
    print(f"  Successful: {len(success)}")
    print(f"  Failed:     {len(failed)}")
    if failed:
        print(f"  Failed targets:")
        for t in failed:
            print(f"    - {t['ticker']} {t['period']}: {t['url']}")
    print(f"\nFiles in storage/real-pdfs/:")
    for p in sorted(OUT_DIR.iterdir()):
        print(f"  {p.name:60s} {p.stat().st_size / 1024 / 1024:6.1f} MB")


if __name__ == "__main__":
    main()
