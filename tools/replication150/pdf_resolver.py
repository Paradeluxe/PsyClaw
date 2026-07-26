"""Resolve local PDFs by DOI/title evidence, never list position."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional, Sequence, Set


@dataclass(frozen=True)
class Resolution:
    path: Optional[Path]
    status: str
    score: int = 0
    candidates: tuple[str, ...] = ()


def _normalize_doi(doi: Optional[str]) -> str:
    if not doi:
        return ""
    d = doi.strip().lower()
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d)
    d = d.removeprefix("doi:")
    return d.strip()


def _score_text(
    text: str,
    *,
    doi: Optional[str],
    title_tokens: Set[str],
    path: Path,
) -> int:
    score = 0
    low = (text or "").lower()
    name = path.name.lower()
    ndoi = _normalize_doi(doi)
    if ndoi and ndoi in low.replace(" ", ""):
        score += 100
    if ndoi and ndoi.replace("/", "") in name.replace("-", "").replace("_", ""):
        score += 40
    for tok in title_tokens:
        t = tok.lower()
        if not t:
            continue
        if t in low:
            score += 10
        if t in name:
            score += 5
    return score


def choose_pdf(
    candidates: Sequence[Path],
    *,
    doi: Optional[str],
    title_tokens: Set[str],
    extractor: Callable[[Path], str],
    min_score: int = 10,
) -> Resolution:
    """Pick a unique best PDF; otherwise return unresolved/ambiguous."""
    if not candidates:
        return Resolution(path=None, status="unresolved", score=0, candidates=())

    scored: list[tuple[int, Path]] = []
    for path in candidates:
        try:
            text = extractor(path)
        except Exception:
            text = ""
        scored.append(
            (_score_text(text, doi=doi, title_tokens=title_tokens, path=path), path)
        )

    scored.sort(key=lambda item: (-item[0], str(item[1])))
    best_score, best_path = scored[0]
    names = tuple(str(p) for _, p in scored)

    if best_score < min_score:
        return Resolution(path=None, status="unresolved", score=best_score, candidates=names)

    ties = [p for s, p in scored if s == best_score]
    if len(ties) > 1:
        return Resolution(path=None, status="ambiguous", score=best_score, candidates=names)

    return Resolution(path=best_path, status="resolved", score=best_score, candidates=names)
