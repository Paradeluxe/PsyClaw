import pytest

from tools.replication150.generate_marker import build_marker
from tools.replication150.method_record import validate_method_record
from tools.replication150.paradigm_templates import TEMPLATES, get_method


@pytest.mark.parametrize("paper_id", sorted(TEMPLATES))
def test_every_template_declares_ms_and_emits_seconds(paper_id):
    method = TEMPLATES[paper_id]()
    field = method["timing"]["stimulus_ms"]
    assert field["unit"] == "ms"
    # templates use source.page=0; provenance ok for method gate when unit present
    errs = validate_method_record(
        {
            **method,
            "trial_flow": method.get("trial_flow") or ["stimulus"],
            "trial_count": method.get("trial_count") or {"value": 1, "page": 0, "status": "known"},
            "evidence": method.get("evidence") or [],
        }
    )
    # allow missing evidence section only if we inject it
    assert not any("unit" in e or "*_ms" in e for e in errs)

    marker = build_marker(method, project_name=paper_id)
    trial = next(r for r in marker["routines"] if r["name"] == "trial")
    stim = next(c for c in trial["components"] if c.get("name") == "stim")
    assert stim["duration"] == float(field["value"]) / 1000.0


def test_generic_fallback_uses_same_contract():
    method = get_method("unknown_demo", {"category": 1, "paradigm_label": "unknown"})
    assert method["timing"]["stimulus_ms"]["unit"] == "ms"
