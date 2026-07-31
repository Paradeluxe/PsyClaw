from __future__ import annotations

import os
import shutil
import sys
import threading
from pathlib import Path

import pytest
from werkzeug.serving import make_server


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import create_app  # noqa: E402


@pytest.fixture(scope="module")
def live_app_url():
    app = create_app()
    app.config.update(TESTING=True)
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        thread.join(timeout=5)


def _browser_executable() -> str | None:
    candidates = [
        os.environ.get("CHROME_PATH"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
    ]
    return next((path for path in candidates if path and Path(path).is_file()), None)


def test_workspace_tabs_render_without_browser_errors(live_app_url: str) -> None:
    playwright = pytest.importorskip("playwright.sync_api")
    executable = _browser_executable()
    if not executable:
        pytest.skip("Chrome/Edge executable not available")

    project = ROOT / "tests" / "example_experiment"
    page_errors: list[str] = []
    console_errors: list[str] = []
    request_failures: list[str] = []

    with playwright.sync_playwright() as runner:
        browser = runner.chromium.launch(headless=True, executable_path=executable)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on(
            "requestfailed",
            lambda request: request_failures.append(
                f"{request.method} {request.url}: {request.failure}"
            ),
        )

        page.goto(live_app_url, wait_until="networkidle", timeout=30_000)
        page.evaluate(
            "([key, value]) => localStorage.setItem(key, JSON.stringify(value))",
            [
                "psyclaw.recentProjects",
                [{"path": str(project), "name": "example_experiment"}],
            ],
        )
        page.reload(wait_until="networkidle", timeout=30_000)
        page.wait_for_function(
            "() => document.body.classList.contains('has-project')", timeout=15_000
        )

        for tab in ("flow", "system", "run", "settings", "guide"):
            page.locator(f'.tab-btn[data-tab="{tab}"]').click()
            page.wait_for_timeout(250)
            assert page.locator(f"#tab-{tab}").is_visible()
            dimensions = page.evaluate(
                "() => ({scrollWidth: document.documentElement.scrollWidth, innerWidth})"
            )
            assert dimensions["scrollWidth"] == dimensions["innerWidth"]

        page.locator('.tab-btn[data-tab="settings"]').click()
        settings_width = page.locator(".settings-layout").evaluate(
            "element => element.getBoundingClientRect().width"
        )
        assert settings_width <= 1200
        assert page_errors == []
        assert console_errors == []
        assert request_failures == []
        browser.close()


def test_run_status_last_mode_content_and_colors(live_app_url: str) -> None:
    playwright = pytest.importorskip("playwright.sync_api")
    executable = _browser_executable()
    if not executable:
        pytest.skip("Chrome/Edge executable not available")

    project = ROOT / "tests" / "example_experiment"

    with playwright.sync_playwright() as runner:
        browser = runner.chromium.launch(headless=True, executable_path=executable)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(live_app_url, wait_until="networkidle", timeout=30_000)
        page.evaluate("() => localStorage.setItem('psyclaw.lang', 'en')")
        page.evaluate(
            "([key, value]) => localStorage.setItem(key, JSON.stringify(value))",
            [
                "psyclaw.recentProjects",
                [{"path": str(project), "name": "example_experiment"}],
            ],
        )
        page.reload(wait_until="networkidle", timeout=30_000)
        page.wait_for_function(
            "() => document.body.classList.contains('has-project')", timeout=15_000
        )
        page.locator('.tab-btn[data-tab="run"]').click()
        # Wait until gate leaves checking (badge not gate-checking) or timeout.
        page.wait_for_function(
            """() => {
              const b = document.getElementById('run-status-badge');
              if (!b) return false;
              return !(b.className || '').includes('gate-checking');
            }""",
            timeout=20_000,
        )

        expected = {
            "run": ("Last status: Start", "rgb(61, 204, 122)", "last-mode-run"),
            "pilot": ("Last status: Pilot", "rgb(183, 148, 246)", "last-mode-pilot"),
            "autopilot": ("Last status: Autopilot", "rgb(139, 155, 180)", "last-mode-autopilot"),
        }
        for mode, (text, color, cls) in expected.items():
            page.evaluate(
                """(mode) => {
                  if (!(window.PsyClawSystem && window.PsyClawSystem.setLastProven)) {
                    throw new Error('PsyClawSystem.setLastProven missing');
                  }
                  window.PsyClawSystem.setLastProven(mode);
                }""",
                mode,
            )
            badge = page.locator("#run-status-badge")
            content = badge.inner_text().strip()
            assert content.upper().startswith(text.upper()), content
            classes = badge.get_attribute("class") or ""
            assert cls in classes, classes
            # Block safety red may override mode color on this host — still keep mode class/text.
            if "gate-block" not in classes:
                assert badge.evaluate("el => getComputedStyle(el).color") == color
        browser.close()


@pytest.mark.parametrize(
    ("lang", "pilot_text", "autopilot_text"),
    [
        ("en", "Pilot", "Autopilot"),
        ("zh", "试飞", "自动驾驶"),
    ],
)
def test_run_mode_controls_are_readable_in_both_languages(
    live_app_url: str,
    lang: str,
    pilot_text: str,
    autopilot_text: str,
) -> None:
    playwright = pytest.importorskip("playwright.sync_api")
    executable = _browser_executable()
    if not executable:
        pytest.skip("Chrome/Edge executable not available")

    project = ROOT / "tests" / "example_experiment"

    with playwright.sync_playwright() as runner:
        browser = runner.chromium.launch(headless=True, executable_path=executable)
        for viewport in ({"width": 1440, "height": 900}, {"width": 800, "height": 700}):
            page = browser.new_page(viewport=viewport)
            page.goto(live_app_url, wait_until="networkidle", timeout=30_000)
            page.evaluate(
                "([k, v]) => localStorage.setItem(k, v)",
                ["psyclaw.lang", lang],
            )
            page.evaluate(
                "([key, value]) => localStorage.setItem(key, JSON.stringify(value))",
                [
                    "psyclaw.recentProjects",
                    [{"path": str(project), "name": "example_experiment"}],
                ],
            )
            page.reload(wait_until="networkidle", timeout=30_000)
            page.wait_for_function(
                "() => document.body.classList.contains('has-project')", timeout=15_000
            )
            page.locator('.tab-btn[data-tab="run"]').click()
            page.wait_for_timeout(200)
            pilot = page.locator("#pilot-run-btn")
            autopilot = page.locator("#autopilot-run-btn")
            assert pilot_text in pilot.inner_text()
            assert autopilot_text in autopilot.inner_text()
            assert pilot.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
            assert autopilot.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
            page.close()
        browser.close()


def test_flow_spacing_expands_only_for_crowded_loop_labels(live_app_url: str) -> None:
    playwright = pytest.importorskip("playwright.sync_api")
    executable = _browser_executable()
    if not executable:
        pytest.skip("Chrome/Edge executable not available")

    project = ROOT / "tests" / "example_experiment"
    design = {
        "name": "flow_spacing_probe",
        "routines": [
            {"name": name, "components": []}
            for name in ("intro", "practice", "trial", "feedback", "thanks")
        ],
        "flow": [
            {"kind": "routine", "routine": "intro"},
            {
                "kind": "loop",
                "name": "loop_practice_with_a_long_readable_name",
                "nReps": 16,
                "children": [
                    {"kind": "routine", "routine": "practice"},
                    {"kind": "routine", "routine": "trial"},
                ],
            },
            {"kind": "routine", "routine": "feedback"},
            {
                "kind": "loop",
                "name": "loop_end",
                "nReps": 2,
                "children": [{"kind": "routine", "routine": "thanks"}],
            },
        ],
    }

    with playwright.sync_playwright() as runner:
        browser = runner.chromium.launch(headless=True, executable_path=executable)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(live_app_url, wait_until="networkidle", timeout=30_000)
        page.evaluate(
            "([key, value]) => localStorage.setItem(key, JSON.stringify(value))",
            [
                "psyclaw.recentProjects",
                [{"path": str(project), "name": "example_experiment"}],
            ],
        )
        page.reload(wait_until="networkidle", timeout=30_000)
        page.wait_for_function(
            "() => document.body.classList.contains('has-project')", timeout=15_000
        )
        page.locator('.tab-btn[data-tab="flow"]').click()
        page.evaluate(
            "design => window.PsyClawBuilder.setDesign(design, {clean: true})",
            design,
        )
        page.wait_for_timeout(200)

        metrics = page.evaluate(
            """() => {
              const pills = [...document.querySelectorAll('.flow-pill')];
              const connectors = [...document.querySelectorAll('.flow-connector')];
              const brackets = [...document.querySelectorAll('.flow-bracket')];
              const rect = (el) => el.getBoundingClientRect();
              const longBracket = brackets.find((el) =>
                (el.querySelector('.flow-bracket-label')?.textContent || '')
                  .includes('long_readable_name'));
              const shortBracket = brackets.find((el) =>
                (el.querySelector('.flow-bracket-label')?.textContent || '') === 'loop_end');
              if (!longBracket || !shortBracket || pills.length < 5) {
                return { error: 'missing geometry', pillN: pills.length, bracketN: brackets.length };
              }
              const labelRect = rect(longBracket.querySelector('.flow-bracket-label'));
              const repsRect = rect(longBracket.querySelector('.flow-bracket-reps'));
              const unwrapRect = rect(longBracket.querySelector('.flow-bracket-x'));
              const connectorState = connectors.map((el) => ({
                base: Number(el.dataset.baseWidth || 0),
                width: rect(el).width,
              }));
              return {
                documentOverflow: document.documentElement.scrollWidth - innerWidth,
                connectorState,
                connectorWidths: connectorState.map((c) => c.width),
                longContentLeft: Math.min(labelRect.left, repsRect.left),
                longContentRight: Math.max(labelRect.right, repsRect.right, unwrapRect.right),
                leftNeighborRight: rect(pills[0]).right,
                rightNeighborLeft: rect(pills[3]).left,
                longBracketWidth: rect(longBracket).width,
                shortBracketWidth: rect(shortBracket).width,
              };
            }"""
        )
        assert "error" not in metrics, metrics
        assert metrics["documentOverflow"] == 0, metrics
        assert all(item["base"] == 40 for item in metrics["connectorState"]), metrics
        widths = [item["width"] for item in metrics["connectorState"]]
        assert max(widths) > 40, metrics
        # all connectors near a loop should open above base when labels need room
        assert min(widths) >= 40, metrics
        assert metrics["longContentLeft"] >= metrics["leftNeighborRight"] + 4, metrics
        assert metrics["longContentRight"] <= metrics["rightNeighborLeft"] - 4, metrics
        # long multi-child U must be wider than short single-child U
        assert metrics["longBracketWidth"] > metrics["shortBracketWidth"], metrics
        # long label must sit with air inside its widened neighborhood
        assert metrics["longBracketWidth"] >= (
            metrics["longContentRight"] - metrics["longContentLeft"]
        ), metrics

        page.set_viewport_size({"width": 800, "height": 700})
        page.wait_for_timeout(200)
        responsive = page.evaluate(
            """() => {
              const canvas = document.querySelector('.flow-canvas');
              const connectors = [...document.querySelectorAll('.flow-connector')];
              return {
                documentOverflow: document.documentElement.scrollWidth - innerWidth,
                flowScrollable: canvas.scrollWidth > canvas.clientWidth,
                maxConnector: Math.max(0, ...connectors.map((el) => el.getBoundingClientRect().width)),
              };
            }"""
        )
        assert responsive["documentOverflow"] == 0, responsive
        assert responsive["flowScrollable"] is True, responsive
        assert responsive["maxConnector"] <= 120, responsive
        browser.close()


def test_start_never_open_ended(live_app_url: str) -> None:
    """start is onset >=0; only duration may be -1 / ∞."""
    from pathlib import Path

    playwright = pytest.importorskip("playwright.sync_api")
    chrome = _browser_executable()
    if chrome is None:
        pytest.skip("Chrome/Edge not found")

    example = Path(__file__).resolve().parent / "example_experiment"
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=chrome)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(live_app_url, wait_until="networkidle", timeout=30_000)
        page.evaluate(
            "([k, v]) => localStorage.setItem(k, JSON.stringify(v))",
            [
                "psyclaw.recentProjects",
                [{"path": str(example), "name": "example_experiment"}],
            ],
        )
        page.reload(wait_until="networkidle", timeout=30_000)
        page.wait_for_function("() => document.body.classList.contains('has-project')")
        page.locator('.tab-btn[data-tab="flow"]').click()
        page.wait_for_timeout(200)
        bad = {
            "name": "start_clamp",
            "routines": [
                {
                    "name": "r1",
                    "components": [
                        {
                            "id": "a",
                            "type": "text",
                            "name": "bad_start",
                            "start": -1,
                            "duration": 0.5,
                            "params": {"text": "x"},
                        },
                        {
                            "id": "b",
                            "type": "keyboard",
                            "name": "open_dur",
                            "start": 0.2,
                            "duration": -1,
                            "params": {"keys": "space"},
                        },
                        {
                            "id": "c",
                            "type": "text",
                            "name": "missing_start",
                            "duration": 1,
                            "params": {"text": "y"},
                        },
                    ],
                }
            ],
            "flow": [{"kind": "routine", "routine": "r1"}],
        }
        page.evaluate("d => PsyClawBuilder.setDesign(d,{clean:true})", bad)
        page.wait_for_timeout(250)
        metrics = page.evaluate(
            """() => {
              const d = PsyClawBuilder.getDesign();
              const comps = (d.routines[0].components || []).map(c => ({
                name: c.name, start: c.start, duration: c.duration,
              }));
              const labels = [...document.querySelectorAll('.bar-range')].map(el => el.textContent.trim());
              return { comps, labels };
            }"""
        )
        browser.close()

    by = {c["name"]: c for c in metrics["comps"]}
    assert by["bad_start"]["start"] == 0, metrics
    assert by["bad_start"]["duration"] == 0.5, metrics
    assert by["open_dur"]["start"] == 0.2, metrics
    assert by["open_dur"]["duration"] == -1, metrics
    assert by["missing_start"]["start"] == 0, metrics
    assert by["missing_start"]["duration"] == 1, metrics
    assert any(x.startswith("0–") or x.startswith("0.2–") for x in metrics["labels"]), metrics
    assert any("∞" in x for x in metrics["labels"]), metrics
    assert not any(x.startswith("∞") for x in metrics["labels"]), metrics


def test_run_bench_disclosure_copy_and_responsive_layout(live_app_url: str) -> None:
    playwright = pytest.importorskip("playwright.sync_api")
    executable = _browser_executable()
    if not executable:
        pytest.skip("Chrome/Edge executable not available")

    project = ROOT / "tests" / "example_experiment"
    sample_instr = {
        "ok": True,
        "mode": "autopilot",
        "n_rows": 6,
        "fps_hz": 60.0,
        "display": {"size": [1920, 1080], "fullscreen": False},
        "csv_project": str(project / "data" / "P_autopilot_s1_demo.csv"),
        "csv": str(project / "data" / "P_autopilot_s1_demo.csv"),
        "session": {"participant_id": "P_autopilot", "session": "1"},
        "metrics": {
            "overall": {
                "accuracy": 1.0,
                "mean_rt": 0.45,
                "n_scored": 6,
                "n_correct": 6,
            }
        },
        "run_id": "20260731_benchdemo",
        "at": "2026-07-31T12:00:00",
    }

    with playwright.sync_playwright() as runner:
        browser = runner.chromium.launch(headless=True, executable_path=executable)
        for viewport in (
            {"width": 1440, "height": 900},
            {"width": 1100, "height": 800},
            {"width": 751, "height": 831},
        ):
            context = browser.new_context(
                viewport=viewport,
                permissions=["clipboard-read", "clipboard-write"],
            )
            page = context.new_page()
            page.goto(live_app_url, wait_until="networkidle", timeout=30_000)
            page.evaluate("() => localStorage.setItem('psyclaw.lang', 'en')")
            page.evaluate(
                "([key, value]) => localStorage.setItem(key, JSON.stringify(value))",
                [
                    "psyclaw.recentProjects",
                    [{"path": str(project), "name": "example_experiment"}],
                ],
            )
            page.evaluate(
                "([key, value]) => localStorage.setItem(key, JSON.stringify(value))",
                [
                    "psyclaw.lastInstrument",
                    {
                        "instrument": sample_instr,
                        "meta": {
                            "mode": "autopilot",
                            "run_id": "20260731_benchdemo",
                            "when": "2026/7/31 12:00:00",
                        },
                        "savedAt": 1,
                    },
                ],
            )
            page.reload(wait_until="networkidle", timeout=30_000)
            page.wait_for_function(
                "() => document.body.classList.contains('has-project')", timeout=15_000
            )
            page.locator('.tab-btn[data-tab="run"]').click()
            page.wait_for_function(
                "() => document.querySelectorAll('#bench-design-chips .bench-chip').length > 0",
                timeout=15_000,
            )
            page.wait_for_function(
                "() => !document.getElementById('pilot-instrument-list').hidden",
                timeout=10_000,
            )

            toggle = page.locator("#bench-design-toggle")
            assert toggle.get_attribute("aria-expanded") == "false"
            assert page.locator("#bench-design-chips .bench-chip.is-pass:visible").count() == 0
            if toggle.is_visible():
                toggle.click()
                assert toggle.get_attribute("aria-expanded") == "true"
                assert page.locator("#bench-design-chips .bench-chip.is-pass:visible").count() > 0
                toggle.click()
                assert toggle.get_attribute("aria-expanded") == "false"

            page.locator('[data-copy-target="instr-csv"]').click()
            page.wait_for_timeout(100)
            assert page.locator('[data-copy-target="instr-csv"]').evaluate(
                "el => el.classList.contains('is-copied')"
            )
            assert page.locator("#instr-hit").inner_text().strip() == "n/a"
            assert page.locator("#instr-fa").inner_text().strip() == "n/a"

            metrics = page.evaluate(
                """() => {
                  const r = (s) => {
                    const el = document.querySelector(s);
                    if (!el) return null;
                    const b = el.getBoundingClientRect();
                    return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom};
                  };
                  return {
                    core: r('#bench-core'),
                    bench: r('#pilot-instrument-card'),
                    log: r('.run-log-panel'),
                    gridColumns: getComputedStyle(document.querySelector('.run-grid')).gridTemplateColumns,
                    coreColumns: getComputedStyle(document.querySelector('#bench-core')).gridTemplateColumns,
                    overflow: document.documentElement.scrollWidth - innerWidth,
                  };
                }"""
            )
            assert metrics["core"] is not None
            assert metrics["bench"] is not None
            assert metrics["log"] is not None
            assert metrics["overflow"] <= 1
            assert metrics["log"]["h"] >= 180
            if viewport["width"] <= 1100:
                assert metrics["log"]["y"] >= metrics["bench"]["bottom"] - 2
            if viewport["width"] == 751:
                # 2 columns at 760px breakpoint
                assert len([c for c in metrics["coreColumns"].split() if c.strip()]) == 2
            context.close()
        browser.close()
