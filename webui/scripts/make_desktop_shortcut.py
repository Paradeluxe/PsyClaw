#!/usr/bin/env python3
"""Register platform app entries for the cross-platform launcher.

Windows: .lnk files via PowerShell (Desktop + Start Menu; icon = icon.ico at webui root)
macOS:   ~/Applications/PsyClaw.app bundle (shows in Launchpad / Spotlight)
Linux:   ~/.local/share/applications/PsyClaw.desktop (app menu entry)

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


def icon_icns(root: str) -> str:
    return _first_existing(root, "icon.icns", os.path.join("assets", "icon.icns"))


# ── Windows ──────────────────────────────────────────────────────────

def windows_start_menu_dir() -> str:
    appdata = os.environ.get("APPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Roaming")
    return os.path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs")


def windows_shortcut_paths(root: str) -> tuple[str, str]:
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    if not os.path.isdir(desktop):
        desktop = os.path.join(os.environ.get("USERPROFILE", ""), "Desktop")
    desktop_lnk = os.path.join(desktop, "PsyClaw WebUI.lnk")
    start_menu_lnk = os.path.join(windows_start_menu_dir(), "PsyClaw.lnk")
    return desktop_lnk, start_menu_lnk


def windows_shortcuts(root: str) -> tuple[str, str]:
    desktop_lnk, start_menu_lnk = windows_shortcut_paths(root)
    os.makedirs(os.path.dirname(start_menu_lnk), exist_ok=True)
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
function New-PsyClawShortcut([string]$path) {{
  $s = $w.CreateShortcut($path)
  $s.TargetPath = '{bat.replace("'", "''")}'
  $s.WorkingDirectory = '{root.replace("'", "''")}'
  $s.WindowStyle = 1
  $s.Description = 'PsyClaw WebUI (local lab)'
  if (Test-Path -LiteralPath '{ico.replace("'", "''")}') {{ $s.IconLocation = '{ico.replace("'", "''")},0' }}
  $s.Save()
}}
New-PsyClawShortcut '{desktop_lnk.replace("'", "''")}'
New-PsyClawShortcut '{start_menu_lnk.replace("'", "''")}'
"""
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        check=True,
    )
    return desktop_lnk, start_menu_lnk


def windows_shortcut(root: str) -> str:
    """Backward-compatible desktop-only return value for external callers."""
    desktop_lnk, _ = windows_shortcuts(root)
    return desktop_lnk


# ── Linux ────────────────────────────────────────────────────────────

def linux_desktop(root: str) -> str:
    apps = os.path.join(os.path.expanduser("~"), ".local", "share", "applications")
    os.makedirs(apps, exist_ok=True)
    path = os.path.join(apps, "PsyClaw.desktop")
    sh = os.path.join(root, "start.sh")
    icon = icon_png(root)
    body = f"""[Desktop Entry]
Type=Application
Name=PsyClaw
GenericName=PsyClaw WebUI
Comment=Local lab software for .psyclaw experiments
Exec={sh}
Path={root}
Icon={icon}
Terminal=false
Categories=Science;Education;
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    os.chmod(sh, 0o755)
    os.chmod(path, 0o755)
    return path


# ── macOS ────────────────────────────────────────────────────────────

def macos_app_bundle(root: str) -> str:
    """Create ~/Applications/PsyClaw.app bundle (Launchpad / Spotlight visible)."""
    app_dir = os.path.join(os.path.expanduser("~"), "Applications", "PsyClaw.app")
    contents = os.path.join(app_dir, "Contents")
    macos_dir = os.path.join(contents, "MacOS")
    resources = os.path.join(contents, "Resources")
    os.makedirs(macos_dir, exist_ok=True)
    os.makedirs(resources, exist_ok=True)

    # Info.plist
    plist = os.path.join(contents, "Info.plist")
    plist_body = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>PsyClaw</string>
    <key>CFBundleDisplayName</key>
    <string>PsyClaw</string>
    <key>CFBundleIdentifier</key>
    <string>io.psyclaw.webui</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>PsyClaw</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>10.9</string>
</dict>
</plist>
"""
    with open(plist, "w", encoding="utf-8") as f:
        f.write(plist_body)

    # Copy icon
    icns = icon_icns(root)
    if os.path.isfile(icns):
        dst_icns = os.path.join(resources, "icon.icns")
        if os.path.abspath(icns) != os.path.abspath(dst_icns):
            import shutil
            shutil.copy2(icns, dst_icns)

    # Executable stub — launches start.command silently
    start_command = os.path.join(root, "start.command")
    try:
        os.chmod(start_command, 0o755)
    except OSError:
        pass
    exe = os.path.join(macos_dir, "PsyClaw")
    exe_body = f"""#!/bin/bash
cd "{root}"
exec "{start_command}" "$@"
"""
    with open(exe, "w", encoding="utf-8") as f:
        f.write(exe_body)
    os.chmod(exe, 0o755)

    return app_dir


# ── main ─────────────────────────────────────────────────────────────

def main() -> int:
    root = repo_root()
    try:
        from user_config import remember_webui_root

        cfg = remember_webui_root(root)
        print(f"remembered webui_root - {cfg}")
    except Exception as exc:
        print(f"remember skipped: {exc}")
    plat = sys.platform
    print(f"repo: {root}")
    if plat == "win32":
        desktop_lnk, start_menu_lnk = windows_shortcuts(root)
        print(f"Desktop shortcut: {desktop_lnk}")
        print(f"Start Menu shortcut: {start_menu_lnk}")
    elif plat == "darwin":
        app = macos_app_bundle(root)
        print(f"macOS app bundle: {app}")
        print("Find it in Launchpad or Spotlight (search: PsyClaw)")
    else:
        out = linux_desktop(root)
        print(f"Desktop entry: {out}")
        print("Find it in your app menu (search: PsyClaw)")
    print(f"icons: {icon_png(root)} | {icon_ico(root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
