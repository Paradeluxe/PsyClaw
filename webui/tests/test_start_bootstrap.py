from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_start():
    path = ROOT / "start.py"
    spec = importlib.util.spec_from_file_location("psyclaw_start_bootstrap_test", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_ensure_runtime_returns_existing_venv_with_flask(monkeypatch, tmp_path: Path) -> None:
    launcher = _load_start()
    venv_py = tmp_path / ".venv" / "Scripts" / "python.exe"
    venv_py.parent.mkdir(parents=True)
    venv_py.write_text("", encoding="utf-8")

    monkeypatch.setattr(launcher, "_venv_python", lambda root: str(venv_py))
    monkeypatch.setattr(launcher, "_python_has_flask", lambda exe: True)

    py, src = launcher._ensure_runtime(str(tmp_path))
    assert py == str(venv_py)
    assert src == "venv"


def test_ensure_runtime_reports_none_without_host_python(monkeypatch, tmp_path: Path) -> None:
    launcher = _load_start()
    monkeypatch.setattr(launcher, "_venv_python", lambda root: None)
    monkeypatch.setattr(launcher, "_host_pythons", lambda: [])
    py, src = launcher._ensure_runtime(str(tmp_path))
    assert py is None
    assert src == "none"
