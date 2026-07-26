"""Deterministic visual/Pilot sampling."""
from __future__ import annotations

import hashlib
import random
from typing import Any, Dict, Iterable, List, Sequence, Set


_RISKY_COMPONENTS = {
    "image",
    "audio",
    "sound",
    "video",
    "movie",
    "slider",
    "mouse",
    "code",
}
_RISKY_MATERIAL = {"gated", "licensed", "physical", "missing"}


def _is_risky(row: Dict[str, Any]) -> bool:
    comps = {str(c).lower() for c in (row.get("components") or [])}
    if comps & _RISKY_COMPONENTS:
        return True
    if (row.get("material_status") or "") in _RISKY_MATERIAL:
        return True
    if int(row.get("category") or 0) in {2, 3} and comps & {"audio", "image", "video"}:
        return True
    if (row.get("material_status") or "") == "gated":
        return True
    return False


def select_sample(
    rows: Sequence[Dict[str, Any]],
    *,
    seed: int = 150,
    category1_fraction: float = 0.2,
    prior_failures: Iterable[str] = (),
) -> List[Dict[str, Any]]:
    by_id = {r["paper_id"]: r for r in rows}
    chosen: Dict[str, Dict[str, Any]] = {}

    for r in rows:
        if _is_risky(r):
            chosen[r["paper_id"]] = r

    for pid in prior_failures:
        if pid in by_id:
            chosen[pid] = by_id[pid]

    remaining = [
        r
        for r in rows
        if r["paper_id"] not in chosen and int(r.get("category") or 0) == 1
    ]
    if remaining and category1_fraction > 0:
        rng = random.Random(seed)
        # stable shuffle by paper_id hash + seed
        ordered = sorted(
            remaining,
            key=lambda r: hashlib.sha256(f"{seed}:{r['paper_id']}".encode()).hexdigest(),
        )
        n = max(1, int(round(len(ordered) * category1_fraction))) if ordered else 0
        # use rng only to pick count boundary already deterministic via hash order
        _ = rng.random()
        for r in ordered[:n]:
            chosen[r["paper_id"]] = r

    return sorted(chosen.values(), key=lambda r: r["paper_id"])


def implementation_signatures(rows: Sequence[Dict[str, Any]]) -> Set[str]:
    sigs: Set[str] = set()
    for r in rows:
        for s in r.get("signatures") or r.get("implementation_signatures") or []:
            sigs.add(str(s))
        comps = {str(c).lower() for c in (r.get("components") or [])}
        if "keyboard" in comps and "text" in comps:
            sigs.add("forced_choice")
        if "nogo" in comps or r.get("task_kind") == "gonogo":
            sigs.add("nogo")
        if r.get("multi_stage"):
            sigs.add("multi_stage")
        if r.get("nested") or r.get("multiblock"):
            sigs.add("nested_or_multiblock")
        if "slider" in comps or r.get("continuous"):
            sigs.add("continuous_or_rating")
        if r.get("timed_response") or "keyboard" in comps:
            sigs.add("timed_response")
    return sigs
