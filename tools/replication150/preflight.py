"""Dry-run planning and backup guards."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterable, List, Set, Union


def plan_actions(
    project: Union[str, Path],
    *,
    generated_files: Iterable[str],
) -> List[Dict[str, Any]]:
    project = Path(project)
    generated = set(generated_files)
    actions: List[Dict[str, Any]] = []
    if not project.exists():
        for name in sorted(generated):
            actions.append({"action": "create", "path": str(project / name)})
        return actions

    existing = {p.name for p in project.iterdir() if p.is_file()}
    for name in sorted(generated):
        if name in existing:
            actions.append({"action": "update", "path": str(project / name)})
        else:
            actions.append({"action": "create", "path": str(project / name)})

    # never schedule delete for unknown files
    for name in sorted(existing - generated):
        actions.append({"action": "skip", "path": str(project / name), "reason": "not_generated"})
    return actions


def validate_backup(backup_root: Union[str, Path]) -> List[str]:
    root = Path(backup_root)
    errors: List[str] = []
    if not root.exists():
        errors.append("backup missing")
        return errors
    marker = root / "BACKUP_COMPLETE.txt"
    inventory = root / "hash-inventory.json"
    if not marker.is_file() and not inventory.is_file():
        errors.append("backup incomplete (no completion marker)")
    return errors
