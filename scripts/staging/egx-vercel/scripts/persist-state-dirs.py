#!/usr/bin/env python3
"""Persist the EGX app state directories.

Moves the stateful directories of /tmp/my-project (reports, storage, backups)
into the persistent area (/home/z/my-project/download/) and replaces the
in-/tmp copies with symlinks, so harvest snapshots, rollback journals, admin
ops logs and DB backups survive sandbox recycles. Also removes stale DB/upload
copies and symlinks them to the persistent originals.
"""
import os
import shutil
import sys

TMP = "/tmp/my-project"
PERSIST = "/home/z/my-project/download"

MOVE_DIRS = ["reports", "storage", "backups"]          # copy → symlink
LINK_DIRS = ["download", "upload", "db"]               # stale copy → symlink
LINK_TARGETS = {
    "download": "/home/z/my-project/download",
    "upload": "/home/z/my-project/upload",
    "db": "/home/z/my-project/download/db",
}


def main() -> int:
    os.makedirs(PERSIST, exist_ok=True)

    for name in MOVE_DIRS:
        src = os.path.join(TMP, name)
        dst = os.path.join(PERSIST, name)
        if os.path.islink(src):
            print(f"[skip] {name} already a symlink")
            continue
        if os.path.isdir(src):
            os.makedirs(dst, exist_ok=True)
            print(f"[copy] {src} -> {dst} ({len(os.listdir(src))} entries)")
            # merge-copy without following the dir itself
            for entry in os.listdir(src):
                s, d = os.path.join(src, entry), os.path.join(dst, entry)
                if os.path.exists(d):
                    continue
                shutil.move(s, d)
            shutil.rmtree(src, ignore_errors=True)
        else:
            os.makedirs(dst, exist_ok=True)
        os.symlink(dst, src)
        print(f"[link] {src} -> {dst}")

    for name in LINK_DIRS:
        src = os.path.join(TMP, name)
        dst = LINK_TARGETS[name]
        if os.path.islink(src):
            print(f"[skip] {name} already a symlink")
            continue
        if os.path.isdir(src):
            shutil.rmtree(src)
            print(f"[rm]   stale {src}")
        os.symlink(dst, src)
        print(f"[link] {src} -> {dst}")

    print("[done] state dirs persisted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
