import pytest

from tools.replication150.generate_marker import MaterialBlocked, build_marker


def method_fixture():
    return {
        "design": {
            "assignment": "within",
            "factors": [{"name": "congruency", "levels": ["congruent", "incongruent"]}],
        },
        "trial_flow": ["fixation", "stimulus", "response"],
        "timing": {"stimulus_ms": {"value": 500, "status": "known"}},
        "responses": [{"device": "keyboard", "keys": ["f", "j"], "corr_field": "corrAns"}],
        "trial_count": {"value": 96, "status": "known"},
        "conditions": [
            {"congruency": "congruent", "corrAns": "f", "text": "RED"},
            {"congruency": "incongruent", "corrAns": "j", "text": "GREEN"},
        ],
        "metrics": {"group_by": ["congruency"]},
        "material_status": "not_applicable",
        "stimulus_kind": "text",
    }


def stroop_method_fixture():
    return method_fixture()


def image_task_fixture(material_status="ready"):
    m = method_fixture()
    m["stimulus_kind"] = "image"
    m["material_status"] = material_status
    m["asset_paths"] = ["assets/face1.png"] if material_status == "ready" else []
    return m


def test_generator_emits_canonical_platform_shape():
    marker = build_marker(method_fixture(), project_name="cat1_demo")
    assert marker["name"] == "cat1_demo"
    assert marker["routines"]
    assert marker["flow"]
    assert "paradigm_compiler" not in marker


def test_generator_keeps_factor_and_corrans_as_condition_data():
    marker = build_marker(stroop_method_fixture(), project_name="cat1_stroop")
    loop = next(n for n in marker["flow"] if n.get("kind") == "loop")
    rows = loop["conditions"]
    assert {"congruency", "corrAns"} <= set(rows[0])
    assert marker["metrics"]["group_by"] == ["congruency"]


def test_missing_required_assets_block_runnable_marker():
    method = image_task_fixture(material_status="missing")
    with pytest.raises(MaterialBlocked):
        build_marker(method, project_name="cat2_missing", runnable=True)


def test_framework_only_marker_displays_blocker_not_fake_stimulus():
    method = image_task_fixture(material_status="gated")
    marker = build_marker(method, project_name="cat3_gated", runnable=False)
    assert marker["replication_status"] == "framework_only"
    assert "MISSING_ASSET" not in str(marker)
