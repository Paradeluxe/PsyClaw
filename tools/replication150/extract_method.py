"""Extract Method candidates from local PDFs with page provenance."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple, Union


def pages(path: Union[str, Path]) -> List[Tuple[int, str]]:
    """Return (1-based page number, text) pairs."""
    path = Path(path)
    try:
        import fitz
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("PyMuPDF (fitz) is required") from exc
    doc = fitz.open(path)
    out: List[Tuple[int, str]] = []
    try:
        for i, page in enumerate(doc, 1):
            out.append((i, page.get_text("text") or ""))
    finally:
        doc.close()
    return out


_MS_RE = re.compile(
    r"(\d{2,5})\s*(ms|milliseconds)|(\d+(?:\.\d+)?)\s*(s|sec|seconds)\b",
    re.I,
)
_KEY_RE = re.compile(
    r"pressed\s+([A-Za-z0-9/ ,-]+)|keys?\s*[:=]\s*([A-Za-z0-9/ ,-]+)|"
    r"\b([A-Za-z])\s*(?:or|/)\s*([A-Za-z])\b",
    re.I,
)
_TRIAL_RE = re.compile(
    r"\b(\d{1,4})\s*(?:experimental\s+)?trials?\b",
    re.I,
)


def extract_candidates_from_text(
    page_texts: Sequence[Tuple[int, str]],
) -> Dict[str, Any]:
    timing_candidates: List[Dict[str, Any]] = []
    response_candidates: List[Dict[str, Any]] = []
    trial_candidates: List[Dict[str, Any]] = []

    for page_no, text in page_texts:
        for m in _MS_RE.finditer(text):
            if m.group(1):
                ms = int(m.group(1))
            else:
                ms = int(float(m.group(3)) * 1000)
            timing_candidates.append(
                {
                    "page": page_no,
                    "value_ms": ms,
                    "snippet": text[max(0, m.start() - 40) : m.end() + 40].strip(),
                    "confidence": 0.5,
                }
            )
        for m in _KEY_RE.finditer(text):
            snippet = m.group(0)
            response_candidates.append(
                {
                    "page": page_no,
                    "snippet": snippet,
                    "confidence": 0.4,
                }
            )
        for m in _TRIAL_RE.finditer(text):
            # reject vague language nearby
            window = text[max(0, m.start() - 30) : m.end() + 30].lower()
            if any(w in window for w in ("approximately", "several", "about", "roughly")):
                continue
            trial_candidates.append(
                {
                    "page": page_no,
                    "value": int(m.group(1)),
                    "snippet": m.group(0),
                    "confidence": 0.4,
                }
            )

    return {
        "timing_candidates": timing_candidates,
        "response_candidates": response_candidates,
        "trial_count_candidates": trial_candidates,
        # never promote unconfirmed trial_count automatically
        "trial_count": None,
    }


def extract_candidates(path: Union[str, Path]) -> Dict[str, Any]:
    return extract_candidates_from_text(pages(path))
