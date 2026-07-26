"""Batch item selection and orchestration helpers."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Set


_DONE = {
    "static_pass",
    "compile_pass",
    "open_pass",
    "smoke_pass",
    "pilot_pass",
    "blocked",
    "excluded",
}


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
        st = (latest_state.get(pid) or {}).get("status")
        if resume and st:
            if st == "failed" and retry_failed:
                out.append(row)
                continue
            if st in _DONE and st != "failed":
                continue
        out.append(row)
    return out
