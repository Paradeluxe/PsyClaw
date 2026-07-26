"""Audit four-file analysis packs under project data/."""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict, Optional, Set, Union


def audit_pack(
    data_dir: Union[str, Path],
    *,
    stem: str,
    required_trial_columns: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    data_dir = Path(data_dir)
    missing = []
    trial = data_dir / f"{stem}.csv"
    summary = data_dir / f"{stem}_summary.json"
    by_cond = data_dir / f"{stem}_by_condition.csv"
    metrics_long = data_dir / f"{stem}_metrics_long.csv"

    if not trial.is_file():
        missing.append("trial_csv")
    if not summary.is_file():
        missing.append("summary")
    if not by_cond.is_file():
        missing.append("by_condition")
    if not metrics_long.is_file():
        missing.append("metrics_long")

    if missing:
        return {"ok": False, "missing": missing, "stem": stem}

    # parse trial header
    with trial.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = set(reader.fieldnames or [])
        rows = list(reader)

    if required_trial_columns:
        absent = sorted(required_trial_columns - fieldnames)
        if absent:
            return {
                "ok": False,
                "missing": [],
                "missing_columns": absent,
                "stem": stem,
            }

    try:
        json.loads(summary.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"ok": False, "missing": [], "error": f"summary_parse:{exc}", "stem": stem}

    return {
        "ok": True,
        "missing": [],
        "stem": stem,
        "n_trial_rows": len(rows),
        "columns": sorted(fieldnames),
    }
