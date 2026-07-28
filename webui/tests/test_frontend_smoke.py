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
        assert all(item["base"] == 32 for item in metrics["connectorState"]), metrics
        widths = [item["width"] for item in metrics["connectorState"]]
        assert max(widths) > 32, metrics
        # short loop may need a few px for unwrap; long loop gaps must open more
        assert min(widths) <= 40, metrics
        assert max(widths) - min(widths) >= 16, metrics
        expanded = [w for w in widths if w >= max(widths) - 1]
        assert expanded and max(expanded) - min(expanded) <= 1, metrics
        assert metrics["longContentLeft"] >= metrics["leftNeighborRight"] + 4, metrics
        assert metrics["longContentRight"] <= metrics["rightNeighborLeft"] - 4, metrics
        assert metrics["shortBracketWidth"] < metrics["longBracketWidth"], metrics

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
        assert responsive["maxConnector"] <= 96, responsive
        browser.close()
