from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def test_docs_state_timing_units_and_open_duration():
    api = _read("skills/psyclaw/references/api-notes.md")
    marker = _read("skills/psyclaw/references/marker-validate.md")
    assert "Method/template: `*_ms`" in api or "Method/template: *_ms" in api
    assert "marker `start` / `duration`: seconds" in api or "start` / `duration`: seconds" in api
    assert "1500 ms → 1.5 s" in marker or "1500ms→1.5" in marker
    assert "`-1`" in marker or "-1" in marker
