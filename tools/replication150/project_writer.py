"""Atomic project generation writer."""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict, Union


def write_project(
    project: Union[str, Path],
    marker: Dict[str, Any],
    meta: Dict[str, Any],
    *,
    method_extract: str = "# method extract\n",
) -> Path:
    project = Path(project)
    project.mkdir(parents=True, exist_ok=True)
    name = project.name
    marker = dict(marker)
    marker["name"] = name

    staging = project.parent / f".staging-{name}"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    allow = set(meta.get("generated_files") or [f"{name}.psyclaw", "replication.json", "method-extract.md"])
    # always write canonical trio if listed or default
    files = {
        f"{name}.psyclaw": json.dumps(marker, ensure_ascii=False, indent=2) + "\n",
        "replication.json": json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
        "method-extract.md": method_extract,
    }
    for fname, content in files.items():
        if allow and fname not in allow and not fname.endswith(".psyclaw"):
            # still write if in allow; if allow empty, write all
            if allow:
                continue
        (staging / fname).write_text(content, encoding="utf-8")

    # ensure marker always written
    if not (staging / f"{name}.psyclaw").is_file():
        (staging / f"{name}.psyclaw").write_text(files[f"{name}.psyclaw"], encoding="utf-8")
    if "replication.json" in allow or not allow:
        (staging / "replication.json").write_text(files["replication.json"], encoding="utf-8")
    if "method-extract.md" in allow or not allow:
        (staging / "method-extract.md").write_text(files["method-extract.md"], encoding="utf-8")

    # validate JSON
    json.loads((staging / f"{name}.psyclaw").read_text(encoding="utf-8"))
    if (staging / "replication.json").is_file():
        json.loads((staging / "replication.json").read_text(encoding="utf-8"))

    # replace only generated allowlisted files
    for path in staging.iterdir():
        if not path.is_file():
            continue
        dest = project / path.name
        os.replace(path, dest)

    shutil.rmtree(staging, ignore_errors=True)
    # never touch assets/ data/
    return project
