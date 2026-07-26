"""Autopilot ×3 smoke runner interface."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Protocol, Union


class RunClient(Protocol):
    def start_run(self, **kwargs: Any) -> Dict[str, Any]: ...

    def wait_finished(self, run_id: str, timeout: float = 600) -> Dict[str, Any]: ...


def smoke_project(
    client: RunClient,
    project: Union[str, Path],
    *,
    runs: int = 3,
    participant_id: str = "P_autopilot",
    experimenter: str = "PsyClaw AI",
    headless: bool = True,
) -> Dict[str, Any]:
    project = Path(project)
    marker = project / f"{project.name}.psyclaw"
    results = []
    for i in range(1, runs + 1):
        session = str(i)
        started = client.start_run(
            project_path=str(project),
            marker=str(marker),
            participant_id=participant_id,
            session=session,
            mode="autopilot",
            headless=headless,
            experimenter=experimenter,
        )
        run_id = started.get("run_id") or started.get("id") or f"run{i}"
        finished = client.wait_finished(run_id)
        status = finished.get("status") or "failed"
        results.append(
            {
                "session": session,
                "run_id": run_id,
                "status": status,
                "participant_id": participant_id,
            }
        )
    ok = len(results) == runs and all(r["status"] == "finished" for r in results)
    sessions = [r["session"] for r in results]
    ok = ok and sessions == [str(i) for i in range(1, runs + 1)]
    return {"ok": ok, "runs": results, "project": str(project)}
