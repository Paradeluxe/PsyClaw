#!/usr/bin/env python3
"""Cross-platform launcher for psyclaw-webui (Windows / macOS / Linux).

Usage (from repo root):
  python start.py
  python start.py --no-browser

Prefers repo ``.venv``, starts backend/app.py, opens http://127.0.0.1:8876/

If the port is already in use:
  - same app (/api/health) → open browser only
  - something else → clear error + suggest PSYCLAW_PORT
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


def _repo_root() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def _venv_python(root: str) -> str | None:
    if sys.platform == "win32":
        cand = os.path.join(root, ".venv", "Scripts", "python.exe")
    else:
        cand = os.path.join(root, ".venv", "bin", "python")
    return cand if os.path.isfile(cand) else None


def _resolve_python(root: str) -> tuple[str | None, str]:
    """Return (python_exe, source). Prefer .venv, then usable interpreters."""
    venv = _venv_python(root)
    if venv:
        return venv, "venv"

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


def _wait_health(port: int, proc: subprocess.Popen[bytes] | subprocess.Popen, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _health_is_psyclaw(port):
            return True
        if proc.poll() is not None:
            return False
        time.sleep(0.35)
    return _health_is_psyclaw(port)


def _open_browser(url: str) -> None:
    """Windows double-click needs os.startfile / start; webbrowser alone is flaky."""
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


def _remember_this_install(root: str) -> None:
    try:
        scripts = os.path.join(root, "scripts")
        if scripts not in sys.path:
            sys.path.insert(0, scripts)
        from user_config import remember_webui_root  # type: ignore

        remember_webui_root(root)
    except Exception:
        pass


def _pause_if_windows_error(code: int) -> None:
    if code == 0 or sys.platform != "win32":
        return
    if os.environ.get("PSYCLAW_NO_PAUSE"):
        return
    try:
        input("\nPress Enter to close…")
    except EOFError:
        time.sleep(8)


def _run_stop(root: str) -> int:
    stop_py = os.path.join(root, "scripts", "stop_server.py")
    if not os.path.isfile(stop_py):
        print("missing scripts/stop_server.py")
        return 1
    # Prefer venv python if present so imports stay simple
    py = _venv_python(root) or sys.executable
    try:
        proc = subprocess.run([py, stop_py], cwd=root, timeout=20)
        return int(proc.returncode)
    except subprocess.TimeoutExpired:
        print("stop_server timed out (20s) — try Task Manager on port 8876")
        return 1


def main() -> int:
    root = _repo_root()
    os.chdir(root)
    args = set(sys.argv[1:])
    no_browser = "--no-browser" in args
    do_stop = "--stop" in args
    do_restart = "--restart" in args
    _remember_this_install(root)

    if do_stop and not do_restart:
        return _run_stop(root)

    if do_restart:
        print("psyclaw-webui: restart — stopping old server (bounded)…")
        code = _run_stop(root)
        if code != 0:
            print("psyclaw-webui: stop incomplete; not starting a second copy")
            return code
        time.sleep(0.5)

    py, py_src = _resolve_python(root)
    if not py:
        print("psyclaw-webui: no usable Python found.")
        print("Create a venv in this folder (see docs/INSTALL.md):")
        print("  python -m venv .venv")
        if sys.platform == "win32":
            print("  .venv\\Scripts\\activate")
        else:
            print("  source .venv/bin/activate")
        print("  pip install -r requirements.txt")
        return 1

    port = int(os.environ.get("PSYCLAW_PORT", "8876"))
    host = "127.0.0.1"
    url = f"http://{host}:{port}/"
    app_py = os.path.join(root, "backend", "app.py")
    if not os.path.isfile(app_py):
        print(f"psyclaw-webui: missing {app_py}")
        return 1

    if _port_open(host, port):
        if _health_is_psyclaw(port) and not do_restart:
            print(f"psyclaw-webui already running → {url}")
            if not no_browser:
                _open_browser(url)
            return 0
        if _health_is_psyclaw(port) and do_restart:
            print("port still held after stop — abort")
            return 1
        print(f"psyclaw-webui: port {port} is already in use (not this app).")
        print("Options:")
        print(f"  1) Stop the other program using {host}:{port}")
        print("  2) Start on another port, e.g.:")
        if sys.platform == "win32":
            print("       set PSYCLAW_PORT=8877")
            print("       python start.py")
        else:
            print("       PSYCLAW_PORT=8877 python start.py")
        return 1

    print(f"psyclaw-webui → {url}")
    print(f"python: {py} ({py_src})")
    print("Stop: Ctrl+C  |  close this window to stop the server")

    env = os.environ.copy()
    env.setdefault("PSYCLAW_PORT", str(port))
    # Ensure child can import backend package layout
    env["PYTHONPATH"] = os.path.join(root, "backend") + os.pathsep + env.get("PYTHONPATH", "")

    try:
        proc = subprocess.Popen(
            [py, app_py],
            cwd=root,
            env=env,
        )
    except OSError as exc:
        print(f"Failed to start server: {exc}")
        return 1

    if not no_browser:
        if _wait_health(port, proc, timeout=20.0):
            _open_browser(url)
            print(f"Browser: {url}")
        elif proc.poll() is not None:
            print("Server exited before becoming ready.")
            return int(proc.returncode or 1)
        else:
            print(f"Server starting slowly — open manually: {url}")
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
