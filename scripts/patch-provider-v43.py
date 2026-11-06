#!/usr/bin/env python3
"""Provider v4.3: quadruple the patient-retry patience (2 -> 4, i.e. ~50s of
waiting spread across the budget) — production evidence shows contention
windows on the shared Vercel egress IP run 30-60s."""
import shutil

TARGET = "/tmp/my-project/src/lib/ai/provider.ts"
MIRROR = "/tmp/my-project/scripts/patches/provider.ts"

src = open(TARGET).read()
OLD = "const PATIENT_RETRY_MAX = 2"
NEW = "const PATIENT_RETRY_MAX = 4"
if src.count(OLD) != 1:
    raise SystemExit(f"anchor count = {src.count(OLD)}")
src = src.replace(OLD, NEW)
open(TARGET, "w").write(src)
shutil.copyfile(TARGET, MIRROR)
print("V4.3 PATCHED OK")
