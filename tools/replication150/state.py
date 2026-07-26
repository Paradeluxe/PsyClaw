"""Crash-safe append-only result store."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Union


class ResultStore:
    def __init__(self, root: Union[str, Path]):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.jsonl = self.root / "item-results.jsonl"
        self.state_path = self.root / "state.json"
        self.lock_path = self.root / ".writer.lock"

    def _acquire(self) -> None:
        # best-effort single-writer lock file
        if self.lock_path.exists():
            # stale lock allowed for tests/local single process
            pass
        self.lock_path.write_text(str(os.getpid()), encoding="utf-8")

    def _release(self) -> None:
        try:
            self.lock_path.unlink(missing_ok=True)
        except TypeError:
            if self.lock_path.exists():
                self.lock_path.unlink()

    def append(self, record: Dict[str, Any]) -> None:
        self._acquire()
        try:
            line = json.dumps(record, ensure_ascii=False)
            with self.jsonl.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
                f.flush()
                os.fsync(f.fileno())
            # rewrite latest state atomically
            latest = self.latest()
            pid = record.get("paper_id")
            if pid:
                latest[pid] = record
            tmp = self.state_path.with_suffix(".json.tmp")
            with tmp.open("w", encoding="utf-8") as f:
                json.dump(latest, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.state_path)
        finally:
            self._release()

    def read_all(self) -> List[Dict[str, Any]]:
        if not self.jsonl.is_file():
            return []
        out: List[Dict[str, Any]] = []
        for line in self.jsonl.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
        return out

    def latest(self) -> Dict[str, Dict[str, Any]]:
        if self.state_path.is_file():
            try:
                data = json.loads(self.state_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
        latest: Dict[str, Dict[str, Any]] = {}
        for row in self.read_all():
            pid = row.get("paper_id")
            if pid:
                latest[pid] = row
        return latest
