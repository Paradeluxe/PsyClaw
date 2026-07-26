from pathlib import Path

from tools.replication150.pdf_resolver import choose_pdf


def test_choose_pdf_prefers_doi_text_match(tmp_path):
    a = tmp_path / "a.pdf"
    b = tmp_path / "b.pdf"
    a.write_bytes(b"fake")
    b.write_bytes(b"fake")
    extracted = {a: "unrelated", b: "doi:10.1037/h0054651 Stroop"}
    result = choose_pdf(
        [a, b],
        doi="10.1037/h0054651",
        title_tokens={"stroop"},
        extractor=lambda p: extracted[p],
    )
    assert result.path == b
    assert result.status == "resolved"


def test_choose_pdf_flags_ties():
    result = choose_pdf([], doi=None, title_tokens=set(), extractor=lambda _: "")
    assert result.status == "unresolved"
