"""Process management for psyclaw-webui runs.

``PsychoPyProcess`` in the sibling module runs generated experiments.
This module supplies the shared process interface plus ``MockProcess`` for
offline/autopilot simulation with the same run/data contract.

Public API
----------
- ``BaseProcess`` — interface (duck-typed; we don't force inheritance)
- ``MockProcess`` — sleeps for N seconds, then writes a fake Stroop-style
  trials.csv. Honors stop requests via ``stop_event``.

Usage
-----
    p = MockProcess(
        run_id="abc123",
        run_dir="runs/abc123",
        spec={"participant_id": "P01", "n_trials": 10},
        duration_s=2.0,
        stop_event=threading.Event(),
    )
    p.start()
    p.join()        # blocks until done or stopped
    print(p.returncode)
"""
from __future__ import annotations

import csv
import os
import random
import shutil
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional


class BaseProcess:
    """Interface that real + mock runners implement.

    The mock matches the real runner lifecycle so the state machine and
    routes don't need separate status or artifact handling.
    """

    def __init__(self, run_id: str, run_dir: str, spec: Dict[str, Any]) -> None:
        self.run_id = run_id
        self.run_dir = run_dir
        self.spec = dict(spec)
        self.returncode: Optional[int] = None
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        raise NotImplementedError

    def join(self, timeout: Optional[float] = None) -> None:
        if self._thread:
            self._thread.join(timeout=timeout)

    def stop(self) -> None:
        self._stop_event.set()

    def is_alive(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def stop_event(self) -> threading.Event:
        return self._stop_event


# Canonical Stroop stimuli — hard-coded for the mock so we don't have to
# import from stroop.py (which we're deleting in favor of YAML).
_STROOP_WORDS = ["RED", "GREEN", "BLUE", "YELLOW"]
_STROOP_COLORS = ["red", "green", "blue", "yellow"]
_STROOP_KEYS = {"r": "red", "g": "green", "b": "blue", "y": "yellow"}


def _stroop_row(idx: int) -> Dict[str, Any]:
    word = random.choice(_STROOP_WORDS)
    color = random.choice(_STROOP_COLORS)
    if random.random() < 0.8:
        response = color[0]
        correct = 1
    else:
        response = random.choice([k for k in _STROOP_KEYS if _STROOP_KEYS[k] != color])
        correct = 0
    rt = round(random.uniform(0.35, 1.20), 3)
    return {
        "participant_id": "P01",
        "trial": idx,
        "condition": "congruent" if word.lower() == color else "incongruent",
        "word": word,
        "ink_color": color,
        "response": response,
        "rt": rt,
        "correct": correct,
    }


class MockProcess(BaseProcess):
    """Fake process: sleeps for ``duration_s`` (interrupted by stop), then
    writes a fake trials.csv to ``runs/<id>/data/trials.csv``.
    """

    def __init__(
        self,
        run_id: str,
        run_dir: str,
        spec: Dict[str, Any],
        duration_s: float = 2.0,
        n_trials: Optional[int] = None,
    ) -> None:
        super().__init__(run_id, run_dir, spec)
        self.duration_s = float(duration_s)
        # If the spec hands us a participant_id or n_trials, respect it.
        self.participant_id = str(spec.get("participant_id", "P01"))
        self.n_trials = int(n_trials if n_trials is not None else spec.get("n_trials", 10))
        self._log_path = os.path.join(run_dir, "log.txt")

    def start(self) -> None:
        os.makedirs(os.path.join(self.run_dir, "data"), exist_ok=True)
        self._thread = threading.Thread(target=self._run, name=f"MockProcess-{self.run_id}", daemon=True)
        self._thread.start()

    def _write_log(self, line: str) -> None:
        with open(self._log_path, "a", encoding="utf-8") as fh:
            fh.write(line.rstrip("\n") + "\n")

    def _write_csv(self, n_rows: int) -> None:
        data_dir = os.path.join(self.run_dir, "data")
        os.makedirs(data_dir, exist_ok=True)
        path = os.path.join(data_dir, "trials.csv")
        with open(path, "w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(
                fh,
                fieldnames=[
                    "participant_id",
                    "trial",
                    "condition",
                    "word",
                    "ink_color",
                    "response",
                    "rt",
                    "correct",
                ],
            )
            writer.writeheader()
            for i in range(1, n_rows + 1):
                row = _stroop_row(i)
                row["participant_id"] = self.participant_id
                writer.writerow(row)
        self._write_log(f"[mock] wrote {n_rows} trial rows -> {path}")
        project_path = str(self.spec.get("project_path") or "").strip()
        if not project_path and isinstance(self.spec.get("session"), dict):
            project_path = str(self.spec["session"].get("project_path") or "").strip()
        if project_path:
            destination_dir = Path(project_path) / "data"
            destination_dir.mkdir(parents=True, exist_ok=True)
            destination = destination_dir / Path(path).name
            shutil.copy2(path, destination)
            self._write_log(f"[mock] mirrored {Path(path).name} -> {destination}")

    def _run(self) -> None:
        self._write_log(f"[mock] start pid=mock duration={self.duration_s}s trials={self.n_trials}")
        # Sleep in small chunks so we honor stop quickly.
        deadline = time.time() + self.duration_s
        chunk = 0.1
        while time.time() < deadline:
            if self._stop_event.is_set():
                self._write_log("[mock] stop requested; exiting early")
                self.returncode = 130  # standard "interrupted"
                return
            time.sleep(min(chunk, deadline - time.time()))

        if self._stop_event.is_set():
            self._write_log("[mock] stop requested; exiting early")
            self.returncode = 130
            return

        # Generate the fake trial data.
        n = max(1, min(self.n_trials, 50))  # cap at 50 rows for the mock
        self._write_csv(n)
        self.returncode = 0
        self._write_log("[mock] done")

    # Convenience for tests: blocking run that returns when finished/stopped.
    def run_and_wait(self) -> int:
        self.start()
        self.join()
        return self.returncode if self.returncode is not None else -1
