"""Audit materials dirs and emit gated/public inventory."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.replication150.materials import audit_material


GATED_NAME_KEYWORDS = (
    "cfd",
    "nimstim",
    "kdef",
    "radboud",
    "rafd",
    "jacfee",
    "msfde",
    "iaps",
    "oasis",
    "naps",
)


def looks_gated(name: str, readme: str) -> bool:
    blob = f"{name}\n{readme}".lower()
    if any(k in name.lower() for k in GATED_NAME_KEYWORDS):
        return True
    if any(
        w in blob
        for w in (
            "request access",
            "license agreement",
            "permission required",
            "application required",
            "do not redistribute",
            "not redistributable",
            "registration required",
            "需申请",
            "许可协议",
        )
    ):
        return True
    return False


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--vault", required=True)
    p.add_argument("--out", default=None)
    args = p.parse_args(argv)
    vault = Path(args.vault)
    materials = vault / "materials"
    if not materials.is_dir():
        print(f"missing materials: {materials}", file=sys.stderr)
        return 2

    rows = []
    for d in sorted(materials.iterdir()):
        if not d.is_dir():
            continue
        readme = ""
        for cand in ("README.md", "readme.md", "README.txt", "readme.txt"):
            rp = d / cand
            if rp.is_file():
                try:
                    readme = rp.read_text(encoding="utf-8", errors="replace")[:4000]
                except Exception:
                    readme = ""
                break

        # Prefer broad media suffixes; archives also count as ready
        report = audit_material(
            d,
            allowed_suffixes={
                ".jpg",
                ".jpeg",
                ".png",
                ".bmp",
                ".gif",
                ".wav",
                ".mp3",
                ".ogg",
                ".mp4",
                ".avi",
                ".csv",
                ".tsv",
                ".txt",
                ".json",
                ".zip",
                ".7z",
                ".tar",
                ".gz",
            },
        )
        gated = looks_gated(d.name, readme)
        status = report.status
        if gated and status == "missing":
            status = "gated"
        elif gated and status == "ready":
            status = "ready_gated"  # present locally but still licensed
        rows.append(
            {
                "dataset": d.name,
                "path": str(d),
                "status": status,
                "gated_or_apply": gated,
                "asset_count": report.asset_count,
                "sample_files": list(report.assets[:10]),
                "readme_excerpt": readme[:400].replace("\n", " "),
            }
        )

    out = Path(args.out) if args.out else vault / "catalog" / "materials_inventory.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "n": len(rows),
        "ready": sum(1 for r in rows if r["status"] in {"ready", "ready_gated"}),
        "missing": sum(1 for r in rows if r["status"] == "missing"),
        "gated": sum(1 for r in rows if r["status"] == "gated" or r["gated_or_apply"]),
        "datasets": rows,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}")
    print(
        f"n={payload['n']} ready={payload['ready']} missing={payload['missing']} gated_flag={payload['gated']}"
    )
    print("\n=== APPLICATION / GATED (list only, do not download) ===")
    for r in rows:
        if r["gated_or_apply"] or r["status"] == "gated":
            print(f"- {r['dataset']}: status={r['status']} assets={r['asset_count']}")
    print("\n=== MISSING PUBLIC-LOOKING (download candidates) ===")
    for r in rows:
        if not r["gated_or_apply"] and r["status"] == "missing":
            print(f"- {r['dataset']}: assets={r['asset_count']} excerpt={r['readme_excerpt'][:140]}")
    print("\n=== PRESENT / READY ===")
    for r in rows:
        if r["status"] in {"ready", "ready_gated"}:
            print(f"- {r['dataset']}: assets={r['asset_count']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
