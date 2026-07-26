from tools.replication150.visual_sample import implementation_signatures


def test_category1_pilot_covers_required_signatures():
    pilot_manifest = [
        {
            "paper_id": "cat1_stroop",
            "signatures": ["forced_choice", "timed_response"],
            "components": ["text", "keyboard"],
        },
        {
            "paper_id": "cat1_gonogo",
            "signatures": ["nogo", "timed_response"],
            "components": ["text", "keyboard"],
            "task_kind": "gonogo",
        },
        {
            "paper_id": "cat1_sternberg",
            "signatures": ["multi_stage", "timed_response"],
            "components": ["text", "keyboard"],
            "multi_stage": True,
        },
        {
            "paper_id": "cat1_axcpt",
            "signatures": ["nested_or_multiblock", "timed_response"],
            "components": ["text", "keyboard"],
            "nested": True,
        },
        {
            "paper_id": "cat1_rating",
            "signatures": ["continuous_or_rating"],
            "components": ["slider"],
            "continuous": True,
        },
    ]
    signatures = implementation_signatures(pilot_manifest)
    required = {
        "forced_choice",
        "nogo",
        "multi_stage",
        "nested_or_multiblock",
        "continuous_or_rating",
        "timed_response",
    }
    assert required <= signatures
