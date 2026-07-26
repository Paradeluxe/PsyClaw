"""Static marker + optional compile gate with structured evidence."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Union


def _mono_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _load_validate_marker():
    script = _mono_root() / "skills" / "psyclaw" / "scripts" / "validate_marker.py"
    spec = importlib.util.spec_from_file_location("psyclaw_validate_marker", script)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def _compile_code(design: dict) -> str:
    backend = _mono_root() / "webui" / "backend"
    sys.path.insert(0, str(backend))
    try:
        import design_compiler as dc  # type: ignore

        out = dc.compile_any(design=design)
        if not isinstance(out, str):
            raise TypeError(f"unexpected compile type: {type(out)}")
        return out
    finally:
        try:
            sys.path.remove(str(backend))
        except ValueError:
            pass


def _canonical_marker_path(project: Path) -> Path | None:
    cand = project / f"{project.name}.psyclaw"
    return cand if cand.is_file() else None


def _hard_msgs(hard: List[Any]) -> List[str]:
    out = []
    for h in hard or []:
        if isinstance(h, dict):
            out.append(str(h.get("msg") or h.get("id") or h))
        else:
            out.append(str(h))
    return out


def validate_project(
    project: Union[str, Path],
    *,
    compile_marker: bool = False,
) -> Dict[str, Any]:
    project = Path(project)
    marker = _canonical_marker_path(project)
    marker_name_ok = marker is not None
    banned = list(project.glob("*.psyexp"))
    if not marker_name_ok:
        return {
            "ok": False,
            "marker_name_ok": False,
            "banned_suffix_count": len(banned),
            "hard": ["missing_canonical_marker"],
            "soft": [],
            "compiled_sha256": None,
        }

    mod = _load_validate_marker()
    result = mod.validate(marker, try_compile=compile_marker)
    hard = _hard_msgs(result.get("hard") or [])
    soft = _hard_msgs(result.get("soft") or [])
    ok = bool(result.get("ok")) and not banned

    compiled_sha = None
    if compile_marker:
        try:
            design = json.loads(marker.read_text(encoding="utf-8"))
            code = _compile_code(design)
            if "Window" not in code:
                ok = False
                hard.append("compile_missing_Window")
            compiled_sha = hashlib.sha256(code.encode("utf-8")).hexdigest()
        except Exception as exc:
            ok = False
            hard.append(f"compile_error:{exc}")
            compiled_sha = None
            # if validate already said compile ok, still try to surface hash failure
            if result.get("compile", {}).get("ok") and compiled_sha is None:
                # deterministic stand-in only when code unavailable but validate passed
                # Prefer failure over fake hash
                pass

    return {
        "ok": ok and marker_name_ok,
        "marker_name_ok": marker_name_ok,
        "banned_suffix_count": len(banned),
        "hard": hard,
        "soft": soft,
        "compiled_sha256": compiled_sha,
        "marker": str(marker),
    }
