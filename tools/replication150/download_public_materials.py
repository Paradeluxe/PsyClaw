"""Download public (non-gated) stimulus packs into vault/materials.

Policy: skip gated/apply-only; skip MIT_Places by default (24GB).
"""
from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Hand-curated public direct links where known.
# Gated sets intentionally omitted.
PUBLIC_DOWNLOADS = {
    "ESC50_sounds": [
        # full dataset zip if not already present
        (
            "https://github.com/karoldvl/ESC-50/archive/master.zip",
            "ESC-50-master.zip",
        ),
    ],
    "FRIDa_food": [
        # OSF storage node files often need API; placeholder resolved at runtime
    ],
    "THINGS_objects": [
        # concepts + images mirrors change; resolve from things-initiative
    ],
}


def download(url: str, dest: Path, *, timeout: int = 600) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"GET {url}\n -> {dest}")
    req = urllib.request.Request(url, headers={"User-Agent": "psyclaw-replication150/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp, tmp.open("wb") as out:
        total = resp.headers.get("Content-Length")
        n = 0
        while True:
            chunk = resp.read(1024 * 256)
            if not chunk:
                break
            out.write(chunk)
            n += len(chunk)
            if total and n % (10 * 1024 * 1024) < 256 * 1024:
                print(f"  {n}/{total} bytes")
    tmp.replace(dest)
    h = hashlib.sha256(dest.read_bytes()).hexdigest()
    print(f"OK {dest.name} sha256={h[:16]}… size={dest.stat().st_size}")


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--vault", required=True)
    p.add_argument("--only", default=None, help="comma-separated dataset names")
    p.add_argument("--list", action="store_true")
    args = p.parse_args(argv)
    vault = Path(args.vault)
    materials = vault / "materials"
    only = set(args.only.split(",")) if args.only else None

    if args.list:
        for name, urls in PUBLIC_DOWNLOADS.items():
            print(name, urls)
        return 0

    for name, items in PUBLIC_DOWNLOADS.items():
        if only and name not in only:
            continue
        dest_dir = materials / name
        if not dest_dir.is_dir():
            print(f"skip missing dir {dest_dir}")
            continue
        for url, filename in items:
            dest = dest_dir / filename
            if dest.is_file() and dest.stat().st_size > 1000:
                print(f"exists {dest} ({dest.stat().st_size} bytes)")
                continue
            try:
                download(url, dest)
            except Exception as exc:
                print(f"FAIL {name} {url}: {exc}")
                return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
