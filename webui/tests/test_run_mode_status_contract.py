"""Contract: Run Start/Pilot/Autopilot labels, palette, and status display."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
I18N = (ROOT / "frontend" / "i18n.js").read_text(encoding="utf-8")
CSS = (ROOT / "frontend" / "style.css").read_text(encoding="utf-8")
JS_SYSTEM = (ROOT / "frontend" / "app-system.js").read_text(encoding="utf-8")
JS_RUN = (ROOT / "frontend" / "app-run.js").read_text(encoding="utf-8")


def test_run_modes_have_consistent_en_copy():
    assert "'run.modeRun': 'Start'" in I18N
    assert "'run.modePilot': 'Pilot'" in I18N
    assert "'run.modeAutopilot': 'Autopilot'" in I18N
    assert "Start = live participant" in I18N
    assert "Pilot = live manual test" in I18N
    assert "Autopilot = headless auto test" in I18N


def test_run_modes_have_consistent_zh_copy():
    assert "'run.modeRun': '开始'" in I18N
    assert "'run.modePilot': '试飞'" in I18N
    assert "'run.modeAutopilot': '自动驾驶'" in I18N
    assert "开始 = 真实被试" in I18N
    assert "试飞 = 本机手动测试" in I18N
    assert "自动驾驶 = 无窗自动测试" in I18N


def test_run_controls_keep_three_explicit_modes():
    assert 'id="start-run-btn"' in HTML
    assert 'id="pilot-run-btn"' in HTML
    assert 'id="autopilot-run-btn"' in HTML


def test_run_mode_palette_has_single_source_tokens():
    for token in (
        "--run-start: #3dcc7a",
        "--run-pilot: #b794f6",
        "--run-autopilot: #8b9bb4",
        "--run-start-soft:",
        "--run-pilot-soft:",
        "--run-autopilot-soft:",
        "--run-start-border:",
        "--run-pilot-border:",
        "--run-autopilot-border:",
    ):
        assert token in CSS


def test_buttons_and_chips_consume_run_palette_tokens():
    assert ".btn-pilot" in CSS
    assert "color: var(--run-pilot)" in CSS
    assert "border-color: var(--run-pilot-border)" in CSS
    assert "background: var(--run-pilot-soft)" in CSS
    assert "color: var(--run-autopilot)" in CSS
    assert "border-color: var(--run-autopilot-border)" in CSS
    assert "background: var(--run-autopilot-soft)" in CSS
    assert ".run-mode-chip.mode-run" in CSS
    assert "color: var(--run-start)" in CSS


def test_idle_status_uses_mode_classes_not_gate_pilot_color():
    assert "last-mode-' + modeKey" in JS_SYSTEM
    assert "Color = last proven mode" in JS_SYSTEM
    assert ".status-badge.gate-pilot" not in CSS
    assert "#run-status-badge.last-mode-run" in CSS
    assert "color: var(--run-start)" in CSS
    assert "#run-status-badge.last-mode-pilot" in CSS
    assert "color: var(--run-pilot)" in CSS
    assert "#run-status-badge.last-mode-autopilot" in CSS
    assert "color: var(--run-autopilot)" in CSS


def test_blocked_status_overrides_mode_color():
    block_rule = CSS.index("#run-status-badge.gate-block")
    mode_rule = CSS.index("#run-status-badge.last-mode-run")
    assert block_rule > mode_rule


def test_active_status_combines_mode_and_lifecycle():
    assert "function formatFlightStatus(mode, status)" in JS_RUN
    assert "run.statusStarting" in I18N
    assert "run.statusRunning" in I18N
    assert "mode-' + modeNorm" in JS_RUN
    assert "statusBadge.textContent = formatFlightStatus" in JS_RUN


def test_finished_restores_idle_last_status():
    assert "setStatus('idle')" in JS_RUN
    assert "lastTerminalStatus" in JS_RUN
    assert "lastTerminalStatus === 'finished'" in JS_RUN


def test_changed_run_assets_are_cache_busted():
    # Floor versions from the mode/status ship; later bumps must stay >= floor.
    minimum = {
        "style.css": 298,
        "i18n.js": 276,
        "app-system.js": 281,
        "app-run.js": 267,
    }
    for asset, floor in minimum.items():
        m = re.search(rf"{re.escape(asset)}\?v=(\d+)", HTML)
        assert m, f"missing cache bust for {asset}"
        assert int(m.group(1)) >= floor, f"{asset} v={m.group(1)} < floor {floor}"
