"""Import legacy category article lists without positional PDF matching."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any, List, Union


def make_paper_id(category: int, label: str) -> str:
    text = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return f"cat{category}_{slug}"


def import_rows(path: Union[str, Path], *, category: int) -> List[dict[str, Any]]:
    path = Path(path)
    rows = json.loads(path.read_text(encoding="utf-8"))
    out: List[dict[str, Any]] = []
    for ordinal, row in enumerate(rows, 1):
        note = row.get("note")
        out.append(
            {
                "paper_id": make_paper_id(category, row["paradigm"]),
                "category": category,
                "ordinal": ordinal,
                "paradigm_label": row["paradigm"],
                "citation": {
                    "author": row.get("author"),
                    "year": row.get("year"),
                    "doi": row.get("doi"),
                },
                "pdf_relpath": None,
                "blockers": ["pdf_unresolved"],
                "source_notes": [note] if note else [],
            }
        )
    return out
