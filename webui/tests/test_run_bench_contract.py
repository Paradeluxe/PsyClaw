from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "frontend" / "style.css").read_text(encoding="utf-8")
JS = (ROOT / "frontend" / "app-run.js").read_text(encoding="utf-8")
I18N = (ROOT / "frontend" / "i18n.js").read_text(encoding="utf-8")


def test_bench_keeps_two_run_cards_and_adds_three_last_run_groups():
    assert '<div class="run-grid">' in HTML
    assert 'id="pilot-instrument-card"' in HTML
    assert 'class="run-panel run-log-panel"' in HTML
    assert 'id="bench-core"' in HTML
    assert 'id="bench-details"' in HTML
    assert 'id="bench-files"' in HTML


def test_design_checks_have_explicit_expand_control():
    assert 'id="bench-design-toggle"' in HTML
    assert 'aria-expanded="false"' in HTML
    assert "function syncBenchDesignDisclosure" in JS


def test_files_have_frontend_copy_actions():
    assert 'data-copy-target="instr-folder"' in HTML
    assert 'data-copy-target="instr-csv"' in HTML
    assert "async function copyBenchValue" in JS


def test_bench_responsive_contract_keeps_existing_breakpoints():
    assert re.search(
        r"@media \(max-width: 1100px\)[\s\S]*?\.run-grid\s*\{\s*grid-template-columns:\s*1fr",
        CSS,
    )
    assert "@media (max-width: 760px)" in CSS
    assert "#tab-run .bench-core-grid" in CSS


def test_bench_restructure_preserves_instrument_data_targets():
    for element_id in (
        "instr-status", "instr-mode", "instr-rows", "instr-acc",
        "instr-mean-rt", "instr-hit", "instr-fa", "instr-fps",
        "instr-display", "instr-pid", "instr-sess", "instr-when",
        "instr-run", "instr-folder", "instr-csv",
    ):
        assert HTML.count(f'id="{element_id}"') == 1


def test_design_disclosure_keeps_problem_checks_visible():
    assert "bench-chip is-hidden-pass" in JS or "is-hidden-pass" in JS
    assert "st === 'pass'" in JS or 'st === "pass"' in JS
    assert "benchDesignExpanded" in JS
    assert "run.benchShowAll" in I18N
    assert "run.benchShowIssues" in I18N


def test_bench_copy_and_na_are_frontend_only():
    assert "async function copyBenchValue" in JS
    assert "navigator.clipboard.writeText" in JS
    assert "document.execCommand('copy')" in JS or 'document.execCommand("copy")' in JS
    assert "run.copyDone" in I18N
    assert "run.notApplicable" in I18N


def test_bench_visual_hierarchy_uses_tokens_and_no_tiny_type():
    assert "#tab-run .bench-core-grid" in CSS
    assert "#tab-run .bench-details-grid" in CSS
    assert "#tab-run .bench-files" in CSS
    assert "font-size: var(--fs-sm)" in CSS
    bench_start = CSS.find("/* ---- Bench")
    if bench_start < 0:
        bench_start = CSS.find("#tab-run .bench-")
    assert bench_start >= 0
    bench_slice = CSS[bench_start:]
    assert "font-size: 11px" not in bench_slice
    assert ".bench-chip.is-hidden-pass" in CSS
    assert ".bench-copy.is-copied" in CSS
