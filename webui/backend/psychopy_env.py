"""Resolve the PsychoPy Python executable for runs and System probe.

Order:
  1. PSYCLAW_PSYCHOPY_PYTHON if set and the file exists
  2. **Library** — PATH ``python`` / ``python3`` that can ``import psychopy``
  3. **Standalone / known install** — PsychoPy app bundles (``…/PsychoPy/python.exe``)
  4. Last resort: env string (even if missing) or a documented fallback path
     so error messages stay actionable.

Does not require PsychoPy to be importable in the Flask process itself.
Avoid deep filesystem walks (Program Files recursive globs hang on Windows).
"""
from __future__ import annotations

import os
import platform
import shutil
import subprocess
from typing import Any, Dict, List, Optional, Tuple


# Common Windows Standalone locations (existence checked at resolve time).
_WIN_STANDALONE = [
    r"C:\Program Files\PsychoPy\python.exe",
    r"C:\Program Files\PsychoPy3\python.exe",
    r"C:\Program Files (x86)\PsychoPy\python.exe",
    r"C:\Program Files (x86)\PsychoPy3\python.exe",
]

_POSIX_STANDALONE = [
    "/usr/local/bin/psychopy",
    "/opt/PsychoPy/python",
]


def _env_override() -> str:
    env_val = (os.environ.get("PSYCLAW_PSYCHOPY_PYTHON") or "").strip()
    if env_val:
        return env_val
    # Fall back to persisted user config (~/.psyclaw/config.json).
    try:
        import json as _json
        home = os.path.expanduser("~")
        cfg_path = os.path.join(home, ".psyclaw", "config.json")
        if os.path.isfile(cfg_path):
            with open(cfg_path, "r", encoding="utf-8") as fh:
                data = _json.load(fh)
            p = str(data.get("psychopy_python") or "").strip()
            if p and os.path.isfile(p):
                return p
    except Exception:
        pass
    return ""


def _norm(p: str) -> str:
    return os.path.normcase(os.path.normpath(p))


def _win_standalone_extra() -> List[str]:
    """Shallow extras only — no recursive Program Files walk."""
    out: List[str] = []
    local = os.environ.get("LOCALAPPDATA") or ""
    if local:
        out.append(os.path.join(local, "Programs", "PsychoPy", "python.exe"))
        out.append(os.path.join(local, "Programs", "PsychoPy3", "python.exe"))
    for root_key in ("ProgramFiles", "ProgramFiles(x86)"):
        root = os.environ.get(root_key) or ""
        if not root or not os.path.isdir(root):
            continue
        try:
            for name in os.listdir(root):
                if not name.lower().startswith("psychopy"):
                    continue
                out.append(os.path.join(root, name, "python.exe"))
        except OSError:
            pass
    return out


def _path_library_candidates() -> List[str]:
    """Interpreters on PATH (pip / venv / conda style)."""
    out: List[str] = []
    seen = set()
    for name in ("python", "python3"):
        which = shutil.which(name)
        if not which:
            continue
        key = _norm(which)
        if key in seen:
            continue
        seen.add(key)
        out.append(which)
    return out


def _standalone_candidates() -> List[str]:
    """PsychoPy Standalone / app-bundle python paths."""
    out: List[str] = []
    seen = set()

    def add(p: Optional[str]) -> None:
        if not p:
            return
        key = _norm(p)
        if key in seen:
            return
        seen.add(key)
        out.append(p)

    if platform.system() == "Windows":
        for c in _WIN_STANDALONE:
            add(c)
        for c in _win_standalone_extra():
            add(c)
    else:
        for c in _POSIX_STANDALONE:
            add(c)
        home = os.path.expanduser("~")
        add(os.path.join(home, "PsychoPy", "python"))
        add(os.path.join(home, "psychopy", "bin", "python"))
    return out


def candidate_paths() -> List[str]:
    """Ordered unique candidates: env → library (PATH) → standalone."""
    out: List[str] = []
    seen = set()

    def add(p: Optional[str]) -> None:
        if not p:
            return
        key = _norm(p)
        if key in seen:
            return
        seen.add(key)
        out.append(p)

    env = _env_override()
    if env:
        add(env)
    for p in _path_library_candidates():
        add(p)
    for p in _standalone_candidates():
        add(p)
    return out


_IMPORT_OK_CACHE = {}

def _can_import_psychopy(python_exe: str, timeout: float = 12.0) -> bool:
    if not python_exe or not os.path.isfile(python_exe):
        return False
    if python_exe in _IMPORT_OK_CACHE:
        return _IMPORT_OK_CACHE[python_exe]
    try:
        proc = subprocess.run(
            [
                python_exe,
                "-c",
                "import psychopy; print(getattr(psychopy, '__version__', 'ok'))",
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
            env={
                **os.environ,
                "PYTHONPATH": "",
                "PYTHONHOME": "",
                "PSYCHOPY_DISABLE_VERSION_CHECK": "1",
            },
        )
        ok = proc.returncode == 0 and bool((proc.stdout or "").strip())
        _IMPORT_OK_CACHE[python_exe] = ok
        return ok
    except (OSError, subprocess.TimeoutExpired):
        _IMPORT_OK_CACHE[python_exe] = False
        return False


_RESOLVE_CACHE = {"path": None, "source": None}


def clear_resolution_cache() -> None:
    """Clear process-local probe results after a configured interpreter changes."""
    _IMPORT_OK_CACHE.clear()
    _RESOLVE_CACHE["path"] = None
    _RESOLVE_CACHE["source"] = None


def resolve_psychopy_python(
    *,
    verify_import: bool = False,
) -> Tuple[str, str]:
    """Return ``(path, source)``.

    ``source`` one of: ``env`` | ``library`` | ``standalone`` | ``fallback``.

    Priority (after env override):
      library (PATH + import psychopy) → standalone install paths.

    Library tier always import-checks (otherwise “library first” is meaningless).
    Standalone import-checks only when ``verify_import`` is True; otherwise the
    first existing standalone path is used.
    """
    if (
        not verify_import
        and _RESOLVE_CACHE.get("path")
        and os.path.isfile(_RESOLVE_CACHE["path"])
    ):
        return _RESOLVE_CACHE["path"], _RESOLVE_CACHE.get("source") or "cache"

    env = _env_override()
    if env and os.path.isfile(env):
        if not verify_import or _can_import_psychopy(env):
            _RESOLVE_CACHE["path"], _RESOLVE_CACHE["source"] = env, "env"
            return env, "env"

    # 2) pip / venv / conda: must import psychopy
    for p in _path_library_candidates():
        if _can_import_psychopy(p):
            _RESOLVE_CACHE["path"], _RESOLVE_CACHE["source"] = p, "library"
            return p, "library"

    # 3) Standalone / known bundles
    for p in _standalone_candidates():
        if not os.path.isfile(p):
            continue
        if verify_import and not _can_import_psychopy(p):
            continue
        _RESOLVE_CACHE["path"], _RESOLVE_CACHE["source"] = p, "standalone"
        return p, "standalone"

    if env:
        _RESOLVE_CACHE["path"], _RESOLVE_CACHE["source"] = env, "fallback"
        return env, "fallback"
    if platform.system() == "Windows":
        return r"C:\Program Files\PsychoPy\python.exe", "fallback"
    which = shutil.which("python3") or shutil.which("python") or "python3"
    return which, "fallback"


def psychopy_python() -> str:
    """Path string only (compat helper for runner / routes)."""
    path, _ = resolve_psychopy_python(verify_import=False)
    return path


def psychopy_available() -> bool:
    return bool(resolve_psychopy_engine()["available"])


def resolve_psychopy_engine() -> Dict[str, Any]:
    """Return the one verified engine decision shared by probe and run dispatch.

    A Python executable alone is insufficient. A real run needs an interpreter
    that imports PsychoPy in the same clean environment used by the runner.
    """
    env = _env_override()
    if env:
        if not os.path.isfile(env):
            return {"available": False, "path": env, "source": "env", "reason": "missing"}
        if not _can_import_psychopy(env):
            return {
                "available": False,
                "path": env,
                "source": "env",
                "reason": "import_failed",
            }
        _RESOLVE_CACHE["path"], _RESOLVE_CACHE["source"] = env, "env"
        return {"available": True, "path": env, "source": "env", "reason": "ok"}

    path, source = resolve_psychopy_python(verify_import=True)
    if not os.path.isfile(path):
        return {"available": False, "path": path, "source": source, "reason": "missing"}
    if not _can_import_psychopy(path):
        return {"available": False, "path": path, "source": source, "reason": "import_failed"}
    return {"available": True, "path": path, "source": source, "reason": "ok"}


def describe_resolution() -> Dict[str, Any]:
    engine = resolve_psychopy_engine()
    path = str(engine["path"])
    source = str(engine["source"])
    return {
        "path": path,
        "source": source,
        "exists": os.path.isfile(path),
        "available": bool(engine["available"]),
        "reason": engine["reason"],
        "priority": [
            "PSYCLAW_PSYCHOPY_PYTHON",
            "library (PATH python that imports psychopy)",
            "standalone (PsychoPy app python.exe)",
        ],
        "env_PSYCLAW_PSYCHOPY_PYTHON": _env_override() or None,
        "candidates_exist": [p for p in candidate_paths() if os.path.isfile(p)][:12],
    }
