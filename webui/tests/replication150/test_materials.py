from tools.replication150.materials import audit_material


def test_readme_only_dataset_is_missing(tmp_path):
    dataset = tmp_path / "CFD_faces"
    dataset.mkdir()
    (dataset / "README.md").write_text("download instructions", encoding="utf-8")
    report = audit_material(dataset, allowed_suffixes={".jpg", ".png"})
    assert report.status == "missing"


def test_archive_counts_as_present_when_expected(tmp_path):
    dataset = tmp_path / "ESC50_sounds"
    dataset.mkdir()
    (dataset / "ESC-50-master.zip").write_bytes(b"zip")
    report = audit_material(dataset, allowed_suffixes={".zip", ".wav"})
    assert report.status == "ready"
