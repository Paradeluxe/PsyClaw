#!/usr/bin/env python3
"""Cross-platform DEBUG launcher for psyclaw-webui (isolated from production).

Differences vs start.py:
  - Targets backend/debug_app.py (not backend/app.py)
  - Default port 8877 (not 8876) — override via PSYCLAW_DEBUG_PORT
  - Prefers .venv-debug (not .venv)
  - Sets PSYCLAW_DEBUG=1 + PSYCLAW_FORCE_MOCK=1 by default
  - Never silently reuses a production port-8876 listener

Usage:
  python start_debug.py
  python start_debug.py --no-browser
  python start_debug.py --restart
  python start_debug.py --stop
"""
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser


_DEBUG_DEFAULT_PORT = 8877


def _repo_root() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def _debug_venv_python(root: str) -> str | None:
    if sys.platform == "win32":
        cand = os.path.join(root, ".venv-debug", "Scripts", "python.exe")
    else:
        cand = os.path.join(root, ".venv-debug", "bin", "python")
    return cand if os.path.isfile(cand) else None


def _fallback_python(root: str) -> tuple[str | None, str]:
    """If .venv-debug missing, try .venv, then any python with flask."""
    venv = _debug_venv_python(root)
    if venv:
        return venv, "venv-debug"

    # Fall back to production .venv if it has flask (debug deps may be missing).
    if sys.platform == "win32":
        prod = os.path.join(root, ".venv", "Scripts", "python.exe")
    else:
        prod = os.path.join(root, ".venv", "bin", "python")
    if os.path.isfile(prod) and _python_has_flask(prod):
        return prod, "venv-prod-fallback"

    candidates: list[tuple[str, str]] = []
    if sys.executable and os.path.isfile(sys.executable):
        candidates.append((sys.executable, "current"))
    for name in ("python3", "python"):
        which = shutil.which(name)
        if which:
            candidates.append((which, f"path:{name}"))

    seen = set()
    for exe, src in candidates:
        key = os.path.normcase(os.path.abspath(exe))
        if key in seen:
            continue
        seen.add(key)
        if _python_has_flask(exe):
            return exe, src
    return None, "none"


def _python_has_flask(python_exe: str) -> bool:
    try:
        proc = subprocess.run(
            [python_exe, "-c", "import flask"],
            capture_output=True,
            timeout=12,
        )
        return proc.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.6):
            return True
    except OSError:
        return False


def _health_is_psyclaw(port: int) -> bool:
    url = f"http://127.0.0.1:{port}/api/health"
    try:
        with urllib.request.urlopen(url, timeout=1.2) as resp:
            if getattr(resp, "status", 200) != 200:
                return False
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw) if raw.strip().startswith("{") else {}
            app = str(data.get("app") or "").strip().lower()
            return app == "psyclaw-webui" and data.get("status") == "ok"
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, OSError):
        return False


def _wait_health(port: int, proc, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _health_is_psyclaw(port):
            return True
        if proc.poll() is not None:
            return False
        time.sleep(0.35)
    return _health_is_psyclaw(port)


def _open_browser(url: str) -> None:
    if sys.platform == "win32":
        try:
            os.startfile(url)  # type: ignore[attr-defined]
            return
        except OSError:
            pass
        try:
            subprocess.Popen(
                ["cmd", "/c", "start", "", url],
                cwd=os.environ.get("TEMP") or os.getcwd(),
                close_fds=True,
            )
            return
        except OSError:
            pass
    try:
        webbrowser.open(url, new=1, autoraise=True)
    except Exception:
        print(f"Open browser manually: {url}")


def _pause_if_windows_error(code: int) -> None:
    if code == 0 or sys.platform != "win32":
        return
    if os.environ.get("PSYCLAW_NO_PAUSE"):
        return
    try:
        input("\nPress Enter to close…")
    except EOFError:
        time.sleep(8)


def _run_stop(root: str, port: int) -> int:
    stop_py = os.path.join(root, "scripts", "stop_server.py")
    if not os.path.isfile(stop_py):
        print("missing scripts/stop_server.py")
        return 1
    py = _debug_venv_python(root) or sys.executable
    env = os.environ.copy()
    env["PSYCLAW_PORT"] = str(port)
    try:
        proc = subprocess.run([py, stop_py], cwd=root, env=env, timeout=20)
        return int(proc.returncode)
    except subprocess.TimeoutExpired:
        print(f"stop_server timed out (20s) — try Task Manager on port {port}")
        return 1


def main() -> int:
    root = _repo_root()
    os.chdir(root)
    args = set(sys.argv[1:])
    no_browser = "--no-browser" in args
    do_stop = "--stop" in args
    do_restart = "--restart" in args

    if do_stop and not do_restart:
        return _run_stop(root, _DEBUG_DEFAULT_PORT)

    if do_restart:
        print("psyclaw-webui DEBUG: restart — stopping old debug server…")
        code = _run_stop(root, _DEBUG_DEFAULT_PORT)
        if code != 0:
            print("psyclaw-webui DEBUG: stop incomplete; not starting a second copy")
            return code
        time.sleep(0.5)

    py, py_src = _fallback_python(root)
    if not py:
        print("psyclaw-webui DEBUG: no usable Python found.")
        print("Create the debug venv in this folder:")
        print("  python -m venv .venv-debug")
        if sys.platform == "win32":
            print("  .venv-debug\\Scripts\\activate")
        else:
            print("  source .venv-debug/bin/activate")
        print("  pip install -r requirements-debug.txt")
        return 1

    if py_src == "venv-prod-fallback":
        print("psyclaw-webui DEBUG: WARNING — .venv-debug missing, using production .venv.")
        print("  Debug-only deps (flask-debugtoolbar) may be unavailable.")
        print("  Create .venv-debug for full isolation:")
        print("    python -m venv .venv-debug")
        print("    .venv-debug\\Scripts\\python -m pip install -r requirements-debug.txt")

    port = int(os.environ.get("PSYCLAW_DEBUG_PORT", str(_DEBUG_DEFAULT_PORT)))
    host = "127.0.0.1"
    url = f"http://{host}:{port}/"
    app_py = os.path.join(root, "backend", "debug_app.py")
    if not os.path.isfile(app_py):
        print(f"psyclaw-webui DEBUG: missing {app_py}")
        return 1

    if _port_open(host, port):
        if _health_is_psyclaw(port) and not do_restart:
            print(f"psyclaw-webui DEBUG already running → {url}")
            if not no_browser:
                _open_browser(url)
            return 0
        if _health_is_psyclaw(port) and do_restart:
            print("debug port still held after stop — abort")
            return 1
        print(f"psyclaw-webui DEBUG: port {port} is already in use (not this app).")
        print(f"  Try PSYCLAW_DEBUG_PORT={port + 1} python start_debug.py")
        return 1

    print(f"psyclaw-webui DEBUG → {url}")
    print(f"python: {py} ({py_src})")
    print("Stop: Ctrl+C  |  close this window to stop the server")

    env = os.environ.copy()
    env["PSYCLAW_DEBUG_PORT"] = str(port)
    env["PSYCLAW_DEBUG"] = "1"
    env.setdefault("PSYCLAW_FORCE_MOCK", "1")
    env["PYTHONPATH"] = os.path.join(root, "backend") + os.pathsep + env.get("PYTHONPATH", "")

    try:
        proc = subprocess.Popen(
            [py, app_py],
            cwd=root,
            env=env,
        )
    except OSError as exc:
        print(f"Failed to start debug server: {exc}")
        return 1

    if not no_browser:
        if _wait_health(port, proc, timeout=20.0):
            _open_browser(url)
            print(f"Browser: {url}")
        elif proc.poll() is not None:
            print("Debug server exited before becoming ready.")
            return int(proc.returncode or 1)
        else:
            print(f"Debug server starting slowly — open manually: {url}")
            _open_browser(url)

    try:
        return int(proc.wait())
    except KeyboardInterrupt:
        print("\nStopping…")
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
        return 0


if __name__ == "__main__":
    code = main()
    _pause_if_windows_error(code)
    sys.exit(code)