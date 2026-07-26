# -*- coding: utf-8 -*-
"""Project-local participant session registry (no duplicate id+session).

File: <projectDir>/participants.json

end_status:
  normal     — clean finished (exit 0)
  manual     — user Stop / interrupted
  unexpected — crash / non-zero exit / lifecycle fail

MAX_ENTRIES caps roster size (newest kept).
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

REGISTRY_NAME = "participants.json"
MAX_ENTRIES = 10
# Canonical end_status values
END_NORMAL = "normal"
END_MANUAL = "manual"
END_UNEXPECTED = "unexpected"
_VALID_END = frozenset({END_NORMAL, END_MANUAL, END_UNEXPECTED})
_ID_NUM = re.compile(r"^(.*?)(\d+)$")
# Test modes that never consume production ID sequence / never block roster
_NON_PRODUCTION_MODES = frozenset({"pilot", "autopilot"})


def _is_test_mode(mode: Any) -> bool:
    return str(mode or "").strip().lower() in _NON_PRODUCTION_MODES


def _is_test_id(pid: str) -> bool:
    p = (pid or "").strip()
    return (
        p == "P_pilot"
        or p.startswith("P_pilot")
        or p == "P_autopilot"
        or p.startswith("P_autopilot")
    )


def _normalize_end_status(end_status: Any) -> str:
    s = str(end_status or END_NORMAL).strip().lower()
    # accept run-state aliases
    if s in ("finished", "completed", "ok", "success", "done"):
        return END_NORMAL
    if s in ("stopped", "stop", "user_stop", "interrupted", "abort", "aborted",
             "escape", "esc", "user_abort"):
        return END_MANUAL
    if s in ("failed", "fail", "error", "crash", "crashed"):
        return END_UNEXPECTED
    if s in _VALID_END:
        return s
    return END_NORMAL


def _registry_path(project_dir: Path) -> Path:
    return Path(project_dir) / REGISTRY_NAME


def load_registry(project_dir: Optional[str]) -> Dict[str, Any]:
    if not project_dir:
        return {"entries": []}
    p = _registry_path(Path(project_dir))
    if not p.is_file():
        return {"entries": []}
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"entries": []}
    if not isinstance(data, dict):
        return {"entries": []}
    ents = data.get("entries")
    if not isinstance(ents, list):
        data["entries"] = []
    return data


def save_registry(project_dir: str, data: Dict[str, Any]) -> None:
    folder = Path(project_dir)
    folder.mkdir(parents=True, exist_ok=True)
    p = _registry_path(folder)
    tmp = p.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, p)


AI_EXPERIMENTER = "PsyClaw AI"


def list_entries(project_dir: Optional[str]) -> List[Dict[str, Any]]:
    reg = load_registry(project_dir)
    out = []
    dirty = False
    for e in reg.get("entries") or []:
        if isinstance(e, dict) and e.get("participant_id"):
            e = dict(e)
            # backfill missing end_status for legacy rows
            if not e.get("end_status"):
                e["end_status"] = END_NORMAL
            else:
                e["end_status"] = _normalize_end_status(e.get("end_status"))
            # legacy autopilot rows: blank experimenter → PsyClaw AI
            pid = str(e.get("participant_id") or "").strip()
            mode = str(e.get("mode") or "").strip().lower()
            is_ap = (
                mode == "autopilot"
                or pid == "P_autopilot"
                or pid.startswith("P_autopilot")
            )
            exp_now = str(e.get("experimenter") or "").strip()
            _ai_aliases = {
                "",
                "AI assistant",
                "AI助手",
                "AI 助手",
                "PsyClaw-AI",
                "PsyClaw AI",
                "Psyclaw AI",
                "PsyClaw AI",
            }
            if is_ap and exp_now in _ai_aliases:
                if exp_now != AI_EXPERIMENTER:
                    e["experimenter"] = AI_EXPERIMENTER
                    dirty = True
            out.append(e)
    # persist one-shot so roster disk matches UI
    if dirty and project_dir:
        try:
            reg = dict(reg)
            reg["entries"] = out
            save_registry(str(project_dir), reg)
        except Exception:
            pass
    return out


def is_duplicate(project_dir: Optional[str], participant_id: str, session: str) -> bool:
    """True only if a production row already completed normally for this id+session.

    Manual stop / unexpected end do **not** block — Start replaces that row.
    """
    pid = (participant_id or "").strip()
    sess = (session or "1").strip() or "1"
    if not pid:
        return False
    for e in list_entries(project_dir):
        if str(e.get("participant_id") or "").strip() == pid and str(
            e.get("session") or "1"
        ).strip() == sess:
            # pilots / autopilot don't block production IDs
            if _is_test_mode(e.get("mode")):
                continue
            # incomplete rows are overwritable
            if _normalize_end_status(e.get("end_status")) != END_NORMAL:
                continue
            return True
    return False


def _trim_entries(entries: List[Dict[str, Any]], limit: int = MAX_ENTRIES) -> List[Dict[str, Any]]:
    """Keep at most ``limit`` newest rows (by ``at`` then list order)."""
    if limit <= 0 or len(entries) <= limit:
        return entries
    # sort oldest → newest; drop from front
    indexed = list(enumerate(entries))

    def _key(item: tuple) -> tuple:
        i, e = item
        at = str((e or {}).get("at") or (e or {}).get("date") or "")
        return (at, i)

    indexed.sort(key=_key)
    keep_set = {idx for idx, _ in indexed[-limit:]}
    # preserve relative order of kept items as originally stored (newest-append style)
    return [e for i, e in enumerate(entries) if i in keep_set]


def register_run(
    project_dir: Optional[str],
    *,
    participant_id: str,
    session: str,
    run_id: str,
    mode: str = "participant",
    date: str = "",
    participant_name: str = "",
    experimenter: str = "",
    end_status: str = END_NORMAL,
) -> Optional[Dict[str, Any]]:
    if not project_dir:
        return None
    pid = (participant_id or "").strip()
    if not pid:
        return None
    sess = (session or "1").strip() or "1"
    reg = load_registry(project_dir)
    entries: List[Dict[str, Any]] = list(reg.get("entries") or [])
    entry = {
        "participant_id": pid,
        "session": sess,
        "run_id": run_id,
        "mode": mode or "participant",
        "date": date or "",
        "participant_name": (participant_name or "").strip(),
        "experimenter": (experimenter or "").strip(),
        "end_status": _normalize_end_status(end_status),
        "at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    # replace same id+session+mode if re-run, else append
    replaced = False
    for i, e in enumerate(entries):
        if (
            str(e.get("participant_id")) == pid
            and str(e.get("session") or "1") == sess
            and str(e.get("mode") or "participant") == entry["mode"]
        ):
            entries[i] = entry
            replaced = True
            break
    if not replaced:
        entries.append(entry)
    entries = _trim_entries(entries, MAX_ENTRIES)
    reg["entries"] = entries
    reg["updatedAt"] = entry["at"]
    reg["max_entries"] = MAX_ENTRIES
    save_registry(project_dir, reg)
    return entry


def suggest_next_id(project_dir: Optional[str], prefix: str = "P") -> str:
    """Suggest next free numeric id: P01, P02, ... skipping used (any session).

    Pilot/autopilot entries (mode or P_pilot / P_autopilot ids) never consume the sequence.
    """
    used = set()
    for e in list_entries(project_dir):
        if _is_test_mode(e.get("mode")):
            continue
        pid = str(e.get("participant_id") or "").strip()
        if not pid or _is_test_id(pid):
            continue
        used.add(pid)
    # also accept bare prefix+digits
    prefix = prefix or "P"
    max_n = 0
    width = 2
    for pid in used:
        m = _ID_NUM.match(pid)
        if not m:
            continue
        pre, num = m.group(1), m.group(2)
        if pre != prefix:
            continue
        try:
            n = int(num)
        except ValueError:
            continue
        max_n = max(max_n, n)
        width = max(width, len(num))
    nxt = max_n + 1
    return f"{prefix}{nxt:0{width}d}"


def used_sessions_for(project_dir: Optional[str], participant_id: str) -> List[str]:
    pid = (participant_id or "").strip()
    out = []
    for e in list_entries(project_dir):
        if str(e.get("participant_id") or "").strip() != pid:
            continue
        if _is_test_mode(e.get("mode")):
            continue
        out.append(str(e.get("session") or "1"))
    return sorted(set(out), key=lambda s: (len(s), s))


def suggest_next_session(project_dir: Optional[str], participant_id: str) -> str:
    used = used_sessions_for(project_dir, participant_id)
    nums = []
    for s in used:
        try:
            nums.append(int(s))
        except ValueError:
            pass
    if not nums:
        return "1"
    return str(max(nums) + 1)


def delete_entry(
    project_dir: Optional[str],
    *,
    participant_id: str,
    session: str = "1",
    confirm: str = "",
    mode: str = "participant",
) -> Dict[str, Any]:
    """Remove one registry row. GitHub-style: confirm must equal participant_id exactly.

    Does **not** delete CSV/run files on disk — only participants.json bookkeeping.
    """
    if not project_dir:
        return {"ok": False, "error": "missing_path", "code": "missing_path"}
    pid = (participant_id or "").strip()
    sess = (session or "1").strip() or "1"
    conf = (confirm or "").strip()
    md = (mode or "participant").strip() or "participant"
    if not pid:
        return {"ok": False, "error": "missing_participant_id", "code": "missing_participant_id"}
    # exact match — no case-fold (IDs are typed as stored)
    if conf != pid:
        return {
            "ok": False,
            "error": "confirm_mismatch",
            "code": "confirm_mismatch",
            "expected": pid,
        }
    reg = load_registry(project_dir)
    entries: List[Dict[str, Any]] = list(reg.get("entries") or [])
    kept: List[Dict[str, Any]] = []
    removed: Optional[Dict[str, Any]] = None
    for e in entries:
        if not isinstance(e, dict):
            continue
        if (
            str(e.get("participant_id") or "").strip() == pid
            and str(e.get("session") or "1").strip() == sess
            and str(e.get("mode") or "participant") == md
        ):
            removed = e
            continue
        kept.append(e)
    if removed is None:
        return {
            "ok": False,
            "error": "not_found",
            "code": "not_found",
            "participant_id": pid,
            "session": sess,
        }
    reg["entries"] = kept
    reg["updatedAt"] = time.strftime("%Y-%m-%d %H:%M:%S")
    reg["max_entries"] = MAX_ENTRIES
    save_registry(project_dir, reg)
    return {
        "ok": True,
        "removed": removed,
        "suggest_id": suggest_next_id(project_dir),
        "count": len([e for e in kept if not _is_test_mode(e.get("mode"))]),
        "max_entries": MAX_ENTRIES,
    }
