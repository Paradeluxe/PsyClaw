#!/usr/bin/env python3
"""Create a desktop shortcut to the cross-platform launcher (best-effort).

Windows: .lnk via PowerShell (icon = icon.ico at webui root, assets/ fallback)
macOS:   .command alias copy instructions / optional .app stub later
Linux:   ~/.local/share/applications/psyclaw-webui.desktop

Run from repo root:
  python scripts/make_desktop_shortcut.py
"""
from __future__ import annotations

import os
import sys
import subprocess


def repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _first_existing(root: str, *rels: str) -> str:
    for rel in rels:
        p = os.path.join(root, rel)
        if os.path.isfile(p):
            return p
    return os.path.join(root, rels[0]) if rels else root


def icon_ico(root: str) -> str:
    return _first_existing(root, "icon.ico", os.path.join("assets", "icon.ico"))


def icon_png(root: str) -> str:
    return _first_existing(root, "icon.png", os.path.join("assets", "icon.png"))


def windows_shortcut(root: str) -> str:
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    if not os.path.isdir(desktop):
        desktop = os.path.join(os.environ.get("USERPROFILE", ""), "Desktop")
    lnk = os.path.join(desktop, "PsyClaw WebUI.lnk")
    bat = os.path.join(root, "start.bat")
    ico = icon_ico(root)
    venv_py = os.path.join(root, ".venv", "Scripts", "python.exe")
    if not os.path.isfile(venv_py):
        print(
            "WARNING: no .venv in this folder — double-click will bootstrap on first start "
            "if Python 3.10+ is on PATH, or run:\n"
            "  python -m venv .venv && .venv\\Scripts\\python.exe -m pip install -r requirements.txt"
        )
    ps = f"""
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut('{lnk.replace("'", "''")}')
$s.TargetPath = '{bat.replace("'", "''")}'
$s.WorkingDirectory = '{root.replace("'", "''")}'
$s.WindowStyle = 1
$s.Description = 'PsyClaw WebUI (local lab)'
if (Test-Path -LiteralPath '{ico.replace("'", "''")}') {{ $s.IconLocation = '{ico.replace("'", "''")},0' }}
$s.Save()
"""
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        check=True,
    )
    return lnk


def linux_desktop(root: str) -> str:
    apps = os.path.join(os.path.expanduser("~"), ".local", "share", "applications")
    os.makedirs(apps, exist_ok=True)
    path = os.path.join(apps, "psyclaw-webui.desktop")
    sh = os.path.join(root, "start.sh")
    icon = icon_png(root)
    body = f"""[Desktop Entry]
Type=Application
Name=PsyClaw WebUI
Comment=Local lab software for .psyclaw experiments
Exec={sh}
Path={root}
Icon={icon}
Terminal=true
Categories=Science;Education;
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    os.chmod(sh, 0o755)
    os.chmod(path, 0o755)
    return path


def macos_note(root: str) -> str:
    cmd = os.path.join(root, "start.command")
    try:
        os.chmod(cmd, 0o755)
    except OSError:
        pass
    return (
        f"macOS: drag {cmd} to Desktop or Dock. "
        f"Icon: set Get Info → paste {icon_png(root)}"
    )


def main() -> int:
    root = repo_root()
    try:
        from user_config import remember_webui_root

        cfg = remember_webui_root(root)
        print(f"remembered webui_root → {cfg}")
    except Exception as exc:
        print(f"remember skipped: {exc}")
    plat = sys.platform
    print(f"repo: {root}")
    if plat == "win32":
        out = windows_shortcut(root)
        print(f"Desktop shortcut: {out}")
    elif plat == "darwin":
        print(macos_note(root))
    else:
        out = linux_desktop(root)
        print(f"Desktop entry: {out}")
    print(f"icons: {icon_png(root)} | {icon_ico(root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
