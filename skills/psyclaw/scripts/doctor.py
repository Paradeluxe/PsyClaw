#!/usr/bin/env python3
"""psyclaw skill doctor — local package health (no network)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from shutil import which

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "SKILL.md",
    "scripts/doctor.py",
    "scripts/validate_marker.py",
    "references/skill-pipeline.md",
    "references/experiment-design-norms.md",
    "references/norms-core.md",
    "references/norms-counterbalance.md",
    "references/norms-trial-n.md",
    "references/norms-marker-map.md",
    "references/marker-stub.psyclaw",
    "references/marker-validate.md",
    "references/session-state.md",
    "references/session-stub.json",
    "references/install-orchestrator.md",
    "references/webui-handoff.md",
    "references/run-prep.md",
    "references/api-notes.md",
    "references/failure-playbooks.md",
    "references/user-conservative-workflow-preference.md",
]

# First-use install helpers — warn if missing; do not fail agent-write package health.
OPTIONAL_INSTALL = [
    "install-all.bat",
    "install-full.sh",
]


def _parse_frontmatter(text: str) -> dict:
    """Parse SKILL.md YAML frontmatter. Handles folded `description: >` blocks."""
    if not text.startswith("---"):
        return {}
    m = re.search(r"\n---\s*\n", text[3:])
    if not m:
        return {}
    raw = text[3 : 3 + m.start()]
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        pass
    out: dict = {}
    lines = raw.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("name:"):
            out["name"] = line.split(":", 1)[1].strip().strip("'\"")
            i += 1
            continue
        if line.startswith("description:"):
            rest = line.split(":", 1)[1].strip()
            if rest in (">", ">-", "|", "|-"):
                buf: list[str] = []
                i += 1
                while i < len(lines) and (
                    lines[i].startswith("  ")
                    or lines[i].startswith("\t")
                    or lines[i] == ""
                ):
                    if lines[i] == "":
                        buf.append("")
                    else:
                        buf.append(lines[i].lstrip())
                    i += 1
                out["description"] = " ".join(x for x in (b.strip() for b in buf) if x)
            else:
                out["description"] = rest.strip("'\"")
                i += 1
            continue
        i += 1
    return out


def _try_compile_stub(stub_path: Path) -> dict:
    """Best-effort compile of marker-stub via monorepo or ~/.psyclaw webui backend."""
    try:
        design = json.loads(stub_path.read_text(encoding="utf-8"))
    except Exception as e:
        return {"ok": False, "error": f"stub JSON: {e}"}

    candidates: list[Path] = []
    # skills/psyclaw -> repo root / webui/backend
    mono_backend = ROOT.parents[1] / "webui" / "backend"
    if (mono_backend / "design_compiler.py").is_file():
        candidates.append(mono_backend)
    cfg = Path.home() / ".psyclaw" / "config.json"
    if cfg.is_file():
        try:
            wr = json.loads(cfg.read_text(encoding="utf-8")).get("webui_root")
            if wr:
                b = Path(wr) / "backend"
                if (b / "design_compiler.py").is_file() and b not in candidates:
                    candidates.append(b)
        except Exception:
            pass

    if not candidates:
        return {
            "ok": False,
            "skipped": True,
            "error": "design_compiler not found (monorepo webui or ~/.psyclaw config)",
        }

    last = "compile failed"
    for backend in candidates:
        try:
            sys.path.insert(0, str(backend))
            import design_compiler as dc  # type: ignore

            out = dc.compile_any(design=design)
            if isinstance(out, str) and "Window" in out:
                return {"ok": True, "backend": str(backend), "chars": len(out)}
            last = "output missing Window"
        except Exception as e:
            last = f"{type(e).__name__}: {e}"
        finally:
            if str(backend) in sys.path:
                try:
                    sys.path.remove(str(backend))
                except ValueError:
                    pass
            sys.modules.pop("design_compiler", None)
    return {"ok": False, "error": last}


def main() -> int:
    print("psyclaw doctor")
    print(f"  root: {ROOT}")
    ok = True
    missing_required: list[str] = []
    for rel in REQUIRED:
        p = ROOT / rel
        status = "OK" if p.is_file() else "MISSING"
        if status != "OK":
            ok = False
            missing_required.append(rel)
        print(f"  [{status}] {rel}")

    optional_missing: list[str] = []
    optional_ok: list[str] = []
    print("  --- optional install (warn only) ---")
    for rel in OPTIONAL_INSTALL:
        p = ROOT / rel
        if p.is_file():
            optional_ok.append(rel)
            print(f"  [OK] {rel}")
        else:
            optional_missing.append(rel)
            print(f"  [WARN] {rel} missing (first-use install path)")

    skill = ROOT / "SKILL.md"
    name = desc = None
    if skill.is_file():
        text = skill.read_text(encoding="utf-8", errors="replace")
        fm = _parse_frontmatter(text)
        name = fm.get("name")
        raw_desc = fm.get("description")
        if raw_desc is not None:
            desc = " ".join(str(raw_desc).split())
        print(f"  name: {name or '?'}")
        if desc:
            print(f"  description: {desc[:120]}{'…' if len(desc) > 120 else ''}")
        else:
            print("  description: (missing)")

    for cmd, label in (("python", "python"),):
        path = which(cmd)
        print(f"  [{'OK' if path else '—'}] {label}: {path or 'not on PATH'}")

    print("  --- optional stub compile (warn only) ---")
    stub = ROOT / "references" / "marker-stub.psyclaw"
    if not stub.is_file():
        print("  [WARN] marker-stub.psyclaw missing")
        stub_compile: dict = {"ok": False, "error": "stub missing"}
    else:
        stub_compile = _try_compile_stub(stub)
        if stub_compile.get("skipped"):
            print(f"  [—] skipped: {stub_compile.get('error')}")
        elif stub_compile.get("ok"):
            print(
                f"  [OK] stub compiles ({stub_compile.get('chars')} chars, "
                f"{stub_compile.get('backend')})"
            )
        else:
            print(f"  [WARN] stub compile failed: {stub_compile.get('error')}")

    report = {
        "ok": ok,
        "root": str(ROOT),
        "name": name,
        "description": desc,
        "slash": f"/{name}" if name else None,
        "deliverable": "<folderName>.psyclaw",
        "missing_required": missing_required,
        "optional_install_ok": optional_ok,
        "optional_install_missing": optional_missing,
        "stub_compile": stub_compile,
    }
    print("  json:", json.dumps(report, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
