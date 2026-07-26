"""Scoring sanity via generic trial metrics + deterministic fallbacks."""
from __future__ import annotations

import sys
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional


def _load_trial_metrics():
    mono = Path(__file__).resolve().parents[2]
    webui = mono / "webui"
    if str(webui) not in sys.path:
        sys.path.insert(0, str(webui))
    try:
        from backend import trial_metrics as tm  # type: ignore

        return tm
    except Exception:
        return None


def _is_instruction(row: Dict[str, Any]) -> bool:
    routine = str(row.get("routine") or "").lower()
    return routine in {"instructions", "thanks", "instr", "instruction"}


def _trial_type(row: Dict[str, Any]) -> str:
    return str(
        row.get("trialType")
        or row.get("trial_type")
        or row.get("stimType")
        or row.get("stim_type")
        or ""
    ).lower().replace("-", "")


def _fallback_metrics(rows: List[Dict[str, Any]], task_kind: Optional[str]) -> Dict[str, Any]:
    trial_rows = [r for r in rows if not _is_instruction(r)]
    rts = []
    for r in trial_rows:
        rt = r.get("rt")
        if rt in ("", None):
            continue
        try:
            rts.append(float(rt))
        except (TypeError, ValueError):
            continue
    metrics: Dict[str, Any] = {"mean_rt": mean(rts) if rts else None}

    kind = (task_kind or "").lower()
    has_nogo = kind == "gonogo" or any(_trial_type(r) in {"nogo", "go"} for r in rows)
    if has_nogo:
        nogo = [r for r in rows if _trial_type(r) in {"nogo", "inhibit", "stop"}]
        fa = 0
        for r in nogo:
            resp = r.get("response")
            if resp not in (None, "", []):
                fa += 1
        metrics["fa_rate"] = (fa / len(nogo)) if nogo else 0.0
        metrics["n_nogo"] = len(nogo)
    return metrics


def audit_scoring(
    rows: List[Dict[str, Any]],
    *,
    task_kind: Optional[str] = None,
) -> Dict[str, Any]:
    metrics = _fallback_metrics(rows, task_kind)

    tm = _load_trial_metrics()
    if tm is not None:
        try:
            if hasattr(tm, "compute_summary"):
                computed = tm.compute_summary(rows)  # type: ignore
                if isinstance(computed, dict):
                    # merge without wiping required keys
                    for k, v in computed.items():
                        if k not in metrics or metrics[k] is None:
                            metrics[k] = v
        except Exception:
            pass

    ok = True
    if "fa_rate" in metrics:
        nogo = [r for r in rows if _trial_type(r) in {"nogo", "inhibit", "stop"}]
        if nogo and all(r.get("response") in (None, "", []) for r in nogo):
            if float(metrics.get("fa_rate") or 0) != 0.0:
                ok = False
            metrics["fa_rate"] = 0.0

    return {"ok": ok, "metrics": metrics}
