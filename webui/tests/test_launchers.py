from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


def _load_launcher(name: str):
    path = ROOT / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"psyclaw_{name}_test", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class _FakeResponse:
    def __init__(self, payload: dict, status: int = 200) -> None:
        self.status = status
        self._body = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return self._body


@pytest.mark.parametrize("launcher_name", ["start", "start_debug"])
def test_health_identity_rejects_generic_ok(monkeypatch, launcher_name: str) -> None:
    launcher = _load_launcher(launcher_name)
    monkeypatch.setattr(
        launcher.urllib.request,
        "urlopen",
        lambda *args, **kwargs: _FakeResponse({"status": "ok"}),
    )

    assert launcher._health_is_psyclaw(8876) is False


@pytest.mark.parametrize("launcher_name", ["start", "start_debug"])
def test_health_identity_accepts_exact_psyclaw_app(monkeypatch, launcher_name: str) -> None:
    launcher = _load_launcher(launcher_name)
    monkeypatch.setattr(
        launcher.urllib.request,
        "urlopen",
        lambda *args, **kwargs: _FakeResponse(
            {"status": "ok", "app": "psyclaw-webui"}
        ),
    )

    assert launcher._health_is_psyclaw(8876) is True


@pytest.mark.parametrize("launcher_name", ["start", "start_debug"])
def test_health_identity_rejects_other_psyclaw_named_apps(
    monkeypatch, launcher_name: str
) -> None:
    launcher = _load_launcher(launcher_name)
    monkeypatch.setattr(
        launcher.urllib.request,
        "urlopen",
        lambda *args, **kwargs: _FakeResponse(
            {"status": "ok", "app": "psyclaw-webui (minimal simulation)"}
        ),
    )

    assert launcher._health_is_psyclaw(8876) is False
