from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import create_app  # noqa: E402
from api import routes  # noqa: E402


@pytest.fixture()
def api_client(tmp_path: Path, monkeypatch):
    runs_dir = tmp_path / "runs"
    designs_dir = tmp_path / "designs"
    monkeypatch.setattr(routes, "RUNS_DIR", str(runs_dir))
    monkeypatch.setenv("PSYCLAW_DESIGNS_DIR", str(designs_dir))
    monkeypatch.setenv("PSYCLAW_FORCE_MOCK", "1")
    with routes._RUNS_LOCK:
        routes._RUNS.clear()
    app = create_app()
    app.config.update(TESTING=True)
    with app.test_client() as client:
        yield client, tmp_path
    with routes._RUNS_LOCK:
        routes._RUNS.clear()


def _design(name: str = "api-smoke") -> dict:
    return {
        "name": name,
        "display": {"size": [1024, 768], "fullscreen": False},
        "routines": [{"name": "trial", "components": []}],
        "flow": [{"kind": "routine", "routine": "trial"}],
    }


def _wait_for_status(client, run_id: str, terminal: set[str], timeout: float = 8.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        response = client.get(f"/api/runs/{run_id}")
        assert response.status_code == 200
        payload = response.get_json()
        if payload["status"] in terminal:
            return payload
        time.sleep(0.05)
    raise AssertionError(f"run {run_id} did not reach {terminal}")


def test_project_open_save_roundtrip(api_client) -> None:
    client, tmp_path = api_client
    project = tmp_path / "external" / "RoundTrip"
    project.mkdir(parents=True)

    opened = client.post("/api/projects/open", json={"path": str(project)})
    assert opened.status_code == 200
    assert opened.get_json()["created"] is True
    assert (project / "RoundTrip.psyclaw").is_file()

    design = opened.get_json()["design"]
    design["name"] = "renamed"
    saved = client.post(
        "/api/projects/save", json={"path": str(project), "design": design}
    )
    assert saved.status_code == 200

    reopened = client.post("/api/projects/open", json={"path": str(project)})
    assert reopened.status_code == 200
    assert reopened.get_json()["design"]["name"] == "renamed"


def test_mock_run_finishes_downloads_and_mirrors_csv(api_client) -> None:
    client, tmp_path = api_client
    project = tmp_path / "project"
    project.mkdir()

    created = client.post(
        "/api/runs",
        json={
            "design": _design(),
            "headless": True,
            "project_path": str(project),
            "session": {"participant_id": "P01", "session": "1"},
        },
    )
    assert created.status_code == 200
    run_id = created.get_json()["run_id"]

    finished = _wait_for_status(client, run_id, {"finished", "failed", "stopped"})
    assert finished["status"] == "finished"
    assert "trials.csv" in finished["data_files"]

    downloaded = client.get(f"/api/runs/{run_id}/data/trials.csv")
    assert downloaded.status_code == 200
    assert downloaded.data.startswith(b"participant_id,trial,")
    assert (project / "data" / "trials.csv").read_bytes() == downloaded.data
    cd = downloaded.headers.get("Content-Disposition") or ""
    assert "attachment" in cd.lower()

    pack = client.get(f"/api/runs/{run_id}/data-pack.zip")
    assert pack.status_code == 200
    assert "zip" in (pack.headers.get("Content-Type") or "").lower()
    pcd = pack.headers.get("Content-Disposition") or ""
    assert "attachment" in pcd.lower()
    import io
    import zipfile

    zf = zipfile.ZipFile(io.BytesIO(pack.data))
    names = zf.namelist()
    assert any(n.endswith(".csv") for n in names)


def test_stop_run_reaches_stopped_without_csv(api_client) -> None:
    client, _ = api_client
    created = client.post(
        "/api/runs",
        json={"design": _design("stop-smoke"), "headless": True},
    )
    run_id = created.get_json()["run_id"]

    stopped = client.post(f"/api/runs/{run_id}/stop")
    assert stopped.status_code == 200
    assert stopped.get_json()["status"] == "stopped"

    payload = _wait_for_status(client, run_id, {"stopped"})
    assert payload["status"] == "stopped"
    assert "trials.csv" not in payload["data_files"]


def test_persisted_run_detail_survives_memory_reset(api_client) -> None:
    client, _ = api_client
    created = client.post(
        "/api/runs",
        json={"design": _design("persist-smoke"), "headless": True},
    )
    run_id = created.get_json()["run_id"]
    finished = _wait_for_status(client, run_id, {"finished"})

    state_path = Path(routes.RUNS_DIR) / run_id / "state.json"
    events_path = Path(routes.RUNS_DIR) / run_id / "events.jsonl"
    state_before = state_path.read_bytes()
    events_before = events_path.read_bytes()
    with routes._RUNS_LOCK:
        routes._RUNS.clear()

    restored = client.get(f"/api/runs/{run_id}")
    assert restored.status_code == 200
    assert restored.get_json()["status"] == finished["status"]
    assert state_path.read_bytes() == state_before
    assert events_path.read_bytes() == events_before
