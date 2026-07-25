#!/usr/bin/env python3
"""Build a source zip of the monorepo (no .git / .venv / runs).

Usage (from monorepo root or webui/):
  python webui/scripts/build_dist_zip.py
  python webui/scripts/build_dist_zip.py --out %TEMP%/psyclaw-src.zip

Does not publish a GitHub Release. Output path printed on stdout.
"""
from __future__ import annotations

import argparse
import os
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path


SKIP_DIR_NAMES = {
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    "node_modules",
    "runs",
    ".hermes",
    "dist",
}

SKIP_SUFFIXES = {".pyc", ".pyo"}


def monorepo_root() -> Path:
    here = Path(__file__).resolve()
    # webui/scripts/this → webui → monorepo
    webui = here.parents[1]
    parent = webui.parent
    if (parent / "webui" / "start.py").is_file() and (parent / "skills" / "psyclaw").is_dir():
        return parent
    if (webui / "start.py").is_file():
        return webui  # packing webui-only fallback
    return parent


def should_skip(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    for part in rel.parts:
        if part in SKIP_DIR_NAMES:
            return True
    if path.suffix in SKIP_SUFFIXES:
        return True
    name = path.name.lower()
    if name.startswith("icon-source"):
        return True
    return False


def build_zip(out: Path, root: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for dirpath, dirnames, filenames in os.walk(root):
            # prune in-place
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES]
            base = Path(dirpath)
            for fn in filenames:
                fp = base / fn
                if should_skip(fp, root):
                    continue
                arc = fp.relative_to(root).as_posix()
                # nest under psyclaw/ when packing monorepo
                if (root / "webui" / "start.py").is_file():
                    arc = f"psyclaw/{arc}"
                zf.write(fp, arcname=arc)
    return out


def main() -> int:
    root = monorepo_root()
    ap = argparse.ArgumentParser(description="Build PsyClaw source zip")
    ap.add_argument(
        "--out",
        default="",
        help="Output zip path (default: %%TEMP%%/psyclaw-src-YYYYMMDD.zip)",
    )
    args = ap.parse_args()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    default_name = f"psyclaw-src-{stamp}.zip"
    if args.out:
        out = Path(args.out).expanduser().resolve()
    else:
        tmp = Path(os.environ.get("TEMP") or os.environ.get("TMP") or "/tmp")
        out = tmp / default_name
    path = build_zip(out, root)
    print(path)
    print(f"root={root}", file=sys.stderr)
    print(f"bytes={path.stat().st_size}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
