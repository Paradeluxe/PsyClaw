"""Per-project replication metadata validation."""
from __future__ import annotations

from typing import Any, Dict, List


_REQUIRED_UNKNOWN_BLOCKERS = {
    "stimulus_duration",
    "trial_count",
    "response_mapping",
    "factors",
}


def validate_project_meta(meta: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if not isinstance(meta, dict):
        return ["meta must be an object"]

    level = meta.get("replication_level")
    unknowns = list(meta.get("unknowns") or [])
    run_policy = meta.get("run_policy")
    material_status = meta.get("material_status")

    if level == "faithful":
        bad = [u for u in unknowns if u in _REQUIRED_UNKNOWN_BLOCKERS or True]
        # any unknown required field blocks faithful
        if unknowns:
            errors.append("faithful project has unresolved required fields")

    if level == "blocked" and run_policy != "do_not_run":
        errors.append("blocked project must have run_policy=do_not_run")

    if material_status in {"gated", "licensed", "missing", "physical"} and run_policy == "run":
        errors.append("non-ready materials cannot use run_policy=run")

    if not meta.get("paper_id"):
        errors.append("missing paper_id")

    return errors
