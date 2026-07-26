"""Audit PDF integrity and freeze content hashes."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any, Dict, Union


_ERROR_MARKERS = (
    "access denied",
    "not authorized",
    "captcha",
    "cloudflare",
    "page not found",
    "403 forbidden",
    "buy this article",
    "please enable cookies",
)


def inspect_pdf(path: Union[str, Path]) -> Dict[str, Any]:
    """Open a PDF and return page count, concatenated text, and metadata."""
    path = Path(path)
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("PyMuPDF (fitz) is required for PDF audit") from exc

    doc = fitz.open(path)
    try:
        texts = []
        for page in doc:
            texts.append(page.get_text("text") or "")
        meta = doc.metadata or {}
        return {
            "pages": doc.page_count,
            "text": "\n".join(texts),
            "metadata": meta,
        }
    finally:
        doc.close()


def audit_pdf(path: Union[str, Path]) -> Dict[str, Any]:
    path = Path(path)
    issues: list[str] = []
    sha256 = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None

    try:
        info = inspect_pdf(path)
    except Exception as exc:
        return {
            "ok": False,
            "path": str(path),
            "sha256": sha256,
            "pages": 0,
            "issues": ["open_failed", str(exc)],
        }

    pages = int(info.get("pages") or 0)
    text = info.get("text") or ""
    low = text.lower()

    if pages < 2:
        issues.append("too_few_pages")
    if any(marker in low for marker in _ERROR_MARKERS):
        issues.append("error_page")
    if pages <= 2 and len(re.sub(r"\s+", "", text)) < 200:
        if "error_page" not in issues and pages < 2:
            pass
        elif pages == 1 and len(text.strip()) < 400:
            if "error_page" not in issues:
                issues.append("error_page")

    return {
        "ok": not issues,
        "path": str(path),
        "sha256": sha256,
        "pages": pages,
        "issues": issues,
        "metadata": info.get("metadata") or {},
    }
