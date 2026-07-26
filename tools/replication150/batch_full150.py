"""Full 150-paper batch: generate → static/open → autopilot when allowed.

Usage:
  python tools/replication150/batch_full150.py --vault E:/hermes_playground/psyclaw-vault
  python tools/replication150/batch_full150.py --vault ... --categories 1 --no-autopilot
  python tools/replication150/batch_full150.py --vault ... --resume
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.replication150.eligibility import classify
from tools.replication150.generate_marker import MaterialBlocked, build_marker
from tools.replication150.open_gate import check_open_parity
from tools.replication150.paradigm_templates import get_method, known_template_ids
from tools.replication150.pdf_audit import audit_pdf
from tools.replication150.pdf_resolver import choose_pdf
from tools.replication150.project_writer import write_project
from tools.replication150.report import summarize
from tools.replication150.state import ResultStore
from tools.replication150.static_gate import validate_project

# material folder name hints → dataset dir under vault/materials
MATERIAL_HINTS = {
    "cfd": "CFD_faces",
    "rafd": "RaFD_faces",
    "oasis": "OASIS_images",
    "naps": "NAPS_images",
    "gaped": "GAPED_images",
    "food-pics": "food_pics",
    "food_pics": "food_pics",
    "food pics": "food_pics",
    "frida": "FRIDa_food",
    "boss": "BOSS_objects",
    "things": "THINGS_objects",
    "esc": "ESC50_sounds",
    "environmental sound": "ESC50_sounds",
    "deam": "DEAM_music",
    "music emotion": "DEAM_music",
    "montreal": "Montreal_Affective_Voices",
    "mav": "Montreal_Affective_Voices",
    "kdef": "CFD_faces",  # not CFD; mark gated via name
    "nimstim": "CFD_faces",
    "iaps": "OASIS_images",
    "iads": "IADS_licensed",  # do not map to ESC; gated
}

GATED_LABEL_KEYS = (
    "cfd",
    "rafd",
    "oasis",
    "naps",
    "kdef",
    "nimstim",
    "iaps",
    "iads",
    "tasit",
    "pofa",
    "ekman",
    "montreal",
    "boss",  # login-walled
    "iads",
    "face trust",
    "face inversion",
    "composite face",
    "other-race",
    "other race",
    "child face",
    "trait inference",
    "facial first",
    "eye gaze",
    "body size",
    "body motion",
)

EXCLUDE_LABEL_KEYS = (
    "beck depression",
    "bdi",
    "stai",
    "mmpi",
    "hamilton depression",
    "stanford prison",
    "obedience",
    "strange situation",
    "marshmallow",  # physical/developmental often non-lab
    "mirror self",
    "visual cliff",
    "meta-analysis",
)


def _http_json(url: str, body: Optional[dict] = None, timeout: float = 60) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "replication150-batch"},
        method="GET" if body is None else "POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def material_status_for(row: dict, materials_root: Path) -> str:
    label = (row.get("paradigm_label") or "").lower()
    pid = (row.get("paper_id") or "").lower()
    blob = f"{label} {pid}"

    if int(row.get("category") or 0) == 1:
        return "not_applicable"

    # explicit exclude clinical / physical
    if any(k in blob for k in EXCLUDE_LABEL_KEYS):
        return "not_applicable"  # eligibility handles exclude

    if any(k in blob for k in GATED_LABEL_KEYS):
        # check if local files exist anyway
        for key, folder in MATERIAL_HINTS.items():
            if key in blob:
                d = materials_root / folder
                n = _media_count(d)
                if n > 20:
                    return "ready"
                return "gated"
        return "gated"

    # food / scene datasets missing locally
    if any(k in blob for k in ("food choice", "food viewing", "food craving", "food_pics", "frida")):
        for folder in ("food_pics", "FRIDa_food"):
            if _media_count(materials_root / folder) > 20:
                return "ready"
        return "missing"
    if any(k in blob for k in ("scene gist", "scene memorab", "places", "mit_places", "visual search (scenes)", "change detection (real scenes)", "associative memory (scenes)")):
        if _media_count(materials_root / "MIT_Places") > 20:
            return "ready"
        if _media_count(materials_root / "THINGS_objects") > 20 and "object" in blob:
            return "ready"
        # scene papers without Places: treat missing
        if "scene" in blob or "places" in blob:
            return "missing"

    # public material folders (THINGS/ESC/DEAM/BOSS/GAPED)
    for key, folder in MATERIAL_HINTS.items():
        if key in blob:
            d = materials_root / folder
            n = _media_count(d)
            if n > 20:
                return "ready"
            if folder in {"BOSS_objects", "food_pics", "FRIDa_food", "GAPED_images", "MIT_Places"}:
                return "missing"
            return "missing"

    # text / cognitive without external corpus
    if int(row.get("category") or 0) in {2, 3}:
        if any(
            k in blob
            for k in (
                "word",
                "semantic",
                "norms",
                "discount",
                "osf",
                "memory",
                "control",
                "reward",
                "fear",
                "intertemporal",
                "inattentional",
                "picture superiority",
                "ensemble",
                "time perception",
                "heuristic",
                "framing",
                "anchoring",
                "fallacy",
                "conditioning",
                "learning",
                "attribution",
                "dissonance",
                "conformity",
                "facilitation",
                "illusion",
                "directed forgetting",
                "levels of processing",
                "false memory",
                "self-reference",
                "encoding",
                "phonological",
                "frequency",
                "classification",
                "instrumental",
                "evaluative",
                "minimal group",
                "pattern separation",
                "recollection",
                "boundary extension",
                "image memorability",
                "object naming",
                "visual search (real",
                "contextual cueing",
                "bystander",
                "raven",
                "theory of mind",
                "rubin",
                "mccollough",
            )
        ):
            return "not_applicable"

    return "unknown"


def _media_count(d: Path) -> int:
    if not d.is_dir():
        return 0
    n = 0
    for p in d.rglob("*"):
        if p.is_file() and p.suffix.lower() in {
            ".jpg",
            ".jpeg",
            ".png",
            ".bmp",
            ".wav",
            ".mp3",
            ".ogg",
            ".mp4",
        }:
            n += 1
            if n > 50:
                return n
    return n


# module-level PDF text cache: path -> first pages text
_PDF_TEXT_CACHE: Dict[str, str] = {}


def _extract_pdf_text(p: Path, max_pages: int = 2) -> str:
    key = str(p.resolve())
    if key in _PDF_TEXT_CACHE:
        return _PDF_TEXT_CACHE[key]
    text = p.name
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(p)
        parts = []
        for i in range(min(max_pages, doc.page_count)):
            parts.append(doc.load_page(i).get_text("text") or "")
        doc.close()
        text = "\n".join(parts) or p.name
    except Exception:
        try:
            from pypdf import PdfReader

            r = PdfReader(str(p))
            parts = []
            for page in r.pages[:max_pages]:
                parts.append(page.extract_text() or "")
            text = "\n".join(parts) or p.name
        except Exception:
            text = p.name
    _PDF_TEXT_CACHE[key] = text
    return text


def resolve_row_pdf(row: dict, pdf_dir: Path) -> Optional[Path]:
    doi = ((row.get("citation") or {}).get("doi") or "").strip()
    titleish = row.get("paradigm_label") or ""
    tokens = {t for t in re.findall(r"[a-z0-9]{3,}", titleish.lower()) if t not in {"the", "and", "for", "with"}}
    pdfs = list(pdf_dir.glob("*.pdf"))
    if not pdfs:
        return None

    # DOI / paper_id filename hit first (no full-text)
    pid = (row.get("paper_id") or "").lower()
    if doi:
        dkey = doi.lower().replace("/", "_")
        for p in pdfs:
            nl = p.name.lower()
            if dkey in nl or doi.lower() in nl:
                return p
    # ordinal filename pattern e.g. 01_ or cat1_01
    ordn = row.get("ordinal")
    if ordn is not None:
        prefixes = (f"{int(ordn):02d}_", f"{int(ordn):02d}-", f"{int(ordn)}_")
        hits = [p for p in pdfs if p.name.lower().startswith(prefixes) or f"_{int(ordn):02d}_" in p.name.lower()]
        if len(hits) == 1:
            return hits[0]

    # cheap: score filename only first
    best_name = None
    best_s = 0
    for p in pdfs:
        s = 0
        nl = p.name.lower()
        for t in tokens:
            if t in nl:
                s += 5
        if s > best_s:
            best_s = s
            best_name = p
    if best_name and best_s >= 10:
        return best_name

    # skip expensive full-text scoring in batch (use catalog DOI later)
    return None

def eligibility_for(row: dict) -> dict:
    label = (row.get("paradigm_label") or "").lower()
    extracted = {}
    reasons_extra = []
    if any(k in label for k in ("bdi", "beck", "stai", "mmpi", "hamilton", "depression inventory", "anxiety inventory")):
        extracted["paper_type"] = "clinical scale"
        # classify looks for clinical markers in label/notes/apparatus, not paper_type
        extracted["apparatus"] = list(extracted.get("apparatus") or []) + ["clinical scale"]
        reasons_extra.append("clinical_scale")
    if any(k in label for k in ("prison", "obedience", "stanford prison")):
        extracted["apparatus"] = list(extracted.get("apparatus") or []) + ["physical cliff"]  # non-lab ethics-restricted
        reasons_extra.append("ethics_restricted_physical")
    if "visual cliff" in label:
        extracted["apparatus"] = list(extracted.get("apparatus") or []) + ["physical cliff"]
    if "strange situation" in label or "marshmallow" in label or "mirror self" in label:
        extracted["apparatus"] = list(extracted.get("apparatus") or []) + ["physical cliff"]
        reasons_extra.append("physical_observational")
    if "meta-analysis" in label or "systematic review" in label:
        extracted["apparatus"] = list(extracted.get("apparatus") or []) + ["meta-analysis"]
    # licensed IADS is not free ESC substitute as true pass
    if "iads" in label and "sound" in label:
        # still eligible as adaptation but materials should be gated — handled in material_status
        pass
    dec = classify(row, extracted=extracted)
    status = dec.status
    reasons = list(dec.reasons) + reasons_extra
    if reasons_extra and status == "eligible":
        status = "replace"
    return {"status": status, "reasons": reasons}


def stage_assets(project: Path, method: dict, materials_root: Path, row: dict) -> None:
    """Copy a small sample of media into project/assets when material_status=ready."""
    if method.get("material_status") != "ready":
        return
    assets = project / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    label = (row.get("paradigm_label") or "").lower() + " " + row.get("paper_id", "")
    src_dir = None
    for key, folder in MATERIAL_HINTS.items():
        if key in label:
            cand = materials_root / folder
            if _media_count(cand) > 0:
                src_dir = cand
                break
    if src_dir is None:
        return
    media = [
        p
        for p in src_dir.rglob("*")
        if p.is_file()
        and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".wav", ".mp3"}
        and p.stat().st_size > 1000
    ]
    media = sorted(media, key=lambda p: p.stat().st_size)[:12]
    for i, src in enumerate(media):
        dest = assets / f"stim_{i}{src.suffix.lower()}"
        if not dest.exists():
            try:
                shutil.copy2(src, dest)
            except Exception:
                pass
    # rewrite condition image/sound paths to local samples if present
    samples = sorted(assets.glob("stim_*"))
    if not samples:
        return
    conds = method.get("conditions") or []
    for i, c in enumerate(conds):
        s = samples[i % len(samples)]
        rel = f"assets/{s.name}"
        if method.get("stimulus_kind") == "image":
            c["image"] = rel
        elif method.get("stimulus_kind") in {"sound", "audio"}:
            c["sound"] = rel


def run_autopilot(base: str, project: Path, marker: dict, runs: int = 3) -> dict:
    results = []
    for sess in range(1, runs + 1):
        body = {
            "design": marker,
            "project_path": str(project),
            "headless": True,
            "session": {
                "participant_id": "P_autopilot",
                "session": str(sess),
                "experimenter": "PsyClaw AI",
            },
            "spec": {"mode": "autopilot"},
        }
        try:
            started = _http_json(f"{base}/runs", body, timeout=90)
        except Exception as exc:
            results.append({"session": str(sess), "status": "failed", "error": str(exc)})
            continue
        rid = started.get("run_id") or started.get("id")
        final = None
        deadline = time.time() + 300
        while time.time() < deadline:
            try:
                st = _http_json(f"{base}/runs/{rid}", timeout=30)
            except Exception as exc:
                time.sleep(2)
                continue
            status = st.get("status")
            if status in {"finished", "failed", "error", "stopped", "aborted"}:
                final = st
                break
            time.sleep(1.2)
        status = (final or {}).get("status") or "timeout"
        packs = (final or {}).get("data_files") or []
        four = (
            any(f.endswith(".csv") and "_by_condition" not in f and "_metrics_long" not in f and f != "trials.csv" for f in packs)
            and any(f.endswith("_summary.json") for f in packs)
            and any(f.endswith("_by_condition.csv") for f in packs)
            and any(f.endswith("_metrics_long.csv") for f in packs)
        )
        results.append(
            {
                "session": str(sess),
                "run_id": rid,
                "status": status,
                "four_pack": four,
                "data_files": packs,
            }
        )
    ok = len(results) == runs and all(r.get("status") == "finished" and r.get("four_pack") for r in results)
    return {"ok": ok, "runs": results}


def process_one(
    row: dict,
    *,
    vault: Path,
    store: ResultStore,
    webui: str,
    do_autopilot: bool,
    compile_marker: bool,
) -> dict:
    paper_id = row["paper_id"]
    cat = int(row["category"])
    materials_root = vault / "materials"
    pdf_dir = vault / "papers" / f"category{cat}"
    exp_root = vault / "experiments"
    exp_root.mkdir(parents=True, exist_ok=True)

    # material + eligibility
    mat = material_status_for(row, materials_root)
    row["material_status"] = mat
    elig = eligibility_for(row)
    row["eligibility"] = elig["status"]
    row["eligibility_reasons"] = elig["reasons"]

    # PDF resolve + light audit (skip heavy audit — existence + name map only)
    pdf_path = resolve_row_pdf(row, pdf_dir)
    if pdf_path and pdf_path.is_file():
        try:
            row["pdf_relpath"] = str(pdf_path.relative_to(vault)).replace("\\", "/")
            row["pdf_bytes"] = pdf_path.stat().st_size
            if pdf_path.stat().st_size < 1000:
                row.setdefault("blockers", []).append("pdf_too_small")
        except Exception as exc:
            row.setdefault("blockers", []).append(f"pdf_stat_error:{exc}")
    else:
        row.setdefault("blockers", []).append("pdf_unresolved")

    # decide run policy
    if elig["status"] in {"excluded", "replace"}:
        level = "excluded" if elig["status"] == "excluded" else "replace"
        status = "excluded" if level == "excluded" else "blocked"
        rec = {
            "paper_id": paper_id,
            "category": cat,
            "status": status,
            "replication_level": level,
            "material_status": mat,
            "eligibility": elig,
            "reason": elig["reasons"],
        }
        store.append(rec)
        return rec

    if mat in {"gated", "licensed"}:
        # framework-only marker optional; do not autopilot
        method = get_method(paper_id, row)
        method["material_status"] = "gated"
        method["framework_only"] = True
        project = exp_root / paper_id
        try:
            marker = build_marker(method, project_name=paper_id, runnable=False)
        except Exception:
            method["stimulus_kind"] = "text"
            method["material_status"] = "not_applicable"
            method.pop("required_assets", None)
            marker = build_marker(method, project_name=paper_id, runnable=False)
        meta = {
            "paper_id": paper_id,
            "replication_level": "framework_only",
            "material_status": "gated",
            "run_policy": "do_not_run",
            "generated_files": [f"{paper_id}.psyclaw", "replication.json", "method-extract.md"],
            "blockers": ["gated_material"],
        }
        write_project(
            project,
            marker,
            meta,
            method_extract=f"# {paper_id}\n\nGated materials — framework only. Apply for license.\n",
        )
        static = validate_project(project, compile_marker=False)
        open_r = check_open_parity(project)
        rec = {
            "paper_id": paper_id,
            "category": cat,
            "status": "blocked",
            "replication_level": "framework_only",
            "material_status": "gated",
            "static_ok": static.get("ok"),
            "open_ok": open_r.get("ok"),
            "autopilot": {"ok": False, "skipped": "gated_material"},
        }
        store.append(rec)
        return rec

    if mat == "missing":
        method = get_method(paper_id, row)
        method["material_status"] = "missing"
        method["framework_only"] = True
        method["stimulus_kind"] = "text"
        method.pop("required_assets", None)
        project = exp_root / paper_id
        marker = build_marker(method, project_name=paper_id)
        meta = {
            "paper_id": paper_id,
            "replication_level": "framework_only",
            "material_status": "missing",
            "run_policy": "do_not_run",
            "generated_files": [f"{paper_id}.psyclaw", "replication.json", "method-extract.md"],
            "blockers": ["missing_material"],
        }
        write_project(
            project,
            marker,
            meta,
            method_extract=f"# {paper_id}\n\nMaterials missing — framework only.\n",
        )
        static = validate_project(project, compile_marker=False)
        open_r = check_open_parity(project)
        rec = {
            "paper_id": paper_id,
            "category": cat,
            "status": "blocked",
            "replication_level": "framework_only",
            "material_status": "missing",
            "static_ok": static.get("ok"),
            "open_ok": open_r.get("ok"),
            "autopilot": {"ok": False, "skipped": "missing_material"},
        }
        store.append(rec)
        return rec

    # runnable path
    method = get_method(paper_id, row)
    method["material_status"] = mat if mat != "unknown" else "not_applicable"
    if method.get("material_status") == "unknown":
        method["material_status"] = "not_applicable"
    project = exp_root / paper_id
    stage_assets(project, method, materials_root, row)
    # if image/sound but no assets staged, fall back text
    if method.get("stimulus_kind") in {"image", "sound"}:
        assets = list((project / "assets").glob("stim_*")) if (project / "assets").exists() else []
        if not assets:
            method["stimulus_kind"] = "text"
            method["material_status"] = "not_applicable"
            method.pop("required_assets", None)
            for c in method.get("conditions") or []:
                c.pop("image", None)
                c.pop("sound", None)

    try:
        marker = build_marker(method, project_name=paper_id)
    except MaterialBlocked:
        method["stimulus_kind"] = "text"
        method["material_status"] = "not_applicable"
        method.pop("required_assets", None)
        marker = build_marker(method, project_name=paper_id)

    level = "adaptation"
    if paper_id in known_template_ids() or cat == 1:
        level = "adaptation"
    meta = {
        "paper_id": paper_id,
        "replication_level": level,
        "material_status": method.get("material_status"),
        "run_policy": "run",
        "generated_files": [f"{paper_id}.psyclaw", "replication.json", "method-extract.md"],
        "template": paper_id if paper_id in known_template_ids() else "generic",
        "pdf": row.get("pdf_relpath"),
    }
    write_project(
        project,
        marker,
        meta,
        method_extract=(
            f"# {paper_id}\n\n"
            f"Paradigm: {row.get('paradigm_label')}\n"
            f"PDF: {row.get('pdf_relpath')}\n"
            f"Template-based adaptation. Timing defaults pending full Method page extract.\n"
        ),
    )

    # rewrite marker after asset path injection
    marker_path = project / f"{paper_id}.psyclaw"
    marker = json.loads(marker_path.read_text(encoding="utf-8"))

    static = validate_project(project, compile_marker=compile_marker)
    open_r = check_open_parity(project)

    auto = {"ok": False, "skipped": "disabled"}
    status = "static_pass" if static.get("ok") and open_r.get("ok") else "failed"
    if static.get("ok") and open_r.get("ok") and do_autopilot:
        auto = run_autopilot(webui.rstrip("/"), project, marker, runs=3)
        status = "smoke_pass" if auto.get("ok") else "failed"

    rec = {
        "paper_id": paper_id,
        "category": cat,
        "status": status,
        "replication_level": level,
        "material_status": method.get("material_status"),
        "static_ok": static.get("ok"),
        "open_ok": open_r.get("ok"),
        "compiled_sha256": static.get("compiled_sha256"),
        "static_hard": static.get("hard"),
        "autopilot": auto,
        "pdf": row.get("pdf_relpath"),
        "eligibility": elig,
    }
    store.append(rec)
    return rec


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--vault", required=True)
    p.add_argument("--categories", default="1,2,3")
    p.add_argument("--webui", default="http://127.0.0.1:8876/api")
    p.add_argument("--no-autopilot", action="store_true")
    p.add_argument("--no-compile", action="store_true")
    p.add_argument("--resume", action="store_true")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--ids", default="")
    args = p.parse_args(argv)

    vault = Path(args.vault)
    catalog_path = vault / "catalog" / "papers.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    papers = catalog["papers"] if isinstance(catalog, dict) else catalog

    cats = {int(x) for x in args.categories.split(",") if x.strip()}
    id_filter = {x.strip() for x in args.ids.split(",") if x.strip()}
    store = ResultStore(vault / "catalog" / "batch_state")
    latest = store.latest() if args.resume else {}

    todo = []
    for row in papers:
        if int(row.get("category") or 0) not in cats:
            continue
        if id_filter and row["paper_id"] not in id_filter:
            continue
        if args.resume:
            prev = latest.get(row["paper_id"]) or {}
            st = prev.get("status")
            # reprocess misclassified smoke_pass that should be gated/missing
            mat_now = material_status_for(row, vault / "materials")
            if st == "smoke_pass" and mat_now in {"gated", "missing", "licensed"}:
                todo.append(row)
                continue
            if st in {"smoke_pass", "blocked", "excluded"}:
                continue
        todo.append(row)
    if args.limit:
        todo = todo[: args.limit]

    do_auto = not args.no_autopilot
    # health check
    if do_auto:
        try:
            h = _http_json(args.webui.rstrip("/") + "/health", timeout=5)
            print("webui", h)
        except Exception as exc:
            print(f"webui unavailable ({exc}); continuing without autopilot")
            do_auto = False

    print(f"TODO {len(todo)} categories={sorted(cats)} autopilot={do_auto}")
    results = []
    for i, row in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] {row['paper_id']} ...", flush=True)
        try:
            rec = process_one(
                row,
                vault=vault,
                store=store,
                webui=args.webui,
                do_autopilot=do_auto,
                compile_marker=not args.no_compile,
            )
        except Exception as exc:
            rec = {
                "paper_id": row["paper_id"],
                "category": row.get("category"),
                "status": "failed",
                "error": f"{type(exc).__name__}: {exc}",
            }
            store.append(rec)
            print("  FAIL", rec["error"], flush=True)
        else:
            print(
                f"  -> {rec.get('status')} static={rec.get('static_ok')} open={rec.get('open_ok')} "
                f"auto={((rec.get('autopilot') or {}).get('ok'))} mat={rec.get('material_status')}",
                flush=True,
            )
        results.append(rec)

    # full latest summary
    all_latest = list(store.latest().values())
    # ensure 150 coverage from catalog merge
    by_id = {r["paper_id"]: r for r in all_latest}
    for row in papers:
        by_id.setdefault(
            row["paper_id"],
            {
                "paper_id": row["paper_id"],
                "category": row["category"],
                "status": "pending",
            },
        )
    final_rows = [by_id[p["paper_id"]] for p in papers]
    summary = summarize(final_rows, expected_total=150)
    out = vault / "catalog" / "batch_summary.json"
    out.write_text(
        json.dumps({"summary": summary, "results": final_rows}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    # human report
    counts = Counter(r.get("status") for r in final_rows)
    report = vault / "catalog" / "FINAL_REPORT.md"
    lines = [
        "# PsyClaw 150 batch report",
        "",
        f"- records: {summary.get('records')}",
        f"- complete(150): {summary.get('complete')}",
        f"- fully_passed(smoke/pilot): {summary.get('fully_passed')}",
        f"- blocked: {summary.get('blocked')}",
        f"- failed: {summary.get('failed')}",
        f"- excluded: {summary.get('excluded')}",
        f"- status_counts: {dict(counts)}",
        "",
        "## By category",
    ]
    for c in (1, 2, 3):
        sub = [r for r in final_rows if int(r.get("category") or 0) == c]
        lines.append(f"### Category {c} (n={len(sub)})")
        lines.append(f"- {dict(Counter(r.get('status') for r in sub))}")
    lines.append("")
    lines.append("## Failures")
    for r in final_rows:
        if r.get("status") == "failed":
            lines.append(
                f"- {r.get('paper_id')}: static={r.get('static_ok')} open={r.get('open_ok')} "
                f"auto={((r.get('autopilot') or {}).get('ok'))} err={r.get('error')}"
            )
    lines.append("")
    lines.append("## Blocked / gated / missing")
    for r in final_rows:
        if r.get("status") == "blocked":
            lines.append(
                f"- {r.get('paper_id')}: mat={r.get('material_status')} level={r.get('replication_level')}"
            )
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("SUMMARY", json.dumps(summary, ensure_ascii=False))
    print("wrote", out)
    print("wrote", report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
