from tools.replication150.visual_sample import select_sample


def manifest_row(paper_id, category=1, components=None, material_status="not_applicable"):
    return {
        "paper_id": paper_id,
        "category": category,
        "components": components or ["text", "keyboard"],
        "material_status": material_status,
    }


def corpus_fixture():
    return [
        manifest_row("a", 1, ["text", "keyboard"]),
        manifest_row("b", 1, ["text", "keyboard"]),
        manifest_row("c", 1, ["text", "keyboard"]),
        manifest_row("d", 1, ["text", "keyboard"]),
        manifest_row("e", 1, ["text", "keyboard"]),
    ]


def test_visual_sample_always_includes_risky_components():
    rows = [
        manifest_row("a", category=1, components=["text", "keyboard"]),
        manifest_row("b", category=2, components=["audio", "keyboard"]),
        manifest_row("c", category=3, material_status="gated"),
    ]
    ids = {r["paper_id"] for r in select_sample(rows, seed=150)}
    assert {"b", "c"} <= ids


def test_visual_sample_is_seed_reproducible():
    assert select_sample(corpus_fixture(), seed=150) == select_sample(
        corpus_fixture(), seed=150
    )
