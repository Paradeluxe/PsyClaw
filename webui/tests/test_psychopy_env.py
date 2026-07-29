from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import psychopy_env  # noqa: E402


def test_existing_override_without_psychopy_is_unavailable(monkeypatch, tmp_path: Path) -> None:
    fake_python = tmp_path / "python.exe"
    fake_python.write_text("", encoding="utf-8")
    monkeypatch.setenv("PSYCLAW_PSYCHOPY_PYTHON", str(fake_python))
    monkeypatch.setattr(psychopy_env, "_can_import_psychopy", lambda path: False)
    psychopy_env.clear_resolution_cache()

    engine = psychopy_env.resolve_psychopy_engine()

    assert engine == {
        "available": False,
        "path": str(fake_python),
        "source": "env",
        "reason": "import_failed",
    }


def test_importable_override_is_available(monkeypatch, tmp_path: Path) -> None:
    fake_python = tmp_path / "python.exe"
    fake_python.write_text("", encoding="utf-8")
    monkeypatch.setenv("PSYCLAW_PSYCHOPY_PYTHON", str(fake_python))
    monkeypatch.setattr(psychopy_env, "_can_import_psychopy", lambda path: True)
    psychopy_env.clear_resolution_cache()

    engine = psychopy_env.resolve_psychopy_engine()

    assert engine == {
        "available": True,
        "path": str(fake_python),
        "source": "env",
        "reason": "ok",
    }
