"""Flask routes implementing the CONTRACT.md API surface.

Endpoints (all under /api):

  GET  /health                          -> {status, app}
  GET  /paradigms                       -> {paradigms: [{id, label}]}
  GET  /paradigm/<id>/form              -> {html, schema}    (schema = raw yaml)
  POST /paradigm/<id>/submit            -> {spec, errors}    (echo + validation)
  GET  /runs                            -> {runs: [{id, paradigm, status, started_at}]}
  POST /runs                             body={paradigm_id, spec} -> {run_id}
  GET  /runs/<id>                        -> {status, progress, log_tail, data_files}
  POST /runs/<id>/stop                   -> {ok, status}
  GET  /runs/<id>/data/<file>            -> file download (attachment)
  GET  /runs/<id>/data-pack.zip           -> zip of runs/<id>/data/*

Implementation notes
--------------------
- Runs use ``PsychoPyProcess`` when PsychoPy is available and ``MockProcess``
  for explicit/offline simulation; both share the same route contract.
- Each run has its own on-disk directory ``runs/<id>/`` containing
  ``state.json``, ``events.jsonl``, ``log.txt`` and ``data/`` (see runner/state.py).
- We also keep an in-memory map of run_id -> StateMachine for the lifetime
  of the process, so HTTP handlers don't have to re-load from disk on
  every request.
"""
from __future__ import annotations

import json
import re
import os
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

import io
import mimetypes
import zipfile

from flask import Response, jsonify, request, send_file, send_from_directory

from . import api_bp
from paradigms import (
    EXAMPLES_DIR,
    discover_all,
    list_paradigms,
    load_paradigm,
    validate_paradigm,
)
from runner import MockProcess, PsychoPyProcess, StateMachine
import participants_registry as _preg


# Repo root: backend/api/routes.py -> backend/api/ -> backend/ -> <repo root>
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.normpath(os.path.join(_THIS_DIR, "..", ".."))
RUNS_DIR = os.environ.get("PSYCLAW_RUNS_DIR") or os.path.join(_REPO_ROOT, "runs")
os.makedirs(RUNS_DIR, exist_ok=True)

# In-memory: run_id -> StateMachine. Persisted data lives in RUNS_DIR/<id>/.
_RUNS: Dict[str, StateMachine] = {}
_RUNS_LOCK = threading.Lock()

# Re-scan paradigms on first request (cheap; one fs scan per process).
_PARADIGMS_READY = False
_PARADIGMS_LOCK = threading.Lock()


def _ensure_paradigms_loaded() -> None:
    global _PARADIGMS_READY
    if _PARADIGMS_READY:
        return
    with _PARADIGMS_LOCK:
        if _PARADIGMS_READY:
            return
        discover_all()
        _PARADIGMS_READY = True


# --- helper: run lifecycle ---------------------------------------------------


def _make_run_dir(run_id: str) -> str:
    path = os.path.join(RUNS_DIR, run_id)
    os.makedirs(os.path.join(path, "data"), exist_ok=True)
    return path


def _load_runs_from_disk() -> List[Dict[str, Any]]:
    """Re-hydrate run metadata from RUNS_DIR on startup so /api/runs is
    complete across server restarts. In-memory state machines (which
    hold the StateMachine object) are NOT restored — for those we just
    expose their on-disk state.json.
    """
    out: List[Dict[str, Any]] = []
    if not os.path.isdir(RUNS_DIR):
        return out
    for entry in sorted(os.listdir(RUNS_DIR)):
        run_dir = os.path.join(RUNS_DIR, entry)
        state_path = os.path.join(run_dir, "state.json")
        if not os.path.isfile(state_path):
            continue
        try:
            with open(state_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError):
            continue
        out.append(
            {
                "id": data.get("run_id", entry),
                "paradigm": data.get("paradigm_id", ""),
                "status": data.get("status", "unknown"),
                "started_at": data.get("started_at", 0.0),
            }
        )
    return out


# --- background worker ------------------------------------------------------


def _read_instrument(run_dir: str) -> Optional[Dict[str, Any]]:
    path = os.path.join(run_dir, "data", "instrument.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _read_end_status(run_dir: str) -> str:
    """Resolve end_status from experiment artifacts (ESC writes end_reason.json).

    Returns canonical: normal | manual | unexpected (default normal).
    """
    # Prefer explicit end_reason.json written by generated experiment.py
    for name in ("end_reason.json", "instrument.json"):
        path = os.path.join(run_dir, "data", name)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        raw = data.get("end_status") or data.get("reason") or ""
        s = str(raw).strip().lower()
        if s in ("manual", "stopped", "stop", "user_stop", "interrupted",
                 "abort", "aborted", "escape", "esc", "user_abort"):
            return "manual"
        if s in ("unexpected", "failed", "fail", "error", "crash", "crashed"):
            return "unexpected"
        if s in ("normal", "finished", "completed", "ok", "success", "done"):
            return "normal"
    return "normal"


def _run_lifecycle(sm: StateMachine, spec: Dict[str, Any]) -> None:
    """Background thread: created -> compiling -> compiled -> running -> finished.

    Prefer real PsychoPyProcess when a PsychoPy Python is resolved on disk;
    fall back to MockProcess so the UI still works offline.

    ``sm.headless`` (default True): auto-keys, no blocking wait.
    headless=False: real PsychoPy window for a participant on this machine.
    """
    headless = bool(getattr(sm, "headless", True))
    try:
        time.sleep(0.2)
        sm.transition_to("compiling", note="compiling spec into Python script")

        try:
            from psychopy_env import psychopy_available
        except ImportError:
            from backend.psychopy_env import psychopy_available  # type: ignore
        use_real = psychopy_available()
        force_mock = os.environ.get("PSYCLAW_FORCE_MOCK", "0") == "1"

        if use_real and not force_mock:
            time.sleep(0.1)
            sm.transition_to("compiled", note="script will be compiled by PsychoPyProcess")
            time.sleep(0.1)
            mode = "headless" if headless else "participant window"
            sm.transition_to("running", note=f"launching PsychoPy ({mode})")
            # Live keyboard: force en-US IME system-side so PsychoPy window starts English
            ime_token = None
            force_ime = True
            if isinstance(spec, dict):
                sess0 = spec.get("session") if isinstance(spec.get("session"), dict) else {}
                raw_ime = sess0.get("force_en_ime", spec.get("force_en_ime", True))
                force_ime = str(raw_ime).strip().lower() not in ("0", "false", "no", "off", "")
            if (not headless) and force_ime:
                try:
                    try:
                        from ime_guard import force_english as _ime_force
                    except ImportError:
                        from backend.ime_guard import force_english as _ime_force  # type: ignore
                    ime_token = _ime_force(also_default=True)
                except Exception:
                    ime_token = None
            try:
                process = PsychoPyProcess(
                    run_id=sm.run_id,
                    run_dir=sm.run_dir,
                    spec=spec,
                    paradigm_id=sm.paradigm_id,
                    headless=headless,
                    design=getattr(sm, "design", None),
                )
                process.start()
                # Participant mode can run a long time; still cap at 2h.
                deadline = time.time() + (7200 if not headless else 600)
                while process.is_alive() and time.time() < deadline:
                    if sm.state == "stopped":
                        process.stop()
                        break
                    time.sleep(0.2)
                process.join(timeout=15.0)
            finally:
                if ime_token is not None:
                    try:
                        try:
                            from ime_guard import restore as _ime_restore
                        except ImportError:
                            from backend.ime_guard import restore as _ime_restore  # type: ignore
                        _ime_restore(ime_token)
                    except Exception:
                        pass
            if sm.state == "stopped":
                _register_participant_if_any(sm, spec, end_status="manual")
                return
            end_st = _read_end_status(sm.run_dir)
            if process.returncode == 0 and end_st == "manual":
                # ESC wrote CSV then exit 0 fallback — still manual abort
                if not sm.is_terminal():
                    sm.request_stop(note="user abort (escape)")
                _register_participant_if_any(sm, spec, end_status="manual")
            elif process.returncode == 0:
                n = int(spec.get("n_trials") or (spec.get("n_go", 0) + spec.get("n_nogo", 0)) or 0)
                sm.transition_to("finished", note=f"PsychoPy exit 0 ({n} trials requested, {mode})")
                _register_participant_if_any(sm, spec, end_status="normal")
            elif process.returncode == 130 or end_st == "manual":
                # ESC sys.exit(130) after writing data, or Stop → manual
                if not sm.is_terminal():
                    note = "user abort (escape)" if end_st == "manual" else "process interrupted"
                    sm.request_stop(note=note)
                _register_participant_if_any(sm, spec, end_status="manual")
            else:
                sm.fail(reason=f"PsychoPy exit code {process.returncode}")
                _register_participant_if_any(sm, spec, end_status="unexpected")
        else:
            time.sleep(0.5)
            sm.transition_to("compiled", note="script compiled (mock — no PsychoPy binary)")
            time.sleep(0.2)
            sm.transition_to("running", note="launching experiment (mock)")
            participant_id = str(spec.get("participant_id", "P01"))
            n_trials = int(spec.get("n_trials") or (spec.get("n_go", 0) + spec.get("n_nogo", 0)) or 10)
            mock_spec = dict(spec)
            mock_spec.update({"participant_id": participant_id, "n_trials": n_trials})
            process = MockProcess(
                run_id=sm.run_id,
                run_dir=sm.run_dir,
                spec=mock_spec,
                duration_s=2.0,
            )
            process.start()
            # honour Stop during mock too
            deadline = time.time() + 10.0
            while process.is_alive() and time.time() < deadline:
                if sm.state == "stopped":
                    process.stop()
                    break
                time.sleep(0.1)
            process.join(timeout=5.0)
            if sm.state == "stopped":
                _register_participant_if_any(sm, spec, end_status="manual")
                return
            if process.returncode == 0:
                sm.transition_to("finished", note=f"completed {n_trials} trials (mock)")
                try:
                    sess = (spec or {}).get("session") if isinstance((spec or {}).get("session"), dict) else {}
                    mode_m = str((spec or {}).get("mode") or "pilot")
                    inst = {
                        "headless": True,
                        "mode": mode_m,
                        "fps_hz": 60.0,
                        "ok": True,
                        "notes": ["mock process"],
                        "keyboard": {"used": True, "ok": True, "detail": "mock"},
                        "microphone": {"used": False, "ok": True, "detail": "not used"},
                        "sound": {"used": False, "ok": True, "detail": "not used"},
                        "n_rows": n_trials,
                        "display": {"size": [800, 600], "fullscreen": False},
                        "design_name": str((spec or {}).get("design_name") or ""),
                        "session": {
                            "participant_id": str(sess.get("participant_id") or (spec or {}).get("participant_id") or "P_pilot"),
                            "participant_name": str(sess.get("participant_name") or ""),
                            "session": str(sess.get("session") or "1"),
                            "date": str(sess.get("date") or ""),
                            "experimenter": str(sess.get("experimenter") or ""),
                            "notes": str(sess.get("notes") or ""),
                            "custom": sess.get("custom") if isinstance(sess.get("custom"), dict) else {},
                        },
                        "at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                    ip = os.path.join(sm.run_dir, "data", "instrument.json")
                    with open(ip, "w", encoding="utf-8") as fh:
                        json.dump(inst, fh, indent=2)
                except Exception:
                    pass
                _register_participant_if_any(sm, spec, end_status="normal")
            elif process.returncode in (130, -1):
                if not sm.is_terminal():
                    sm.request_stop(note="mock interrupted")
                _register_participant_if_any(sm, spec, end_status="manual")
            else:
                sm.fail(reason=f"process exited with code {process.returncode}")
                _register_participant_if_any(sm, spec, end_status="unexpected")
    except Exception as exc:  # noqa: BLE001
        try:
            sm.fail(reason=f"lifecycle crashed: {exc!r}")
        except Exception:
            pass
        try:
            _register_participant_if_any(sm, spec, end_status="unexpected")
        except Exception:
            pass



def _register_participant_if_any(
    sm: StateMachine,
    spec: Dict[str, Any],
    end_status: str = "normal",
) -> None:
    """Append project participants.json (finished / stopped / failed)."""
    try:
        project_path = (spec.get("project_path") or "").strip()
        if not project_path:
            return
        sess = spec.get("session") if isinstance(spec.get("session"), dict) else {}
        pid = str(
            (sess.get("participant_id") if sess else None)
            or spec.get("participant_id")
            or "P01"
        ).strip()
        session_n = str((sess.get("session") if sess else None) or "1").strip() or "1"
        mode = str(
            spec.get("mode")
            or ("pilot" if getattr(sm, "headless", True) else "participant")
        )
        date = str((sess.get("date") if sess else None) or "")
        pname = str((sess.get("participant_name") if sess else None) or "")
        experimenter = str((sess.get("experimenter") if sess else None) or "")
        _preg.register_run(
            project_path,
            participant_id=pid,
            session=session_n,
            run_id=sm.run_id,
            mode=mode,
            date=date,
            participant_name=pname,
            experimenter=experimenter,
            end_status=end_status,
        )
    except Exception as exc:  # noqa: BLE001
        try:
            with open(os.path.join(sm.run_dir, "log.txt"), "a", encoding="utf-8") as fh:
                fh.write("[participants] register failed: %r\n" % (exc,))
        except Exception:
            pass


# --- routes ------------------------------------------------------------------


@api_bp.route("/participants", methods=["GET"])
def participants_list() -> Response:
    """List used participant id+session for a project folder (absolute path)."""
    path = (request.args.get("path") or "").strip()
    if not path:
        return jsonify({"error": "path required", "code": "missing_path"}), 400
    entries = _preg.list_entries(path)
    used = [e for e in entries if not _preg._is_test_mode(e.get("mode"))]
    unique_ids = sorted(
        {str(e.get("participant_id") or "").strip() for e in used if e.get("participant_id")}
    )
    return jsonify({
            "path": path,
            "entries": entries,
            "used": used,
            "suggest_id": _preg.suggest_next_id(path),
            "count": len(used),
            "unique_count": len(unique_ids),
            "unique_ids": unique_ids,
            "max_entries": getattr(_preg, "MAX_ENTRIES", 10),
            "total_entries": len(entries),
        })


@api_bp.route("/participants/check", methods=["POST"])
def participants_check() -> Response:
    body = request.get_json(silent=True) or {}
    path = (body.get("path") or "").strip()
    pid = str(body.get("participant_id") or "").strip()
    sess = str(body.get("session") or "1").strip() or "1"
    if not path or not pid:
        return jsonify({"error": "path and participant_id required"}), 400
    dup = _preg.is_duplicate(path, pid, sess)
    return jsonify({
        "duplicate": dup,
        "participant_id": pid,
        "session": sess,
        "suggest_id": _preg.suggest_next_id(path),
        "suggest_session": _preg.suggest_next_session(path, pid),
        "used_sessions": _preg.used_sessions_for(path, pid),
    })


@api_bp.route("/participants/delete", methods=["POST"])
def participants_delete() -> Response:
    """Delete one roster row. Body: path, participant_id, session, confirm.

    confirm must equal participant_id exactly (GitHub-style type-to-confirm).
    Registry only — does not delete trial CSV files.
    """
    body = request.get_json(silent=True) or {}
    path = (body.get("path") or "").strip()
    pid = str(body.get("participant_id") or "").strip()
    sess = str(body.get("session") or "1").strip() or "1"
    confirm = str(body.get("confirm") or "").strip()
    mode = str(body.get("mode") or "participant").strip() or "participant"
    if not path:
        return jsonify({"error": "path required", "code": "missing_path"}), 400
    if not pid:
        return jsonify({"error": "participant_id required", "code": "missing_participant_id"}), 400
    result = _preg.delete_entry(
        path,
        participant_id=pid,
        session=sess,
        confirm=confirm,
        mode=mode,
    )
    if not result.get("ok"):
        code = result.get("code") or "delete_failed"
        status = 404 if code == "not_found" else 400
        return jsonify(result), status
    return jsonify(result)


@api_bp.route("/health", methods=["GET"])
def health() -> Response:
    return jsonify({"status": "ok", "app": "psyclaw-webui"})


@api_bp.route("/system", methods=["GET"])
def system_check() -> Response:
    """Hardware / host environment probe for the System tab.

    Query:
      path — optional experiment folder. Data disk free is measured on that
             volume only. Omit → disk check stays pending (no invented drive).
    """
    from system_probe import probe as _probe  # local import keeps boot light

    data_path = (request.args.get("path") or "").strip() or None
    try:
        report = _probe(RUNS_DIR, data_path=data_path)
        return jsonify(report)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "overall": "fail", "error": repr(exc), "checks": []}), 500


@api_bp.route("/system/disk", methods=["GET"])
def system_disk() -> Response:
    """Lightweight disk-only probe for the experiment folder volume.

    Query: path — experiment folder (required for a real free-space result).
    Used when Builder Open/Save sets a project path without re-running full System.
    """
    from system_probe import probe_disk as _probe_disk

    data_path = (request.args.get("path") or "").strip() or None
    try:
        return jsonify(_probe_disk(data_path))
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": repr(exc)}), 500


@api_bp.route("/conditions/parse", methods=["POST"])
def conditions_parse() -> Response:
    """Parse uploaded stimlist (csv/xlsx) → rows for loop.conditions.

    multipart form: file=<blob>
    JSON body alt: { filename, content_base64 } not required for UI file input.
    """
    from design_compiler import parse_conditions_bytes

    f = request.files.get("file")
    if f is None or not f.filename:
        return jsonify({"error": "missing file", "code": "no_file"}), 400
    try:
        data = f.read()
        result = parse_conditions_bytes(f.filename, data)
        return jsonify({"ok": True, **result})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": str(exc), "code": "parse_failed"}), 400


# --- Local design projects (folder + <folderName>.psyclaw marker) ------


@api_bp.route("/dialog/folder", methods=["POST"])
def dialog_folder() -> Response:
    """Native OS folder picker (local host only). Body: { title?, initialdir? }."""
    from dialog_pick import pick_folder

    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "Select folder").strip() or "Select folder"
    initial = (body.get("initialdir") or body.get("initial") or "").strip() or None
    try:
        result = pick_folder(title=title, initialdir=initial)
        return jsonify(result)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": repr(exc), "cancelled": True}), 500


@api_bp.route("/projects/reveal", methods=["POST"])
def projects_reveal() -> Response:
    """Open a local experiment folder in Explorer and try to bring it to the front.

    Body: { path }. Plain ``explorer`` from Flask lands behind the browser
    (Windows foreground lock) — see ``dialog_pick.reveal_folder``.
    """
    body = request.get_json(silent=True) or {}
    path = (body.get("path") or body.get("folder") or "").strip()
    if not path:
        return jsonify({"ok": False, "error": "path required", "code": "missing_path"}), 400
    try:
        from dialog_pick import reveal_folder

        result = reveal_folder(path)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": str(exc), "code": "reveal_failed"}), 500
    if not result.get("ok"):
        code = result.get("code") or "reveal_failed"
        status = 404 if code == "not_found" else 500
        return jsonify(result), status
    return jsonify(result)


@api_bp.route("/projects", methods=["GET"])
def projects_list() -> Response:
    """List project folders under designs root (only those with <folderName>.psyclaw)."""
    from designs_store import DESIGN_FILENAME_PATTERN, default_designs_root, list_projects

    root = default_designs_root()
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return jsonify({
        "ok": True,
        "root": str(root),
        "marker": DESIGN_FILENAME_PATTERN,
        "projects": list_projects(root),
    })


@api_bp.route("/projects/classify", methods=["POST"])
def projects_classify() -> Response:
    """Classify a folder: empty | project | foreign | missing."""
    from designs_store import classify_folder, default_designs_root, resolve_under_root

    body = request.get_json(silent=True) or {}
    raw = (body.get("path") or body.get("folder") or "").strip()
    if not raw:
        return jsonify({"ok": False, "error": "path required", "code": "no_path"}), 400
    try:
        folder = resolve_under_root(default_designs_root(), raw)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc), "code": "bad_path"}), 400
    info = classify_folder(folder)
    return jsonify({"ok": True, **info})


@api_bp.route("/projects/open", methods=["POST"])
def projects_open() -> Response:
    """Open a project folder. Only empty (init) or marked project — never foreign."""
    from designs_store import (
        classify_folder,
        default_designs_root,
        design_filename_for,
        init_project,
        migrate_design_filename,
        read_design,
        resolve_under_root,
    )

    body = request.get_json(silent=True) or {}
    raw = (body.get("path") or body.get("folder") or "").strip()
    if not raw:
        return jsonify({"ok": False, "error": "path required", "code": "no_path"}), 400
    try:
        folder = resolve_under_root(default_designs_root(), raw)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc), "code": "bad_path"}), 400

    info = classify_folder(folder)
    status = info.get("status")

    if status == "foreign":
        return jsonify({
            "ok": False,
            "code": "foreign_folder",
            "error": info.get("reason")
            or f"folder has other files without {design_filename_for(folder)}",
            "files": info.get("files") or [],
            "path": info.get("path"),
        }), 409

    if status == "not_dir":
        return jsonify({"ok": False, "code": "not_dir", "error": "not a directory"}), 400

    if status == "missing":
        # create + init if client asked
        if not body.get("create"):
            return jsonify({
                "ok": False,
                "code": "missing",
                "error": "folder does not exist (pass create:true to mkdir+init)",
                "path": str(folder),
            }), 404
        try:
            seed = body.get("design") if isinstance(body.get("design"), dict) else None
            meta = init_project(folder, seed)
            design, err = read_design(folder)
            if err or not design:
                return jsonify({"ok": False, "error": err or "read failed"}), 500
            return jsonify({"ok": True, "created": True, **meta, "design": design})
        except Exception as exc:  # noqa: BLE001
            return jsonify({"ok": False, "error": str(exc), "code": "init_failed"}), 400

    if status == "empty":
        # empty folder → init as project
        try:
            seed = body.get("design") if isinstance(body.get("design"), dict) else None
            meta = init_project(folder, seed)
            design, err = read_design(folder)
            if err or not design:
                return jsonify({"ok": False, "error": err or "read failed"}), 500
            return jsonify({"ok": True, "created": True, **meta, "design": design})
        except Exception as exc:  # noqa: BLE001
            return jsonify({"ok": False, "error": str(exc), "code": "init_failed"}), 400

    if status == "project":
        migrate_design_filename(folder)
        info = classify_folder(folder)
        design, err = read_design(folder)
        if err or not design:
            return jsonify({"ok": False, "error": err or "read failed", "code": "bad_design"}), 400
        return jsonify({
            "ok": True,
            "created": False,
            "path": info["path"],
            "design_path": info.get("design_path"),
            "name": design.get("name"),
            "design": design,
            "marker": info.get("marker") or design_filename_for(folder),
        })

    return jsonify({"ok": False, "error": f"unhandled status {status}", "code": "unknown"}), 400


@api_bp.route("/projects/save", methods=["POST"])
def projects_save() -> Response:
    """Save design into a project folder (must be empty-initable or existing project)."""
    from designs_store import classify_folder, default_designs_root, resolve_under_root, write_design

    body = request.get_json(silent=True) or {}
    raw = (body.get("path") or body.get("folder") or "").strip()
    design = body.get("design")
    if not raw:
        return jsonify({"ok": False, "error": "path required", "code": "no_path"}), 400
    if not isinstance(design, dict):
        return jsonify({"ok": False, "error": "design object required", "code": "no_design"}), 400
    try:
        folder = resolve_under_root(default_designs_root(), raw)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc), "code": "bad_path"}), 400

    info = classify_folder(folder)
    if info.get("status") == "foreign":
        return jsonify({
            "ok": False,
            "code": "foreign_folder",
            "error": info.get("reason") or "refuse to write into non-project folder",
            "files": info.get("files") or [],
        }), 409

    try:
        meta = write_design(folder, design, create_ok=True)
        return jsonify({"ok": True, **meta})
    except PermissionError as exc:
        return jsonify({"ok": False, "error": str(exc), "code": "foreign_folder"}), 409
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc), "code": "bad_design"}), 400
    except OSError as exc:
        return jsonify({"ok": False, "error": str(exc), "code": "io_error"}), 500


@api_bp.route("/projects/new", methods=["POST"])
def projects_new() -> Response:
    """Create a new project folder under designs root (name = folder name)."""
    from designs_store import default_designs_root, init_project, read_design, resolve_under_root

    body = request.get_json(silent=True) or {}
    name = (body.get("name") or body.get("folder") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "name required", "code": "no_name"}), 400
    # force under root as single segment
    name = name.replace("\\", "/").split("/")[-1]
    try:
        folder = resolve_under_root(default_designs_root(), name)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc), "code": "bad_name"}), 400

    if folder.exists() and any(folder.iterdir()):
        from designs_store import classify_folder

        info = classify_folder(folder)
        if info["status"] == "project":
            return jsonify({"ok": False, "error": "project already exists", "code": "exists", "path": str(folder)}), 409
        if info["status"] == "foreign":
            return jsonify({
                "ok": False,
                "code": "foreign_folder",
                "error": "folder exists with non-project files",
                "files": info.get("files") or [],
            }), 409

    try:
        seed = body.get("design") if isinstance(body.get("design"), dict) else None
        if seed is not None and not seed.get("name"):
            seed = dict(seed)
            seed["name"] = name
        meta = init_project(folder, seed)
        design, err = read_design(folder)
        if err or not design:
            return jsonify({"ok": False, "error": err or "read failed"}), 500
        return jsonify({"ok": True, **meta, "design": design})
    except FileExistsError as exc:
        return jsonify({"ok": False, "error": str(exc), "code": "exists"}), 409
    except PermissionError as exc:
        return jsonify({"ok": False, "error": str(exc), "code": "foreign_folder"}), 409
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": str(exc), "code": "init_failed"}), 400


@api_bp.route("/paradigms", methods=["GET"])
def paradigms() -> Response:
    _ensure_paradigms_loaded()
    return jsonify({"paradigms": list_paradigms()})


@api_bp.route("/paradigm/<paradigm_id>/form", methods=["GET"])
def paradigm_form(paradigm_id: str) -> Response:
    _ensure_paradigms_loaded()
    data = load_paradigm(paradigm_id)
    if data is None:
        return jsonify({"error": f"unknown paradigm: {paradigm_id!r}"}), 404

    # Stub HTML: a real <form> wrapper with the right data-* attributes so
    # the existing form engine (frontend/forms.js) can bind to it.
    fields_html = []
    for f in data.get("fields", []) or []:
        fname = f.get("name", "")
        ftype = f.get("type", "text")
        label = f.get("label", fname)
        default = f.get("default", "")
        required = "true" if f.get("required") else "false"
        attrs = f'name="{fname}" data-required="{required}"'
        if ftype == "number" and f.get("min") is not None:
            attrs += f' data-min="{f["min"]}"'
        if ftype == "number" and f.get("max") is not None:
            attrs += f' data-max="{f["max"]}"'

        if ftype == "checkbox":
            checked = " checked" if default else ""
            fields_html.append(
                f'<label class="field"><span>{label}</span>'
                f'<input type="checkbox" {attrs}{checked}></label>'
            )
        elif ftype == "textarea":
            fields_html.append(
                f'<label class="field"><span>{label}</span>'
                f'<textarea {attrs} rows="3">{default}</textarea></label>'
            )
        elif ftype in ("select", "multiselect"):
            opts = f.get("options", []) or []
            opt_html = "".join(
                f'<option value="{o}"' + (" selected" if o == default else "") + f">{o}</option>"
                for o in opts
            )
            fields_html.append(
                f'<label class="field"><span>{label}</span>'
                f'<select {attrs}>{opt_html}</select></label>'
            )
        elif ftype == "number":
            fields_html.append(
                f'<label class="field"><span>{label}</span>'
                f'<input type="number" {attrs} value="{default}"></label>'
            )
        else:  # text, color, slider, etc.
            fields_html.append(
                f'<label class="field"><span>{label}</span>'
                f'<input type="text" {attrs} value="{default}"></label>'
            )

    body = "\n".join(fields_html) or '<p class="empty">No fields defined for this paradigm.</p>'
    html = (
        f'<form class="form" data-paradigm="{paradigm_id}">\n'
        f'  <h2>{data.get("label", paradigm_id)}</h2>\n'
        f'  {body}\n'
        f'  <div class="actions">\n'
        f'    <button type="button" id="submit-spec-btn">Submit spec</button>\n'
        f'  </div>\n'
        f'</form>'
    )
    # schema = raw yaml (re-serialised from the parsed dict).
    import yaml as _yaml  # local import to keep module-load time small
    schema = _yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    return jsonify({"html": html, "schema": schema})


@api_bp.route("/paradigm/<paradigm_id>/submit", methods=["POST"])
def paradigm_submit(paradigm_id: str) -> Response:
    _ensure_paradigms_loaded()
    data = load_paradigm(paradigm_id)
    if data is None:
        return jsonify({"error": f"unknown paradigm: {paradigm_id!r}"}), 404
    if not request.is_json:
        return jsonify({"error": "expected JSON body", "code": "bad_content_type"}), 400
    spec = request.get_json(silent=True) or {}
    if not isinstance(spec, dict):
        return jsonify({"error": "expected JSON object", "code": "bad_body"}), 400

    errors = _validate_spec_against_paradigm(spec, data)
    return jsonify({"spec": spec, "errors": errors, "ok": len(errors) == 0})


def _validate_spec_against_paradigm(spec: Dict[str, Any], paradigm: Dict[str, Any]) -> List[Dict[str, str]]:
    """Type-check each spec value against the paradigm's field defs."""
    errors: List[Dict[str, str]] = []
    for f in paradigm.get("fields", []) or []:
        fname = f.get("name", "")
        ftype = f.get("type", "text")
        required = bool(f.get("required"))
        present = fname in spec and spec[fname] not in (None, "")

        if required and not present:
            errors.append({"field": fname, "msg": "required"})
            continue
        if not present:
            continue

        v = spec[fname]
        if ftype == "number" and not isinstance(v, (int, float)):
            errors.append({"field": fname, "msg": f"expected number, got {type(v).__name__}"})
        elif ftype == "checkbox" and not isinstance(v, bool):
            errors.append({"field": fname, "msg": f"expected boolean, got {type(v).__name__}"})
        elif ftype in ("text", "textarea") and not isinstance(v, str):
            errors.append({"field": fname, "msg": f"expected string, got {type(v).__name__}"})
        elif ftype == "select" and not isinstance(v, str):
            errors.append({"field": fname, "msg": f"expected string, got {type(v).__name__}"})

        # range check for number
        if ftype == "number" and isinstance(v, (int, float)):
            lo = f.get("min")
            hi = f.get("max")
            if lo is not None and v < lo:
                errors.append({"field": fname, "msg": f"must be >= {lo}"})
            if hi is not None and v > hi:
                errors.append({"field": fname, "msg": f"must be <= {hi}"})
    return errors


@api_bp.route("/runs", methods=["GET"])
def list_runs() -> Response:
    # Merge in-memory (live) and on-disk (rehydrated) views, dedup by id
    # preferring the in-memory snapshot.
    seen: Dict[str, Dict[str, Any]] = {}
    for r in _load_runs_from_disk():
        seen[r["id"]] = r
    with _RUNS_LOCK:
        for rid, sm in _RUNS.items():
            seen[rid] = {
                "id": rid,
                "paradigm": sm.paradigm_id,
                "status": sm.state,
                "started_at": sm.started_at,
            }
    runs = sorted(seen.values(), key=lambda r: r.get("started_at", 0), reverse=True)
    return jsonify({"runs": runs})


@api_bp.route("/runs", methods=["POST"])
def create_run() -> Response:
    if not request.is_json:
        return jsonify({"error": "expected JSON body", "code": "bad_content_type"}), 400
    body = request.get_json(silent=True) or {}
    design = body.get("design")
    paradigm_id = body.get("paradigm_id")
    spec = body.get("spec") or {}

    # Builder design path: no paradigm yaml required
    if isinstance(design, dict) and design.get("routines"):
        paradigm_id = paradigm_id or "design"
        if not isinstance(spec, dict):
            spec = {}
        spec = dict(spec)
        spec.setdefault("source", "builder")
        spec.setdefault("design_name", design.get("name") or "untitled")
        # Session from Run form — never PsychoPy expInfo dialog
        sess = body.get("session")
        if isinstance(sess, dict):
            session_obj = {
                "participant_id": str(
                    sess.get("participant_id") or sess.get("participant") or "P01"
                ).strip()
                or "P01",
                "session": str(
                    sess.get("session") or sess.get("session_id") or "1"
                ).strip()
                or "1",
                "date": str(sess.get("date") or "").strip(),
                "experimenter": str(sess.get("experimenter") or "").strip(),
                "notes": str(sess.get("notes") or "").strip(),
                "participant_name": str(
                    sess.get("participant_name") or sess.get("name") or ""
                ).strip(),
            }
            # user-defined columns: session.custom {key: value}
            custom = sess.get("custom")
            if isinstance(custom, dict):
                cleaned = {}
                for ck, cv in custom.items():
                    key = str(ck or "").strip()
                    if not key or key in session_obj:
                        continue
                    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", key):
                        continue
                    cleaned[key] = str(cv if cv is not None else "").strip()
                if cleaned:
                    session_obj["custom"] = cleaned
            # force en-US IME during live Start/Pilot (default on)
            if "force_en_ime" in sess:
                session_obj["force_en_ime"] = sess.get("force_en_ime")
            elif "force_en_ime" in body:
                session_obj["force_en_ime"] = body.get("force_en_ime")
            else:
                session_obj["force_en_ime"] = True
            spec["session"] = session_obj
            spec["participant_id"] = spec["session"]["participant_id"]
            spec["force_en_ime"] = session_obj["force_en_ime"]
        elif not spec.get("participant_id"):
            spec["participant_id"] = "P01"
        if "force_en_ime" not in (spec if isinstance(spec, dict) else {}):
            if "force_en_ime" in body:
                spec["force_en_ime"] = body.get("force_en_ime")
            else:
                spec.setdefault("force_en_ime", True)
            if isinstance(spec.get("session"), dict) and "force_en_ime" not in spec["session"]:
                spec["session"]["force_en_ime"] = spec["force_en_ime"]
        project_path = (body.get("project_path") or "").strip()
        if project_path:
            spec["project_path"] = project_path
        # mode for registry (pilot / autopilot / participant)
        headless_flag = body.get("headless", True)
        if not isinstance(headless_flag, bool):
            headless_flag = str(headless_flag).lower() not in ("0", "false", "no", "off")
        if headless_flag:
            # default legacy headless → autopilot (auto keys); caller may pass mode
            spec.setdefault("mode", "autopilot")
        else:
            spec.setdefault("mode", (spec.get("mode") or "participant"))
        force_dup = bool(body.get("allow_duplicate"))
        mode_now = str(spec.get("mode") or "participant")
        if (
            project_path
            and mode_now not in ("pilot", "autopilot")
            and not force_dup
            and isinstance(spec.get("session"), dict)
        ):
            pid = spec["session"]["participant_id"]
            sid = spec["session"]["session"]
            if _preg.is_duplicate(project_path, pid, sid):
                return jsonify({
                    "error": f"participant {pid!r} session {sid!r} already used in this project",
                    "code": "duplicate_participant",
                    "participant_id": pid,
                    "session": sid,
                    "suggest_id": _preg.suggest_next_id(project_path),
                    "suggest_session": _preg.suggest_next_session(project_path, pid),
                }), 409
    else:
        design = None
        if not isinstance(paradigm_id, str) or not paradigm_id:
            return jsonify(
                {"error": "paradigm_id or design required", "code": "missing_source"}
            ), 400
        if not isinstance(spec, dict):
            return jsonify({"error": "spec must be a JSON object", "code": "bad_spec"}), 400
        _ensure_paradigms_loaded()
        paradigm = load_paradigm(paradigm_id)
        if paradigm is None:
            return jsonify({"error": f"unknown paradigm: {paradigm_id!r}"}), 404
        spec_errors = _validate_spec_against_paradigm(spec, paradigm)
        if spec_errors:
            return jsonify({"error": "spec validation failed", "errors": spec_errors}), 400

    # date + short hash — unique, sortable by day
    run_id = time.strftime("%Y%m%d") + "_" + uuid.uuid4().hex[:8]
    run_dir = _make_run_dir(run_id)
    headless = body.get("headless", True)
    if not isinstance(headless, bool):
        headless = str(headless).lower() not in ("0", "false", "no", "off")

    sm = StateMachine(run_id=run_id, run_dir=run_dir, paradigm_id=paradigm_id, spec=spec)
    sm.headless = headless  # type: ignore[attr-defined]
    sm.design = design  # type: ignore[attr-defined]
    with _RUNS_LOCK:
        _RUNS[run_id] = sm

    t = threading.Thread(
        target=_run_lifecycle, args=(sm, spec), name=f"run-{run_id}", daemon=True
    )
    t.start()

    return jsonify({
        "run_id": run_id,
        "status": sm.state,
        "headless": headless,
        "source": "design" if design else "paradigm",
    })


def _get_run_state_machine(run_id: str) -> Optional[StateMachine]:
    with _RUNS_LOCK:
        sm = _RUNS.get(run_id)
    if sm is not None:
        return sm
    # Fall back to disk: build a "stateless" wrapper just for reads.
    run_dir = os.path.join(RUNS_DIR, run_id)
    state_path = os.path.join(run_dir, "state.json")
    if not os.path.isfile(state_path):
        return None
    try:
        with open(state_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None
    try:
        return StateMachine.from_disk(run_dir)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None


@api_bp.route("/runs/<run_id>", methods=["GET"])
def get_run(run_id: str) -> Response:
    sm = _get_run_state_machine(run_id)
    if sm is None:
        return jsonify({"error": f"unknown run_id: {run_id!r}"}), 404

    status = sm.state
    # Progress: 0 until we reach running, then 0..1, then 1 at finished.
    if status == "finished":
        progress = 1.0
    elif status in ("stopped", "failed"):
        progress = 0.0
    else:
        progress = 0.0

    payload = {
            "run_id": run_id,
            "paradigm": sm.paradigm_id,
            "status": status,
            "progress": progress,
            "started_at": sm.started_at,
            "elapsed_s": round(time.time() - sm.started_at, 3),
            "log_tail": sm.log_tail(50),
            "data_files": sm.list_data_files(),
            "instrument": _read_instrument(sm.run_dir),
            "spec": {
                "mode": (sm.spec or {}).get("mode"),
                "participant_id": (sm.spec or {}).get("participant_id"),
                "project_path": (sm.spec or {}).get("project_path"),
                "session": (sm.spec or {}).get("session")
                if isinstance((sm.spec or {}).get("session"), dict)
                else {},
                "headless": getattr(sm, "headless", None),
            },
        }
    return jsonify(payload)


@api_bp.route("/runs/<run_id>/stop", methods=["POST"])
def stop_run(run_id: str) -> Response:
    sm = _get_run_state_machine(run_id)
    if sm is None:
        return jsonify({"error": f"unknown run_id: {run_id!r}"}), 404
    if sm.is_terminal():
        return jsonify({"ok": True, "status": sm.state, "note": "already terminal"})
    sm.request_stop(note="stopped by user")
    return jsonify({"ok": True, "status": sm.state})


def _safe_data_filename(filename: str) -> bool:
    if not filename or "/" in filename or "\\" in filename or filename.startswith("."):
        return False
    if ".." in filename:
        return False
    return True


def _run_data_dir(run_id: str) -> Optional[str]:
    data_dir = os.path.join(RUNS_DIR, run_id, "data")
    return data_dir if os.path.isdir(data_dir) else None


def _download_name_for(run_id: str, filename: str) -> str:
    """Prefer project-facing CSV basename from instrument.json when available."""
    if filename == "trials.csv":
        instr = _read_instrument(os.path.join(RUNS_DIR, run_id))
        if isinstance(instr, dict):
            for key in ("csv", "csv_project"):
                raw = instr.get(key)
                if not raw:
                    continue
                base = os.path.basename(str(raw).replace("\\", "/"))
                if base.lower().endswith(".csv") and _safe_data_filename(base):
                    return base
    return filename


def _mime_for_name(name: str) -> str:
    lower = name.lower()
    if lower.endswith(".csv"):
        return "text/csv"
    if lower.endswith(".json"):
        return "application/json"
    guessed, _ = mimetypes.guess_type(name)
    return guessed or "application/octet-stream"


def _pack_download_stem(run_id: str) -> str:
    instr = _read_instrument(os.path.join(RUNS_DIR, run_id))
    if isinstance(instr, dict):
        for key in ("csv", "csv_project"):
            raw = instr.get(key)
            if not raw:
                continue
            base = os.path.basename(str(raw).replace("\\", "/"))
            if base.lower().endswith(".csv"):
                return base[:-4]
    return run_id


@api_bp.route("/runs/<run_id>/data/<path:filename>", methods=["GET"])
def run_data(run_id: str, filename: str) -> Response:
    # Reject any path-traversal attempts.
    if not _safe_data_filename(filename):
        return jsonify({"error": "invalid filename"}), 400
    data_dir = _run_data_dir(run_id)
    if not data_dir:
        return jsonify({"error": "no data for this run"}), 404
    target = os.path.join(data_dir, filename)
    if not os.path.isfile(target):
        return jsonify({"error": f"file not found: {filename}"}), 404
    download_name = _download_name_for(run_id, filename)
    return send_from_directory(
        data_dir,
        filename,
        mimetype=_mime_for_name(filename),
        as_attachment=True,
        download_name=download_name,
    )


@api_bp.route("/runs/<run_id>/data-pack.zip", methods=["GET"])
def run_data_pack(run_id: str) -> Response:
    """Zip all files under runs/<id>/data/ for one-click analysis pack download."""
    data_dir = _run_data_dir(run_id)
    if not data_dir:
        return jsonify({"error": "no data for this run"}), 404
    names = sorted(
        n
        for n in os.listdir(data_dir)
        if os.path.isfile(os.path.join(data_dir, n)) and _safe_data_filename(n)
    )
    if not names:
        return jsonify({"error": "no data files for this run"}), 404

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in names:
            arc = name
            # Prefer friendly trials name inside the zip when instrument knows it
            if name == "trials.csv":
                friendly = _download_name_for(run_id, name)
                if friendly and friendly != name:
                    arc = friendly
            zf.write(os.path.join(data_dir, name), arcname=arc)
    buf.seek(0)
    zip_name = f"{_pack_download_stem(run_id)}_data.zip"
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=zip_name,
    )
