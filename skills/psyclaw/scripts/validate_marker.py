#!/usr/bin/env python3
"""Validate a <folderName>.psyclaw marker (hard checks 1–7).

Usage:
  python scripts/validate_marker.py path/to/MyExp/MyExp.psyclaw
  python scripts/validate_marker.py path/to/MyExp/          # finds <basename>.psyclaw
  python scripts/validate_marker.py path/to/file.psyclaw --json

Exit: 0 = hard pass (soft warns allowed); 1 = hard fail; 2 = usage/IO error.
Optional --compile: if webui design_compiler importable, require Window in output.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

STIM_TYPES = frozenset(
    {
        "text",
        "image",
        "sound",
        "audio",
        "video",
        "movie",
        "rect",
        "polygon",
        "circle",
        "slider",
        "code",
        "movieStim",
    }
)
RESP_TYPES = frozenset(
    {
        "keyboard",
        "mouse",
        "slider",
        "rating",
        "microphone",
        "mic",
        "joy",
        "joystick",
        "button",
    }
)
# slider can be stim or resp — counts for either in skeleton check


def _resolve_marker(path: Path) -> Path:
    path = path.expanduser().resolve()
    if path.is_dir():
        name = path.name
        cand = path / f"{name}.psyclaw"
        if cand.is_file():
            return cand
        hits = sorted(path.glob("*.psyclaw"))
        if len(hits) == 1:
            return hits[0]
        raise FileNotFoundError(
            f"no marker in dir (want {name}.psyclaw); found {[h.name for h in hits]}"
        )
    if path.is_file():
        return path
    raise FileNotFoundError(str(path))


def _walk_flow(nodes: Any):
    if not isinstance(nodes, list):
        return
    for n in nodes:
        if not isinstance(n, dict):
            continue
        yield n
        kids = n.get("children")
        if isinstance(kids, list):
            yield from _walk_flow(kids)


def validate(marker_path: Path, *, try_compile: bool = False) -> dict[str, Any]:
    hard: list[dict[str, str]] = []
    soft: list[dict[str, str]] = []

    def fail(code: str, msg: str) -> None:
        hard.append({"id": code, "msg": msg})

    def warn(code: str, msg: str) -> None:
        soft.append({"id": code, "msg": msg})

    # 1 File
    try:
        mp = marker_path.resolve()
    except Exception as e:
        return {
            "ok": False,
            "marker": str(marker_path),
            "hard": [{"id": "1", "msg": f"path error: {e}"}],
            "soft": [],
            "compile": None,
        }

    if not mp.is_file():
        fail("1", f"file missing: {mp}")
        return {"ok": False, "marker": str(mp), "hard": hard, "soft": soft, "compile": None}

    project_dir = mp.parent
    folder_name = project_dir.name
    expected = f"{folder_name}.psyclaw"
    if mp.name != expected:
        fail("1", f"filename must be {expected!r} (got {mp.name!r})")

    # 2 JSON
    try:
        text = mp.read_text(encoding="utf-8")
        data = json.loads(text)
    except UnicodeDecodeError as e:
        fail("2", f"not UTF-8: {e}")
        return {"ok": False, "marker": str(mp), "hard": hard, "soft": soft, "compile": None}
    except json.JSONDecodeError as e:
        fail("2", f"JSON parse error: {e}")
        return {"ok": False, "marker": str(mp), "hard": hard, "soft": soft, "compile": None}

    if not isinstance(data, dict):
        fail("2", f"top-level must be object, got {type(data).__name__}")
        return {"ok": False, "marker": str(mp), "hard": hard, "soft": soft, "compile": None}

    # 7 No parallel schema (spot banned keys / wrong deliverable shape)
    banned_top = {"Builder", "psyexp", "experiments", "routines_xml"}
    for k in banned_top:
        if k in data:
            fail("7", f"banned top-level key suggesting parallel schema: {k}")

    # 3 Shape
    routines = data.get("routines")
    flow = data.get("flow")
    if not isinstance(routines, list) or len(routines) == 0:
        fail("3", "routines must be a non-empty array")
        routines = []
    if not isinstance(flow, list) or len(flow) == 0:
        fail("3", "flow must be a non-empty array")
        flow = []

    routine_names: set[str] = set()
    if isinstance(routines, list):
        for i, r in enumerate(routines):
            if not isinstance(r, dict):
                fail("3", f"routines[{i}] must be object")
                continue
            rn = r.get("name")
            if not rn or not isinstance(rn, str):
                fail("3", f"routines[{i}] missing string name")
            else:
                if rn in routine_names:
                    fail("3", f"duplicate routine name: {rn}")
                routine_names.add(rn)
            comps = r.get("components")
            if comps is not None and not isinstance(comps, list):
                fail("3", f"routine {rn!r} components must be array")

            # T1 timing: start/duration are seconds; reject raw-ms dumps
            if isinstance(comps, list):
                notes = data.get("design_notes") if isinstance(data.get("design_notes"), dict) else {}
                generated = notes.get("source") == "replication150"
                for ci, c in enumerate(comps):
                    if not isinstance(c, dict):
                        continue
                    cpath = f"routines[{i}].components[{ci}]"
                    if "duration_ms" in c or "start_ms" in c:
                        fail("T1", f"{cpath} must not use duration_ms/start_ms; use seconds on duration/start")
                    for field in ("start", "duration"):
                        if field not in c:
                            continue
                        val = c[field]
                        try:
                            num = float(val)
                        except (TypeError, ValueError):
                            fail("T1", f"{cpath}.{field} must be a number (seconds) or duration=-1")
                            continue
                        if field == "start":
                            if not math.isfinite(num) or num < 0:
                                fail("T1", f"{cpath}.start must be finite >= 0 (seconds); got {val!r}")
                            continue
                        # duration
                        if num == -1:
                            continue
                        if not math.isfinite(num) or num < 0:
                            fail("T1", f"{cpath}.duration must be finite >= 0 or -1 (seconds); got {val!r}")
                            continue
                        if generated and num > 30:
                            fail(
                                "T1",
                                f"{cpath}.duration={num} looks like raw ms; marker duration is seconds "
                                f"(e.g. 1500ms→1.5)",
                            )
                        elif num >= 300:
                            fail(
                                "T1",
                                f"{cpath}.duration={num}s is implausibly long; check ms/s unit mixup",
                            )
                        elif num > 30:
                            warn(
                                "T1",
                                f"{cpath}.duration={num}s is long; confirm intentional seconds not ms",
                            )

    # 4 Routine refs + 5 Loop kids
    if isinstance(flow, list):
        for n in _walk_flow(flow):
            kind = n.get("kind")
            if kind == "routine":
                ref = n.get("routine")
                if not ref or not isinstance(ref, str):
                    fail("4", "flow routine node missing string 'routine'")
                elif routine_names and ref not in routine_names:
                    fail("4", f"flow references unknown routine: {ref!r}")
            elif kind == "loop":
                kids = n.get("children")
                if not isinstance(kids, list) or len(kids) == 0:
                    fail("5", f"loop {n.get('name')!r} needs non-empty children")
                if "nReps" not in n:
                    fail("5", f"loop {n.get('name')!r} missing nReps")
                else:
                    try:
                        nr = int(n["nReps"])
                        if nr < 1:
                            fail("5", f"loop {n.get('name')!r} nReps must be >= 1 (got {nr})")
                    except (TypeError, ValueError):
                        fail("5", f"loop {n.get('name')!r} nReps not int-like: {n.get('nReps')!r}")
            elif kind is None:
                fail("3", f"flow node missing kind: {n!r}"[:120])
            # other kinds ignored

    # 6 Trial skeleton — at least one loop-used routine has stim + response
    loop_routine_names: set[str] = set()
    if isinstance(flow, list):
        for n in _walk_flow(flow):
            if n.get("kind") == "loop":
                for c in _walk_flow(n.get("children") or []):
                    if c.get("kind") == "routine" and isinstance(c.get("routine"), str):
                        loop_routine_names.add(c["routine"])

    def routine_by_name(name: str) -> dict | None:
        for r in routines if isinstance(routines, list) else []:
            if isinstance(r, dict) and r.get("name") == name:
                return r
        return None

    def types_in(r: dict) -> set[str]:
        out: set[str] = set()
        for c in r.get("components") or []:
            if isinstance(c, dict) and isinstance(c.get("type"), str):
                out.add(c["type"].lower())
        return out

    skeleton_ok = False
    if not loop_routine_names:
        # no loop — still require some routine with stim+resp if any routine exists
        targets = list(routine_names)
    else:
        targets = list(loop_routine_names)

    for rn in targets:
        r = routine_by_name(rn)
        if not r:
            continue
        ts = types_in(r)
        has_stim = bool(ts & STIM_TYPES) or bool(ts & {"slider"})  # slider dual
        has_resp = bool(ts & RESP_TYPES)
        # text-only instructions don't satisfy; need both classes
        # keyboard alone without stim fails
        if has_stim and has_resp:
            skeleton_ok = True
            break
        # keyboard + text counts (text is stim)
        if "text" in ts and "keyboard" in ts:
            skeleton_ok = True
            break

    if targets and not skeleton_ok:
        fail(
            "6",
            "no loop/trial routine with stimulus-like + response component "
            "(text/image/… + keyboard/slider/…); waive only if intentional non-response task",
        )

    # Soft
    name = data.get("name")
    if not name:
        warn("A", f"missing name — prefer {folder_name!r}")
    elif name != folder_name:
        warn("A", f"name {name!r} != folder {folder_name!r}")
    if not data.get("display"):
        warn("B", "missing display — webui may default")
    if not data.get("devices"):
        warn("C", "missing devices")
    # conditions / corrAns
    has_cond = False
    has_corr = False
    if isinstance(flow, list):
        for n in _walk_flow(flow):
            if n.get("kind") == "loop":
                cond = n.get("conditions")
                if isinstance(cond, list) and cond:
                    has_cond = True
                    for row in cond:
                        if isinstance(row, dict) and (
                            "corrAns" in row or "correctAns" in row or "correct" in row
                        ):
                            has_corr = True
    if loop_routine_names and not has_cond:
        warn("D", "loops without embedded conditions — ok if conditionsFile only")
    if has_cond and not has_corr:
        warn("D", "conditions present but no corrAns/correctAns — scoring may be empty")
    if not data.get("design_notes"):
        warn("F", "missing design_notes")

    compile_info = None
    if try_compile and not hard:
        compile_info = _try_compile(data)

    ok = len(hard) == 0 and (
        compile_info is None or compile_info.get("ok") is True
    )
    if try_compile and compile_info and not compile_info.get("ok"):
        hard.append({"id": "C1", "msg": compile_info.get("error") or "compile failed"})
        ok = False

    return {
        "ok": ok,
        "marker": str(mp),
        "folder": folder_name,
        "hard": hard,
        "soft": soft,
        "compile": compile_info,
    }


def _try_compile(design: dict) -> dict[str, Any]:
    """Best-effort: import monorepo/webui design_compiler if on path or via config."""
    candidates: list[Path] = []
    # sibling monorepo: skills/psyclaw -> repo/webui/backend
    here = Path(__file__).resolve()
    mono_backend = here.parents[3] / "webui" / "backend"  # .../psyclaw/webui/backend
    if (mono_backend / "design_compiler.py").is_file():
        candidates.append(mono_backend)
    # ~/.psyclaw/config.json webui_root
    cfg = Path.home() / ".psyclaw" / "config.json"
    if cfg.is_file():
        try:
            wr = json.loads(cfg.read_text(encoding="utf-8")).get("webui_root")
            if wr:
                b = Path(wr) / "backend"
                if (b / "design_compiler.py").is_file():
                    candidates.append(b)
        except Exception:
            pass

    last_err = "design_compiler not found"
    for backend in candidates:
        try:
            sys.path.insert(0, str(backend))
            import design_compiler as dc  # type: ignore

            out = dc.compile_any(design=design)
            if isinstance(out, str) and "Window" in out:
                return {"ok": True, "backend": str(backend), "chars": len(out)}
            return {
                "ok": False,
                "backend": str(backend),
                "error": "compile output missing Window",
            }
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
        finally:
            if str(backend) in sys.path:
                try:
                    sys.path.remove(str(backend))
                except ValueError:
                    pass
    return {"ok": False, "error": last_err}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Validate PsyClaw marker hard checks 1–7")
    ap.add_argument("path", help="path to .psyclaw or project folder")
    ap.add_argument("--json", action="store_true", help="print JSON report only")
    ap.add_argument(
        "--compile",
        action="store_true",
        help="optional C1: compile via webui design_compiler if available",
    )
    args = ap.parse_args(argv)

    try:
        mp = _resolve_marker(Path(args.path))
    except FileNotFoundError as e:
        if args.json:
            print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        else:
            print(f"psyclaw validate: ERROR {e}", file=sys.stderr)
        return 2

    report = validate(mp, try_compile=args.compile)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("psyclaw validate")
        print(f"  marker: {report.get('marker')}")
        print(f"  folder: {report.get('folder')}")
        if report["hard"]:
            print("  hard FAIL:")
            for h in report["hard"]:
                print(f"    [{h['id']}] {h['msg']}")
        else:
            print("  hard: OK (1–7)")
        if report["soft"]:
            print("  soft warn:")
            for s in report["soft"]:
                print(f"    [{s['id']}] {s['msg']}")
        else:
            print("  soft: (none)")
        if report.get("compile") is not None:
            c = report["compile"]
            st = "OK" if c.get("ok") else "FAIL"
            print(f"  compile C1: {st} — {c}")
        print(f"  result: {'PASS' if report['ok'] else 'FAIL'}")
        print("  json:", json.dumps({"ok": report["ok"], "marker": report.get("marker")}, ensure_ascii=False))

    if report["ok"]:
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
