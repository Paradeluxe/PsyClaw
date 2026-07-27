from tools.replication150.generate_cat1_pilots import PILOTS, PILOT_STIMULUS_MS
from tools.replication150.method_record import validate_method_record


def test_all_pilot_factories_use_ms_contract():
    assert set(PILOTS) == set(PILOT_STIMULUS_MS)
    for paper_id, factory in PILOTS.items():
        method = factory()
        field = method["timing"]["stimulus_ms"]
        assert field["value"] == PILOT_STIMULUS_MS[paper_id]
        assert field["unit"] == "ms"
        assert field["status"] == "known"
        assert field["source"]["page"] == 0
        record = {
            **method,
            "trial_flow": method.get("trial_flow") or ["stimulus"],
            "trial_count": {"value": 1, "page": 0, "status": "known"},
            "evidence": [],
        }
        assert validate_method_record(record) == []
