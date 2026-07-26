"""WebUI folder-open parity checks."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, Union


def _ensure_webui_path() -> None:
    mono = Path(__file__).resolve().parents[2]
    webui = mono / "webui"
    if str(webui) not in sys.path:
        sys.path.insert(0, str(webui))


def check_open_parity(project: Union[str, Path]) -> Dict[str, Any]:
    project = Path(project).resolve()
    _ensure_webui_path()
    from backend.designs_store import classify_folder, read_design  # type: ignore

    classified = classify_folder(project)
    classify = classified.get("status") or "foreign"
    marker_name = f"{project.name}.psyclaw"
    marker_path = project / marker_name
    same_design = False
    err = None

    if marker_path.is_file() and classify == "project":
        design, err = read_design(project)
        if design is not None:
            on_disk = json.loads(marker_path.read_text(encoding="utf-8"))
            # equal or at least same name + flow present
            same_design = (
                on_disk == design
                or (
                    on_disk.get("name") == design.get("name")
                    and bool(design.get("flow"))
                    and bool(design.get("routines"))
                )
            )

    ok = classify == "project" and marker_path.is_file() and same_design and err is None
    return {
        "ok": ok,
        "classify": classify,
        "marker": marker_name if marker_path.is_file() else None,
        "same_design": same_design,
        "raw": classified,
        "error": err,
    }
