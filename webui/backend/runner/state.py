"""Per-run state machine for psyclaw-webui.

States (per CONTRACT.md):
    created -> compiling -> compiled -> running -> (finished | failed | stopped)
                                          \\-> failed
                (any non-terminal state may also transition to ``failed``)

Persistence
-----------
- ``runs/<run_id>/state.json`` — current state + meta (paradigm, spec, started_at)
- ``runs/<run_id>/events.jsonl`` — append-only log of every transition
- ``runs/<run_id>/log.txt`` — free-form log (process stdout)

Concurrency
-----------
Each StateMachine owns a ``threading.Lock`` so the background mock-worker
thread and an HTTP handler that calls ``request_stop()`` (or
``transition_to('stopped')``) can't race. Transitions are validated against
``ALLOWED_TRANSITIONS``; illegal transitions raise ``InvalidTransition``.
"""
from __future__ import annotations

import json
import os
import threading
import time
from enum import Enum
from typing import Any, Dict, List, Optional


class RunState(str, Enum):
    """Run lifecycle states. ``str`` mixin so JSON-serialising is trivial."""

    CREATED = "created"
    COMPILING = "compiling"
    COMPILED = "compiled"
    RUNNING = "running"
    FINISHED = "finished"
    FAILED = "failed"
    STOPPED = "stopped"

    @classmethod
    def values(cls) -> List[str]:
        return [s.value for s in cls]


# State machine: source state -> set of permitted destination states.
# ``failed`` is reachable from anywhere non-terminal (compiler crash,
# runtime exception, post-mortem by the user).
ALLOWED_TRANSITIONS: Dict[str, set] = {
    RunState.CREATED.value: {RunState.COMPILING.value, RunState.FAILED.value, RunState.STOPPED.value},
    RunState.COMPILING.value: {RunState.COMPILED.value, RunState.FAILED.value, RunState.STOPPED.value},
    RunState.COMPILED.value: {RunState.RUNNING.value, RunState.FAILED.value, RunState.STOPPED.value},
    RunState.RUNNING.value: {RunState.FINISHED.value, RunState.FAILED.value, RunState.STOPPED.value},
    # Terminal states — no transitions out.
    RunState.FINISHED.value: set(),
    RunState.FAILED.value: set(),
    RunState.STOPPED.value: set(),
}


TERMINAL_STATES = {RunState.FINISHED.value, RunState.FAILED.value, RunState.STOPPED.value}


class InvalidTransition(Exception):
    """Raised when a state transition violates the state machine."""


def is_terminal(state: str) -> bool:
    return state in TERMINAL_STATES


class StateMachine:
    """Per-run state machine.

    Owns its on-disk state (state.json + events.jsonl) and provides
    thread-safe transition + log helpers.
    """

    def __init__(self, run_id: str, run_dir: str, paradigm_id: str = "", spec: Optional[Dict[str, Any]] = None) -> None:
        self.run_id = run_id
        self.run_dir = run_dir
        self.paradigm_id = paradigm_id
        self.spec: Dict[str, Any] = dict(spec or {})
        self.started_at: float = time.time()
        self._state: str = RunState.CREATED.value
        self._lock = threading.Lock()
        os.makedirs(run_dir, exist_ok=True)
        os.makedirs(os.path.join(run_dir, "data"), exist_ok=True)
        # Persist initial state + log the first event.
        self._write_state_file()
        self._append_event("created", note="run created")

    @classmethod
    def from_disk(cls, run_dir: str) -> "StateMachine":
        """Load a persisted run without changing its state or event files."""
        state_path = os.path.join(run_dir, "state.json")
        with open(state_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        state = str(data.get("status") or RunState.CREATED.value)
        if state not in RunState.values():
            raise ValueError(f"unknown persisted state: {state!r}")

        sm = cls.__new__(cls)
        sm.run_id = str(data.get("run_id") or os.path.basename(run_dir))
        sm.run_dir = run_dir
        sm.paradigm_id = str(data.get("paradigm_id") or "")
        spec = data.get("spec")
        sm.spec = dict(spec) if isinstance(spec, dict) else {}
        sm.started_at = float(data.get("started_at") or time.time())
        sm._state = state
        sm._lock = threading.Lock()
        sm.headless = data.get("headless")
        sm.design = data.get("design") if isinstance(data.get("design"), dict) else None
        sm.runner = str(data.get("runner") or "unknown")
        sm.engine = data.get("engine") if isinstance(data.get("engine"), dict) else {}
        return sm

    # --- accessors --------------------------------------------------------

    @property
    def state(self) -> str:
        return self._state

    def is_terminal(self) -> bool:
        return is_terminal(self._state)

    # --- transitions ------------------------------------------------------

    def transition_to(self, new_state: str, note: str = "") -> None:
        """Transition to ``new_state`` (validates the edge + persists)."""
        with self._lock:
            if new_state not in RunState.values():
                raise InvalidTransition(f"unknown state: {new_state!r}")
            allowed = ALLOWED_TRANSITIONS[self._state]
            if new_state not in allowed:
                raise InvalidTransition(
                    f"cannot transition {self._state!r} -> {new_state!r}; "
                    f"allowed from {self._state!r}: {sorted(allowed) or '(terminal)'}"
                )
            old = self._state
            self._state = new_state
            self._write_state_file()
            self._append_event(new_state, note=note, from_state=old)

    def fail(self, reason: str = "") -> None:
        """Convenience: transition to FAILED (idempotent — no-op if already terminal)."""
        with self._lock:
            if self.is_terminal():
                return
            old = self._state
            self._state = RunState.FAILED.value
            self._write_state_file()
            self._append_event(RunState.FAILED.value, note=reason or "failed", from_state=old)

    def request_stop(self, note: str = "") -> None:
        """Transition to STOPPED from any non-terminal state."""
        with self._lock:
            if self.is_terminal():
                return
            old = self._state
            self._state = RunState.STOPPED.value
            self._write_state_file()
            self._append_event(RunState.STOPPED.value, note=note or "stopped by user", from_state=old)

    # --- snapshot ---------------------------------------------------------

    def snapshot(self) -> Dict[str, Any]:
        """Return a serializable snapshot of current state."""
        with self._lock:
            return {
                "run_id": self.run_id,
                "paradigm_id": self.paradigm_id,
                "status": self._state,
                "started_at": self.started_at,
                "elapsed_s": round(time.time() - self.started_at, 3),
            }

    def load_events(self) -> List[Dict[str, Any]]:
        """Read every event in events.jsonl. Cheap; we expect hundreds at most."""
        path = os.path.join(self.run_dir, "events.jsonl")
        if not os.path.isfile(path):
            return []
        out: List[Dict[str, Any]] = []
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return out

    def log_tail(self, n: int = 50) -> str:
        """Return the last ``n`` events as a human-readable text tail."""
        events = self.load_events()
        tail = events[-n:]
        lines = []
        for ev in tail:
            ts = ev.get("ts", 0)
            t_human = time.strftime("%H:%M:%S", time.localtime(ts))
            ms = int((ts - int(ts)) * 1000)
            state = ev.get("state", "")
            note = ev.get("note", "")
            lines.append(f"{t_human}.{ms:03d}  [{state:>9}]  {note}")
        return "\n".join(lines)

    def list_data_files(self) -> List[str]:
        """List files in runs/<id>/data/."""
        data_dir = os.path.join(self.run_dir, "data")
        if not os.path.isdir(data_dir):
            return []
        return sorted(f for f in os.listdir(data_dir) if not f.startswith("."))

    # --- persistence ------------------------------------------------------

    def _write_state_file(self) -> None:
        path = os.path.join(self.run_dir, "state.json")
        payload = {
            "run_id": self.run_id,
            "paradigm_id": self.paradigm_id,
            "status": self._state,
            "started_at": self.started_at,
            "spec": self.spec,
            "headless": getattr(self, "headless", None),
            "design": getattr(self, "design", None),
            "runner": getattr(self, "runner", "unknown"),
            "engine": getattr(self, "engine", {}),
        }
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, default=str)
        os.replace(tmp, path)

    def _append_event(self, state: str, note: str = "", from_state: str = "") -> None:
        path = os.path.join(self.run_dir, "events.jsonl")
        ev = {
            "ts": time.time(),
            "state": state,
            "from": from_state,
            "note": note,
        }
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(ev) + "\n")
