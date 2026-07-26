# -*- coding: utf-8 -*-
"""Autopilot / agent runs must record experimenter as PsyClaw AI."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from api.routes import AI_EXPERIMENTER, _apply_ai_experimenter  # noqa: E402


def test_ai_experimenter_constant():
    assert AI_EXPERIMENTER == "PsyClaw AI"


def test_autopilot_mode_forces_ai():
    s = {"participant_id": "P01", "experimenter": ""}
    out = _apply_ai_experimenter(s, mode="autopilot", headless=True)
    assert out["experimenter"] == "PsyClaw AI"


def test_p_autopilot_id_forces_ai_even_if_form_has_human():
    s = {"participant_id": "P_autopilot", "experimenter": "lab-tech"}
    out = _apply_ai_experimenter(s, mode="autopilot", headless=True)
    assert out["experimenter"] == "PsyClaw AI"


def test_headless_default_mode_forces_ai():
    s = {"participant_id": "P_autopilot", "experimenter": ""}
    out = _apply_ai_experimenter(s, mode="", headless=True)
    assert out["experimenter"] == "PsyClaw AI"


def test_live_participant_keeps_human_experimenter():
    s = {"participant_id": "P03", "experimenter": "张三"}
    out = _apply_ai_experimenter(s, mode="participant", headless=False)
    assert out["experimenter"] == "张三"


def test_pilot_does_not_force_ai():
    s = {"participant_id": "P_pilot", "experimenter": "张三"}
    out = _apply_ai_experimenter(s, mode="pilot", headless=False)
    assert out["experimenter"] == "张三"
