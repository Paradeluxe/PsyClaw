#!/usr/bin/env python3
"""Persist lab paths under the user home (survives skill reinstalls).

Config file: ``~/.psyclaw/config.json``

  {
      "webui_root": "C:/Users/You/psyclaw/webui"
    }

  Resolve order for webui (callers / agents):
    1. env ``PSYCLAW_WEBUI_ROOT`` (if path exists)
    2. ``webui_root`` in this config (if path exists)
    3. default ``~/psyclaw/webui`` (if path exists)
    4. unset → ask user / first-time install
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional


def config_dir() -> Path:
    return Path.home() / ".psyclaw"


def config_path() -> Path:
    return config_dir() / "config.json"


def default_webui_root() -> Path:
    return Path.home() / "psyclaw" / "webui"


def _looks_like_webui(path: Path) -> bool:
    if not path.is_dir():
        return False
    return (path / "backend" / "app.py").is_file() or (path / "start.py").is_file()


def load() -> Dict[str, Any]:
    p = config_path()
    if not p.is_file():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save(data: Dict[str, Any]) -> Path:
    d = config_dir()
    d.mkdir(parents=True, exist_ok=True)
    path = config_path()
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


def remember_webui_root(root: str | Path) -> Path:
    """Write absolute webui path; return config file path."""
    abs_root = str(Path(root).expanduser().resolve())
    data = load()
    data["webui_root"] = abs_root
    out = save(data)
    return out


def remember_psychopy_python(path: str | Path) -> Path:
    """Persist a verified PsychoPy interpreter path so survives restarts."""
    abs_path = str(Path(path).expanduser().resolve())
    data = load()
    data["psychopy_python"] = abs_path
    out = save(data)
    return out


def saved_psychopy_python() -> Optional[str]:
    """Return the persisted PsychoPy interpreter path, or None."""
    data = load()
    p = data.get("psychopy_python")
    if not p:
        return None
    if Path(p).is_file():
        return str(p)
    return None


def resolve_webui_root(*, remember_if_found: bool = False) -> Optional[str]:
    """Return existing webui directory or None."""
    candidates = []

    env = (os.environ.get("PSYCLAW_WEBUI_ROOT") or "").strip()
    if env:
        candidates.append(Path(env).expanduser())

    cfg = load().get("webui_root")
    if cfg:
        candidates.append(Path(str(cfg)).expanduser())

    candidates.append(default_webui_root())

    seen = set()
    for c in candidates:
        try:
            key = str(c.resolve()) if c.exists() else str(c)
        except OSError:
            key = str(c)
        if key in seen:
            continue
        seen.add(key)
        try:
            rp = c.expanduser()
            if _looks_like_webui(rp):
                abs_p = str(rp.resolve())
                if remember_if_found:
                    remember_webui_root(abs_p)
                return abs_p
        except OSError:
            continue
    return None


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[1] in ("remember", "set"):
        if len(argv) < 3:
            # remember this repo (parent of scripts/)
            here = Path(__file__).resolve().parent.parent
            root = here
        else:
            root = Path(argv[2])
        if not _looks_like_webui(root):
            print(f"not a webui tree: {root}", file=sys.stderr)
            return 1
        cfg = remember_webui_root(root)
        print(f"webui_root={Path(root).resolve()}")
        print(f"config={cfg}")
        return 0

    if len(argv) >= 2 and argv[1] in ("show", "get", "resolve"):
        p = resolve_webui_root(remember_if_found=False)
        if not p:
            print("webui_root=(not found)")
            print(f"config={config_path()} exists={config_path().is_file()}")
            print(f"env_PSYCLAW_WEBUI_ROOT={os.environ.get('PSYCLAW_WEBUI_ROOT') or ''}")
            return 1
        print(p)
        return 0

    print("Usage:")
    print("  python scripts/user_config.py remember [path]  # default: this repo")
    print("  python scripts/user_config.py show")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
