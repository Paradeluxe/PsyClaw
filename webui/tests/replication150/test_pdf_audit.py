from tools.replication150.pdf_audit import audit_pdf


def test_pdf_audit_rejects_one_page_html_error(tmp_path, monkeypatch):
    pdf = tmp_path / "bad.pdf"
    pdf.write_bytes(b"%PDF fake")
    monkeypatch.setattr(
        "tools.replication150.pdf_audit.inspect_pdf",
        lambda _: {"pages": 1, "text": "Access denied", "metadata": {}},
    )
    report = audit_pdf(pdf)
    assert report["ok"] is False
    assert "too_few_pages" in report["issues"]
    assert "error_page" in report["issues"]
