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
