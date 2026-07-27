"""Generate platform-level PsyClaw markers from Method records."""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional

from tools.replication150.timing_contract import (
    TimingContractError,
    milliseconds_to_seconds,
)


class MaterialBlocked(Exception):
    """Raised when a runnable marker requires unavailable materials."""


def _conditions(method: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = method.get("conditions")
    if rows:
        return deepcopy(rows)
    factors = (method.get("design") or {}).get("factors") or []
    if not factors:
        return [{"corrAns": ""}]
    # minimal cartesian of first factor only for shell
    fac = factors[0]
    name = fac.get("name") or "factor"
    return [{name: level, "corrAns": ""} for level in (fac.get("levels") or ["A"])]


def _stimulus_seconds(method: Dict[str, Any]) -> float:
    """Only ms→s conversion gateway for marker generation."""
    field = (method.get("timing") or {}).get("stimulus_ms")
    if not isinstance(field, dict):
        raise TimingContractError("timing.stimulus_ms is required")
    if field.get("unit") != "ms":
        raise TimingContractError("timing.stimulus_ms.unit must be 'ms'")
    if field.get("status") == "unknown":
        raise TimingContractError("timing.stimulus_ms is unknown")
    return milliseconds_to_seconds(field.get("value"))


def build_marker(
    method: Dict[str, Any],
    *,
    project_name: str,
    runnable: bool = True,
) -> Dict[str, Any]:
    kind = (method.get("stimulus_kind") or "text").lower()
    material_status = method.get("material_status") or "not_applicable"
    needs_assets = kind in {"image", "audio", "video"}

    if runnable and needs_assets and material_status != "ready":
        raise MaterialBlocked(
            f"runnable {kind} marker blocked: material_status={material_status}"
        )

    framework_only = (not runnable) or (
        needs_assets and material_status in {"missing", "gated", "licensed", "physical"}
    )

    # Marker / PsychoPy duration is SECONDS. Method timing stores ms.
    duration = _stimulus_seconds(method)

    resp = (method.get("responses") or [{}])[0]
    keys = resp.get("keys") or ["space"]

    if framework_only and needs_assets:
        stim_component = {
            "type": "text",
            "name": "blocker",
            "text": f"Materials unavailable ({material_status}). Framework only.",
            "pos": [0, 0],
        }
    elif kind == "image":
        stim_component = {
            "type": "image",
            "name": "stim",
            "image": "$image",
            "pos": [0, 0],
            "duration": duration,
        }
    elif kind == "audio":
        stim_component = {
            "type": "sound",
            "name": "stim",
            "sound": "$sound",
            "duration": duration,
        }
    else:
        stim_component = {
            "type": "text",
            "name": "stim",
            "text": "$text",
            "pos": [0, 0],
            "duration": duration,
        }

    trial_components: List[Dict[str, Any]] = [
        {
            "type": "text",
            "name": "fixation",
            "text": "+",
            "pos": [0, 0],
            "duration": 0.5,
        },
        stim_component,
        {
            "type": "keyboard",
            "name": "resp",
            "keys": keys,
            "store": True,
        },
    ]

    conditions = _conditions(method)
    # normalize corrAns key
    for row in conditions:
        if "corrAns" not in row and "corr_ans" in row:
            row["corrAns"] = row.pop("corr_ans")

    trial_count = method.get("trial_count") or {}
    total = trial_count.get("value") if isinstance(trial_count, dict) else trial_count
    n_rows = max(1, len(conditions))
    n_reps = max(1, int(total // n_rows)) if total else 1

    metrics = method.get("metrics") or {}
    group_by = metrics.get("group_by") or [
        f["name"] for f in ((method.get("design") or {}).get("factors") or []) if f.get("name")
    ]

    marker: Dict[str, Any] = {
        "name": project_name,
        "version": "0.1",
        "display": {"units": "height", "fullscr": False},
        "routines": [
            {
                "name": "instructions",
                "components": [
                    {
                        "type": "text",
                        "name": "instr",
                        "text": (
                            f"Materials unavailable ({material_status}). Framework only."
                            if framework_only and needs_assets
                            else "Follow on-screen instructions. Press space to begin."
                        ),
                        "pos": [0, 0],
                    },
                    {"type": "keyboard", "name": "instr_key", "keys": ["space"]},
                ],
            },
            {"name": "trial", "components": trial_components},
            {
                "name": "thanks",
                "components": [
                    {
                        "type": "text",
                        "name": "bye",
                        "text": "Thank you.",
                        "pos": [0, 0],
                    }
                ],
            },
        ],
        "flow": [
            {"kind": "routine", "routine": "instructions"},
            {
                "kind": "loop",
                "name": "loop_main",
                "nReps": n_reps,
                "loopType": "random",
                "conditions": conditions,
                "children": [{"kind": "routine", "routine": "trial"}],
            },
            {"kind": "routine", "routine": "thanks"},
        ],
        "metrics": {"group_by": group_by},
        "design_notes": {
            "source": "replication150",
            "material_status": material_status,
        },
    }

    if framework_only:
        marker["replication_status"] = "framework_only"
    else:
        marker["replication_status"] = "runnable"

    return marker
