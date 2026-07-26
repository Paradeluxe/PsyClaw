from tools.replication150.project_writer import write_project


def marker_fixture():
    return {
        "name": "cat1_demo",
        "routines": [{"name": "trial", "components": [{"type": "text", "name": "t"}]}],
        "flow": [{"kind": "routine", "routine": "trial"}],
    }


def replication_meta_fixture():
    return {
        "paper_id": "cat1_demo",
        "replication_level": "adaptation",
        "generated_files": ["cat1_demo.psyclaw", "replication.json", "method-extract.md"],
        "run_policy": "run",
    }


def test_writer_preserves_manual_assets_and_data(tmp_path):
    project = tmp_path / "cat2_demo"
    (project / "assets").mkdir(parents=True)
    (project / "assets" / "manual.png").write_bytes(b"manual")
    (project / "data").mkdir()
    (project / "data" / "prior.csv").write_text("x", encoding="utf-8")
    meta = replication_meta_fixture()
    meta["paper_id"] = "cat2_demo"
    meta["generated_files"] = ["cat2_demo.psyclaw", "replication.json", "method-extract.md"]
    marker = marker_fixture()
    marker["name"] = "cat2_demo"
    write_project(project, marker, meta)
    assert (project / "assets" / "manual.png").read_bytes() == b"manual"
    assert (project / "data" / "prior.csv").is_file()


def test_writer_emits_only_canonical_marker(tmp_path):
    project = tmp_path / "cat1_demo"
    write_project(project, marker_fixture(), replication_meta_fixture())
    assert (project / "cat1_demo.psyclaw").is_file()
    assert list(project.glob("*.psyexp")) == []
