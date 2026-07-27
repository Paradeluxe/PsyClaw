"""Batch item selection and orchestration helpers."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Set

from tools.replication150.timing_contract import TIMING_CONTRACT_VERSION


_DONE = {
    "static_pass",
    "compile_pass",
    "open_pass",
    "smoke_pass",
    "pilot_pass",
    "blocked",
    "excluded",
}


def should_reprocess_timing(
    previous: Optional[Dict[str, Any]],
    marker_report: Optional[Dict[str, Any]] = None,
) -> bool:
    """True when resume must rebuild because timing contract is stale or marker dirty."""
    prev = previous or {}
    ver = prev.get("timing_contract_version")
    try:
        ver_i = int(ver) if ver is not None else 0
    except (TypeError, ValueError):
        ver_i = 0
    if ver_i < TIMING_CONTRACT_VERSION:
        return True
    if marker_report is not None and not marker_report.get("ok", True):
        return True
    return False


def select_items(
    corpus: Sequence[Dict[str, Any]],
    latest_state: Dict[str, Dict[str, Any]],
    *,
    resume: bool = False,
    retry_failed: bool = False,
    categories: Optional[Set[int]] = None,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for row in corpus:
        if categories is not None and int(row.get("category") or 0) not in categories:
            continue
        pid = row.get("paper_id")
        prev = latest_state.get(pid) or {}
        st = prev.get("status")
        if resume and st:
            if should_reprocess_timing(prev):
                out.append(row)
                continue
            if st == "failed" and retry_failed:
                out.append(row)
                continue
            if st in _DONE and st != "failed":
                continue
        out.append(row)
    return out
