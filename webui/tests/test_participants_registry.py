# -*- coding: utf-8 -*-
"""participants.json registry: end_status + max 10 entries."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import participants_registry as preg  # noqa: E402


@pytest.fixture()
def proj(tmp_path: Path) -> str:
    d = tmp_path / "exp"
    d.mkdir()
    return str(d)


def test_register_end_status_values(proj: str) -> None:
    e1 = preg.register_run(
        proj, participant_id="P01", session="1", run_id="r1", end_status="normal"
    )
    assert e1 and e1["end_status"] == "normal"
    e2 = preg.register_run(
        proj,
        participant_id="P02",
        session="1",
        run_id="r2",
        end_status="stopped",  # alias → manual
    )
    assert e2 and e2["end_status"] == "manual"
    e3 = preg.register_run(
        proj,
        participant_id="P03",
        session="1",
        run_id="r3",
        end_status="failed",  # alias → unexpected
    )
    assert e3 and e3["end_status"] == "unexpected"
    ents = preg.list_entries(proj)
    by_id = {e["participant_id"]: e["end_status"] for e in ents}
    assert by_id == {"P01": "normal", "P02": "manual", "P03": "unexpected"}


def test_max_entries_keeps_newest(proj: str) -> None:
    for i in range(1, 14):
        preg.register_run(
            proj,
            participant_id=f"P{i:02d}",
            session="1",
            run_id=f"r{i}",
            end_status="normal" if i % 3 else "manual",
        )
    ents = preg.list_entries(proj)
    assert len(ents) == preg.MAX_ENTRIES == 10
    ids = [e["participant_id"] for e in ents]
    # oldest P01..P03 dropped; keep P04..P13
    assert "P01" not in ids and "P02" not in ids and "P03" not in ids
    assert "P04" in ids and "P13" in ids


def test_replace_same_id_session_mode_updates_end_status(proj: str) -> None:
    preg.register_run(
        proj, participant_id="P01", session="1", run_id="r1", end_status="manual"
    )
    preg.register_run(
        proj, participant_id="P01", session="1", run_id="r2", end_status="normal"
    )
    ents = preg.list_entries(proj)
    assert len(ents) == 1
    assert ents[0]["run_id"] == "r2"
    assert ents[0]["end_status"] == "normal"


def test_incomplete_not_duplicate_allows_rerun(proj: str) -> None:
    preg.register_run(
        proj, participant_id="P01", session="1", run_id="r1", end_status="manual"
    )
    assert preg.is_duplicate(proj, "P01", "1") is False
    preg.register_run(
        proj, participant_id="P01", session="1", run_id="r2", end_status="normal"
    )
    assert preg.is_duplicate(proj, "P01", "1") is True
    ents = preg.list_entries(proj)
    assert len(ents) == 1 and ents[0]["run_id"] == "r2"


def test_legacy_missing_end_status_defaults_normal(proj: str) -> None:
    # write raw legacy row without end_status
    reg = {
        "entries": [
            {
                "participant_id": "P09",
                "session": "1",
                "run_id": "old",
                "mode": "participant",
            }
        ]
    }
    preg.save_registry(proj, reg)
    ents = preg.list_entries(proj)
    assert ents[0]["end_status"] == "normal"
    # legacy missing end_status counts as completed → blocks reuse
    assert preg.is_duplicate(proj, "P09", "1") is True


def test_escape_alias_normalizes_to_manual(proj: str) -> None:
    e = preg.register_run(
        proj, participant_id="P_esc", session="1", run_id="r_esc", end_status="escape"
    )
    assert e and e["end_status"] == "manual"
    assert preg.is_duplicate(proj, "P_esc", "1") is False


def test_register_stores_experimenter(proj: str) -> None:
    e = preg.register_run(
        proj,
        participant_id="P01",
        session="1",
        run_id="r1",
        experimenter="PsyClaw AI",
        participant_name="Ada",
    )
    assert e and e["experimenter"] == "PsyClaw AI"
    ents = preg.list_entries(proj)
    assert ents[0]["experimenter"] == "PsyClaw AI"
    assert ents[0]["participant_name"] == "Ada"
