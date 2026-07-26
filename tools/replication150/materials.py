"""Audit stimulus material directories on disk."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional, Set, Union


_README_NAMES = {"readme", "readme.md", "readme.txt", "license", "license.md", "license.txt"}


@dataclass(frozen=True)
class MaterialReport:
    status: str  # ready | missing | gated | licensed | physical | not_applicable
    path: str
    asset_count: int = 0
    assets: tuple[str, ...] = ()
    notes: tuple[str, ...] = ()


def audit_material(
    dataset: Union[str, Path],
    *,
    allowed_suffixes: Optional[Set[str]] = None,
    require_any: bool = True,
) -> MaterialReport:
    root = Path(dataset)
    if not root.exists() or not root.is_dir():
        return MaterialReport(status="missing", path=str(root), notes=("directory_missing",))

    suffixes = {s.lower() if s.startswith(".") else f".{s.lower()}" for s in (allowed_suffixes or set())}
    assets: list[str] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        name = path.name.lower()
        if name in _README_NAMES or name.startswith("readme"):
            continue
        if suffixes and path.suffix.lower() not in suffixes:
            # still count archives if .zip allowed etc.; otherwise skip non-matching
            continue
        # path traversal guard — only accept under root
        try:
            path.resolve().relative_to(root.resolve())
        except ValueError:
            continue
        assets.append(path.relative_to(root).as_posix())

    if require_any and not assets:
        return MaterialReport(status="missing", path=str(root), asset_count=0, assets=())

    return MaterialReport(
        status="ready",
        path=str(root),
        asset_count=len(assets),
        assets=tuple(assets),
    )
