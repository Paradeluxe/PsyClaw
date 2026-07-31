"""Design-side preflight checks for Run (alongside host hardware gate).

Analyzes Builder design JSON (+ optional project folder) and returns a checklist:
  status: pass | warn | fail
  overall: run | pilot | block  (aligned with host computeRunGate levels)

v1 focus (user 2026-07-31):
  - practice vs formal structure
  - materials readiness (files + replication.json gap)
  - minimal structure (flow/routines)
  - scoring keys when keyboard present
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


PRACTICE_RE = re.compile(
    r"practice|practise|train|training|练习|訓練|训练|prac[_-]?",
    re.I,
)
INSTR_RE = re.compile(r"instruct|intro|welcome|指导|說明|说明|안내", re.I)
MEDIA_TYPES = frozenset({"image", "sound", "audio", "video", "movie"})
MEDIA_PARAM_KEYS = (
    "image",
    "file",
    "movie",
    "sound",
    "stimulus",
    "stim",
    "path",
)


def _walk_flow(nodes: Any):
    if not isinstance(nodes, list):
        return
    for n in nodes:
        if not isinstance(n, dict):
            continue
        yield n
        ch = n.get("children")
        if isinstance(ch, list):
            yield from _walk_flow(ch)


def _routine_names(design: dict) -> List[str]:
    out = []
    for r in design.get("routines") or []:
        if isinstance(r, dict) and r.get("name"):
            out.append(str(r["name"]))
    return out


def _all_component_types(design: dict) -> List[str]:
    types: List[str] = []
    for r in design.get("routines") or []:
        if not isinstance(r, dict):
            continue
        for c in r.get("components") or []:
            if isinstance(c, dict) and c.get("type"):
                types.append(str(c["type"]).lower())
    return types


def _param_strings(obj: Any) -> List[str]:
    out: List[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str):
                out.append(v)
            else:
                out.extend(_param_strings(v))
    elif isinstance(obj, list):
        for x in obj:
            out.extend(_param_strings(x))
    return out


def _looks_like_path(s: str) -> bool:
    s = (s or "").strip()
    if not s or s.startswith("$"):
        return False
    low = s.lower()
    if any(low.endswith(ext) for ext in (
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp",
        ".wav", ".mp3", ".ogg", ".flac",
        ".mp4", ".mov", ".avi", ".mkv", ".webm",
    )):
        return True
    if "/" in s or "\\" in s:
        return True
    return False


def _estimate_trial_steps(design: dict) -> int:
    """Rough formal trial count from top-level loops (nReps × conditions rows)."""
    total = 0
    for n in _walk_flow(design.get("flow") or []):
        if n.get("kind") != "loop":
            continue
        name = str(n.get("name") or "")
        if PRACTICE_RE.search(name):
            continue
        n_reps = int(n.get("nReps") or 1)
        cond = n.get("conditions")
        n_cond = len(cond) if isinstance(cond, list) and cond else 1
        # count leaf routines under loop
        leaves = 0
        for ch in _walk_flow(n.get("children") or []):
            if ch.get("kind") == "routine":
                leaves += 1
        if leaves == 0:
            leaves = 1
        total += n_reps * n_cond * leaves
    return total


def _load_replication_meta(project_path: Optional[str]) -> Optional[dict]:
    if not project_path:
        return None
    p = Path(project_path) / "replication.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _check_media_files(design: dict, project_path: Optional[str]) -> Tuple[str, str, List[str]]:
    """Return (status, detail, missing_paths)."""
    missing: List[str] = []
    referenced = 0
    root = Path(project_path) if project_path else None

    # component media params
    for r in design.get("routines") or []:
        if not isinstance(r, dict):
            continue
        for c in r.get("components") or []:
            if not isinstance(c, dict):
                continue
            ctype = str(c.get("type") or "").lower()
            params = c.get("params") if isinstance(c.get("params"), dict) else {}
            candidates = []
            if ctype in MEDIA_TYPES:
                for k in MEDIA_PARAM_KEYS:
                    if k in params and isinstance(params[k], str):
                        candidates.append(params[k])
            for k, v in (params or {}).items():
                if isinstance(v, str) and (
                    k.lower() in MEDIA_PARAM_KEYS or _looks_like_path(v)
                ):
                    candidates.append(v)
            for raw in candidates:
                if not isinstance(raw, str) or raw.startswith("$"):
                    continue
                if not _looks_like_path(raw):
                    continue
                referenced += 1
                if root is None:
                    continue
                fp = Path(raw)
                if not fp.is_absolute():
                    fp = root / raw
                if not fp.is_file():
                    missing.append(raw)

    # conditionsFile paths
    for n in _walk_flow(design.get("flow") or []):
        if n.get("kind") != "loop":
            continue
        cf = n.get("conditionsFile")
        if isinstance(cf, str) and cf.strip() and not cf.startswith("$"):
            referenced += 1
            if root is not None:
                fp = Path(cf)
                if not fp.is_absolute():
                    fp = root / cf
                if not fp.is_file() and not (root / "assets" / Path(cf).name).is_file():
                    # only flag if looks like external file and conditions empty
                    cond = n.get("conditions")
                    if not (isinstance(cond, list) and len(cond) > 0):
                        missing.append(cf)

    if missing:
        show = missing[:5]
        more = f" (+{len(missing) - 5} more)" if len(missing) > 5 else ""
        return "warn", "Missing media/files: " + ", ".join(show) + more, missing
    if referenced == 0:
        return "pass", "No external media file paths in design", []
    return "pass", f"{referenced} media path(s) resolved", []


def analyze_design(
    design: Optional[dict],
    project_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Return preflight payload for API / UI."""
    checks: List[Dict[str, Any]] = []

    if not design or not isinstance(design, dict):
        checks.append(
            {
                "id": "design_present",
                "label": "Design loaded",
                "status": "fail",
                "detail": "No design in Builder",
            }
        )
        return {
            "ok": False,
            "overall": "block",
            "level": "block",
            "css": "fail",
            "label": "Design blocked",
            "reason": "No design",
            "checks": checks,
        }

    routines = design.get("routines") or []
    flow = design.get("flow") or []
    rnames = _routine_names(design)

    # 1) structure
    if not routines:
        checks.append(
            {
                "id": "routines",
                "label": "Routines",
                "status": "fail",
                "detail": "No routines in design",
            }
        )
    else:
        checks.append(
            {
                "id": "routines",
                "label": "Routines",
                "status": "pass",
                "detail": f"{len(routines)} routine(s)",
            }
        )

    if not flow:
        checks.append(
            {
                "id": "flow",
                "label": "Mission flow",
                "status": "fail",
                "detail": "Flow is empty — nothing to run",
            }
        )
    else:
        checks.append(
            {
                "id": "flow",
                "label": "Mission flow",
                "status": "pass",
                "detail": f"{len(flow)} top-level step(s)",
            }
        )

    # 2) practice segment
    practice_hit = False
    practice_where = []
    for name in rnames:
        if PRACTICE_RE.search(name or ""):
            practice_hit = True
            practice_where.append(f"routine:{name}")
    for n in _walk_flow(flow):
        nm = str(n.get("name") or n.get("routine") or "")
        if PRACTICE_RE.search(nm):
            practice_hit = True
            kind = n.get("kind") or "node"
            practice_where.append(f"{kind}:{nm}")
    if practice_hit:
        checks.append(
            {
                "id": "practice",
                "label": "Practice vs formal",
                "status": "pass",
                "detail": "Practice marked: " + ", ".join(practice_where[:4]),
            }
        )
    else:
        checks.append(
            {
                "id": "practice",
                "label": "Practice vs formal",
                "status": "warn",
                "detail": (
                    "No practice loop/routine found "
                    "(name with practice/train/练习). "
                    "Formal runs often need a practice block first."
                ),
                "fix_hint": "Add a practice loop or rename a routine to include 'practice'.",
            }
        )

    # 3) instructions
    instr_hit = any(INSTR_RE.search(n) for n in rnames)
    if not instr_hit:
        for n in _walk_flow(flow):
            nm = str(n.get("name") or n.get("routine") or "")
            if INSTR_RE.search(nm):
                instr_hit = True
                break
    if instr_hit:
        checks.append(
            {
                "id": "instructions",
                "label": "Instructions",
                "status": "pass",
                "detail": "Instructions-like routine present",
            }
        )
    else:
        checks.append(
            {
                "id": "instructions",
                "label": "Instructions",
                "status": "warn",
                "detail": "No instructions/intro routine detected",
                "fix_hint": "Add an instructions routine before trials.",
            }
        )

    # 4) materials / replication gap
    meta = _load_replication_meta(project_path)
    mat_status = None
    if isinstance(meta, dict):
        mat_status = meta.get("material_status")
        gap = meta.get("material_gap") if isinstance(meta.get("material_gap"), dict) else None
        placeholder = bool(meta.get("placeholder") or (gap or {}).get("placeholder_mode"))
        if mat_status in {"gated", "missing", "licensed"} or placeholder:
            msg = None
            if gap:
                msg = gap.get("user_message") or gap.get("why_missing")
            if not msg:
                msg = f"material_status={mat_status or 'unknown'} — placeholder / incomplete materials"
            drop = (gap or {}).get("drop_dir") or f"experiments assets under project"
            checks.append(
                {
                    "id": "materials",
                    "label": "Materials",
                    "status": "warn",
                    "detail": msg,
                    "fix_hint": (
                        (gap or {}).get("how_to_fill")
                        or f"Place real stimuli in {drop}, update conditions, set material_status=ready."
                    ),
                    "material_status": mat_status,
                    "placeholder": True,
                }
            )
        elif mat_status == "ready":
            checks.append(
                {
                    "id": "materials",
                    "label": "Materials",
                    "status": "pass",
                    "detail": "replication.json material_status=ready",
                    "material_status": "ready",
                }
            )

    # file-level media (always)
    m_status, m_detail, m_missing = _check_media_files(design, project_path)
    # only add separate media_files check if we didn't already warn materials, or if files missing
    if m_status != "pass" or not any(c["id"] == "materials" for c in checks):
        if m_status == "warn" or not any(c["id"] == "materials" for c in checks):
            # avoid duplicate pass noise if materials already set
            if not (m_status == "pass" and any(c["id"] == "materials" for c in checks)):
                checks.append(
                    {
                        "id": "media_files",
                        "label": "Media files",
                        "status": m_status,
                        "detail": m_detail,
                        "missing": m_missing[:20],
                        "fix_hint": (
                            "Put missing files under the project folder (or assets/) and fix paths."
                            if m_missing
                            else None
                        ),
                    }
                )

    # 5) scoring keys
    ctypes = _all_component_types(design)
    has_kb = any(t in {"keyboard", "key", "kb"} for t in ctypes)
    if has_kb:
        has_corr = False
        for n in _walk_flow(flow):
            if n.get("kind") != "loop":
                continue
            cond = n.get("conditions")
            if not isinstance(cond, list):
                continue
            for row in cond:
                if not isinstance(row, dict):
                    continue
                for k in ("corrAns", "correctAns", "correct", "corr"):
                    if k in row and row[k] not in (None, ""):
                        # skip pure 0/1 that might be precomputed
                        if k in ("correct", "corr") and str(row[k]) in {"0", "1"}:
                            continue
                        has_corr = True
                        break
                if has_corr:
                    break
            if has_corr:
                break
        if has_corr:
            checks.append(
                {
                    "id": "scoring",
                    "label": "Scoring keys",
                    "status": "pass",
                    "detail": "corrAns (or equivalent) present in conditions",
                }
            )
        else:
            checks.append(
                {
                    "id": "scoring",
                    "label": "Scoring keys",
                    "status": "warn",
                    "detail": "Keyboard present but no corrAns/correctAns in stimlist",
                    "fix_hint": "Add corrAns column for scored trials.",
                }
            )
    else:
        checks.append(
            {
                "id": "scoring",
                "label": "Scoring keys",
                "status": "pass",
                "detail": "No keyboard component — scoring N/A",
            }
        )

    # 6) trial volume hint
    n_trials = _estimate_trial_steps(design)
    if n_trials <= 0 and flow:
        checks.append(
            {
                "id": "trial_count",
                "label": "Trial estimate",
                "status": "warn",
                "detail": "Could not estimate formal trials (empty loops?)",
            }
        )
    elif n_trials > 2000:
        checks.append(
            {
                "id": "trial_count",
                "label": "Trial estimate",
                "status": "warn",
                "detail": f"~{n_trials} steps — very long session?",
            }
        )
    else:
        checks.append(
            {
                "id": "trial_count",
                "label": "Trial estimate",
                "status": "pass",
                "detail": f"~{n_trials} formal trial-steps (excl. practice-named loops)",
            }
        )

    # overall
    statuses = [c.get("status") for c in checks]
    if "fail" in statuses:
        overall = "block"
        css = "fail"
        label = "Design blocked"
        reason = next(c["detail"] for c in checks if c.get("status") == "fail")
    elif "warn" in statuses:
        overall = "pilot"  # warn: Start still allowed in UI, but badge shows caution
        css = "warn"
        label = "Design warnings"
        reason = next(c["detail"] for c in checks if c.get("status") == "warn")
    else:
        overall = "run"
        css = "pass"
        label = "Design ready"
        reason = "Design preflight OK"

    return {
        "ok": "fail" not in statuses,
        "overall": overall,
        "level": overall,
        "css": css,
        "label": label,
        "reason": reason,
        "checks": checks,
        "counts": {
            "pass": sum(1 for s in statuses if s == "pass"),
            "warn": sum(1 for s in statuses if s == "warn"),
            "fail": sum(1 for s in statuses if s == "fail"),
        },
        "project_path": project_path,
    }
