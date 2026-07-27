"""Read-only timing unit audit for templates and vault markers.

Usage:
  python tools/replication150/audit_timing.py --templates --json
  python tools/replication150/audit_timing.py --root E:/path/to/experiments --json

Exit: 0 clean/warn-only, 1 hard findings, 2 usage/IO error.
Never mutates markers. Never auto-divides by 1000.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.replication150.timing_contract import TIMING_CONTRACT_VERSION, validate_method_timing


def _issue(severity: str, path: str, field: str, value: Any, message: str) -> dict:
    return {
        "severity": severity,
        "path": path,
        "field": field,
        "value": value,
        "message": message,
    }


def audit_marker_obj(data: dict, *, relpath: str = "") -> List[dict]:
    issues: List[dict] = []
    notes = data.get("design_notes") if isinstance(data.get("design_notes"), dict) else {}
    generated = notes.get("source") == "replication150"
    for ri, r in enumerate(data.get("routines") or []):
        if not isinstance(r, dict):
            continue
        for ci, c in enumerate(r.get("components") or []):
            if not isinstance(c, dict):
                continue
            cpath = f"{relpath}:routines[{ri}].components[{ci}]" if relpath else f"routines[{ri}].components[{ci}]"
            if "duration_ms" in c or "start_ms" in c:
                issues.append(
                    _issue("hard", cpath, "duration_ms", c.get("duration_ms", c.get("start_ms")), "use seconds fields")
                )
            for field in ("start", "duration"):
                if field not in c:
                    continue
                val = c[field]
                try:
                    num = float(val)
                except (TypeError, ValueError):
                    issues.append(_issue("hard", cpath, field, val, "must be numeric seconds or duration=-1"))
                    continue
                if field == "start":
                    if not math.isfinite(num) or num < 0:
                        issues.append(_issue("hard", cpath, field, val, "start must be finite >= 0 seconds"))
                    continue
                if num == -1:
                    continue
                if not math.isfinite(num) or num < 0:
                    issues.append(_issue("hard", cpath, field, val, "duration must be finite >= 0 or -1"))
                    continue
                if generated and num > 30:
                    issues.append(
                        _issue(
                            "hard",
                            cpath,
                            field,
                            val,
                            "looks like raw ms; marker duration is seconds (1500ms→1.5)",
                        )
                    )
                elif num >= 300:
                    issues.append(_issue("hard", cpath, field, val, "implausibly long; check ms/s mixup"))
                elif num > 30:
                    issues.append(_issue("warn", cpath, field, val, "long duration; confirm intentional seconds"))
    return issues


def audit_templates() -> dict:
    from tools.replication150.paradigm_templates import TEMPLATES, get_method
    from tools.replication150.generate_marker import build_marker

    issues: List[dict] = []
    for paper_id in sorted(TEMPLATES):
        method = TEMPLATES[paper_id]()
        for err in validate_method_timing(method.get("timing") or {}):
            issues.append(_issue("hard", f"template:{paper_id}", "timing", None, err))
        try:
            marker = build_marker(method, project_name=paper_id)
        except Exception as exc:
            issues.append(_issue("hard", f"template:{paper_id}", "build_marker", None, str(exc)))
            continue
        issues.extend(audit_marker_obj(marker, relpath=f"template:{paper_id}"))
        field = method["timing"]["stimulus_ms"]
        stim = next(
            c
            for r in marker["routines"]
            if r["name"] == "trial"
            for c in r["components"]
            if c.get("name") == "stim"
        )
        expected = float(field["value"]) / 1000.0
        if float(stim.get("duration")) != expected:
            issues.append(
                _issue(
                    "hard",
                    f"template:{paper_id}",
                    "duration",
                    stim.get("duration"),
                    f"expected {expected} from stimulus_ms={field['value']}",
                )
            )
    # generic fallback
    gm = get_method("unknown_demo", {"category": 1, "paradigm_label": "unknown"})
    for err in validate_method_timing(gm.get("timing") or {}):
        issues.append(_issue("hard", "template:generic", "timing", None, err))

    hard = sum(1 for i in issues if i["severity"] == "hard")
    warn = sum(1 for i in issues if i["severity"] == "warn")
    return {
        "timing_contract_version": TIMING_CONTRACT_VERSION,
        "template_count": len(TEMPLATES),
        "marker_count": 0,
        "hard_count": hard,
        "warn_count": warn,
        "duration_distribution": {},
        "issues": issues,
    }


def audit_paths(paths: Iterable[Path]) -> dict:
    issues: List[dict] = []
    dist: Counter = Counter()
    marker_count = 0
    for root in paths:
        root = Path(root)
        files = [root] if root.is_file() else sorted(root.rglob("*.psyclaw"))
        for fp in files:
            if not fp.is_file():
                continue
            marker_count += 1
            try:
                data = json.loads(fp.read_text(encoding="utf-8"))
            except Exception as exc:
                issues.append(_issue("hard", str(fp), "json", None, str(exc)))
                continue
            for ri, r in enumerate(data.get("routines") or []):
                for ci, c in enumerate((r or {}).get("components") or []):
                    if isinstance(c, dict) and "duration" in c:
                        dist[str(c["duration"])] += 1
            issues.extend(audit_marker_obj(data, relpath=str(fp)))
    hard = sum(1 for i in issues if i["severity"] == "hard")
    warn = sum(1 for i in issues if i["severity"] == "warn")
    return {
        "timing_contract_version": TIMING_CONTRACT_VERSION,
        "template_count": 0,
        "marker_count": marker_count,
        "hard_count": hard,
        "warn_count": warn,
        "duration_distribution": dict(dist.most_common()),
        "issues": issues,
    }


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Read-only timing unit audit")
    p.add_argument("--templates", action="store_true")
    p.add_argument("--root", action="append", default=[])
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    if not args.templates and not args.root:
        print("usage: --templates and/or --root PATH", file=sys.stderr)
        return 2

    reports = []
    if args.templates:
        reports.append(audit_templates())
    if args.root:
        reports.append(audit_paths([Path(r) for r in args.root]))

    # merge
    merged = {
        "timing_contract_version": TIMING_CONTRACT_VERSION,
        "template_count": sum(r.get("template_count", 0) for r in reports),
        "marker_count": sum(r.get("marker_count", 0) for r in reports),
        "hard_count": sum(r.get("hard_count", 0) for r in reports),
        "warn_count": sum(r.get("warn_count", 0) for r in reports),
        "duration_distribution": {},
        "issues": [],
    }
    dist: Counter = Counter()
    for r in reports:
        merged["issues"].extend(r.get("issues") or [])
        dist.update(r.get("duration_distribution") or {})
    merged["duration_distribution"] = dict(dist.most_common())

    if args.json:
        print(json.dumps(merged, ensure_ascii=False, indent=2))
    else:
        print(
            f"templates={merged['template_count']} markers={merged['marker_count']} "
            f"hard={merged['hard_count']} warn={merged['warn_count']}"
        )
        for iss in merged["issues"][:50]:
            print(f"  [{iss['severity']}] {iss['path']} {iss['field']}={iss['value']}: {iss['message']}")

    if merged["hard_count"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
