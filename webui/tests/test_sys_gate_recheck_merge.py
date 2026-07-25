"""Contract: System gate chip is the recheck control (no separate Re-check button)."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "frontend" / "style.css").read_text(encoding="utf-8")
JS = (ROOT / "frontend" / "app-system.js").read_text(encoding="utf-8")
I18N = (ROOT / "frontend" / "i18n.js").read_text(encoding="utf-8")


def test_sys_summary_is_button_not_span():
    assert re.search(r"<button[^>]*\bid=[\"']sys-summary[\"']", HTML), (
        "sys-summary must be a <button> (merged gate + recheck)"
    )
    assert not re.search(r"<span[^>]*\bid=[\"']sys-summary[\"']", HTML)


def test_standalone_rerun_btn_removed():
    assert 'id="sys-rerun-btn"' not in HTML
    assert "sys-rerun-btn" not in JS


def test_gate_has_refresh_ico_inside_summary():
    # multiline <button id="sys-summary">…</button>
    block = re.search(
        r"<button\b[^>]*\bid=[\"']sys-summary[\"'][^>]*>[\s\S]*?</button>",
        HTML,
        flags=re.IGNORECASE,
    )
    if not block:
        # attribute order may put id on its own line inside the open tag
        block = re.search(
            r"<button\b[\s\S]{0,400}?\bid=[\"']sys-summary[\"'][\s\S]{0,400}?>[\s\S]{0,400}?</button>",
            HTML,
            flags=re.IGNORECASE,
        )
    assert block, "sys-summary button block missing"
    body = block.group(0)
    assert "sys-summary-ico" in body
    assert "sys-summary-label" in body


def test_css_busy_targets_summary_not_rerun_btn():
    assert "sys-summary.is-busy" in CSS or "button.sys-summary" in CSS
    assert "#sys-rerun-btn" not in CSS


def test_js_writes_label_node_not_button_textcontent():
    # Must not wipe ico via textContent on the button root
    assert "sys-summary-label" in JS
    assert "setSummaryBusy" in JS
    assert "summaryNodes" in JS


def test_i18n_recheck_hint_en_zh():
    assert "sys.recheckHint" in I18N
    assert "Click to re-check host" in I18N
    assert "点击重新检测主机" in I18N
