"""
Split frontend/app.js into:
  app-system.js  — System tab (hardware / gate / probes)
  app-run.js     — Run tab (roster / instrument / arm)
  app.js         — shell (tabs, net, project, settings, boot)

Each module is a classic IIFE. Cross-calls go through window.PsyClawSystem / PsyClawRun.
No bundler. Safe load order: i18n → builder → app-system → app-run → app.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "frontend"
SRC = (ROOT / "app.js").read_text(encoding="utf-8")
lines = SRC.splitlines(keepends=True)

# 1-based inclusive ranges from analysis
# shell header: lines 1-107 (index 0:106) — includes IIFE open, t, tabs, net
# system: 108-1600  (statusLabel … end of system block before Run section header)
# run: 1601-2980 (Run section through end of wireRunTab body)
# rest: 2981-end stays in app.js (project, settings, boot) but needs imports of System/Run

# Find markers more robustly
def find_line(pred, start=0):
    for i in range(start, len(lines)):
        if pred(lines[i]):
            return i
    raise SystemExit(f"marker not found from {start}")

i_system = find_line(lambda l: "System / hardware checks" in l)
i_run = find_line(lambda l: "function wireRunTab" in l)
# back up to section comment for Run
i_run_sec = i_run
for j in range(i_run, max(0, i_run - 10), -1):
    if "----" in lines[j] or "Run" in lines[j]:
        i_run_sec = j
        break
# project section
i_project = find_line(lambda l: "function wireProjectFiles" in l)
for j in range(i_project, max(0, i_project - 15), -1):
    if "Design project files" in lines[j] or "----" in lines[j]:
        i_project = j
        break

print(f"system starts line {i_system+1}, run section {i_run_sec+1}, project {i_project+1}")

header = lines[:i_system]  # through net status end
system_body = lines[i_system:i_run_sec]
run_body = lines[i_run_sec:i_project]
tail = lines[i_project:]  # project + settings + boot + close

# Build app-system.js
system_js = """/* psyclaw-webui — System tab (host / engine / gate / device probes)
 * Loaded before app.js. Exposes window.PsyClawSystem.
 */
(function () {
  'use strict';

  function t(key, vars) {
    return (window.PsyClawI18n && window.PsyClawI18n.t)
      ? window.PsyClawI18n.t(key, vars)
      : (window.t ? window.t(key, vars) : key);
  }

  var lastSystemSnapshot = null;
  var systemCheckGen = 0;
  var lastDiskPathKey = null;

""" + "".join(system_body) + """

  window.PsyClawSystem = {
    wire: wireSystemTab,
    getSnapshot: function () { return lastSystemSnapshot; },
    refreshHostUI: function () {
      if (lastSystemSnapshot && typeof renderDeviceFigure === 'function') {
        renderDeviceFigure(
          lastSystemSnapshot.facts,
          lastSystemSnapshot.checks,
          lastSystemSnapshot.overall,
          lastSystemSnapshot.counts,
          lastSystemSnapshot.browserExtra
        );
      }
    },
    recheck: typeof runSystemChecks === 'function' ? runSystemChecks : null,
  };
})();
"""

# Build app-run.js
run_js = """/* psyclaw-webui — Run tab (roster / instrument / Start·Pilot·Autopilot)
 * Loaded before app.js. Exposes window.PsyClawRun.
 */
(function () {
  'use strict';

  function t(key, vars) {
    return (window.PsyClawI18n && window.PsyClawI18n.t)
      ? window.PsyClawI18n.t(key, vars)
      : (window.t ? window.t(key, vars) : key);
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }

""" + "".join(run_body) + """

  window.PsyClawRun = {
    wire: wireRunTab,
  };
})();
"""

# Check if run body uses escapeHtml vs escHtml
run_text = "".join(run_body)
if "escapeHtml(" in run_text and "function escapeHtml" not in run_text:
    # system or original had escapeHtml - inject alias
    run_js = run_js.replace(
        "function escHtml(s) {",
        "function escapeHtml(s) {\n    return escHtmlImpl(s);\n  }\n  function escHtmlImpl(s) {",
    )
    # simpler: just name it escapeHtml
    run_js = """/* psyclaw-webui — Run tab (roster / instrument / Start·Pilot·Autopilot)
 * Loaded before app.js. Exposes window.PsyClawRun.
 */
(function () {
  'use strict';

  function t(key, vars) {
    return (window.PsyClawI18n && window.PsyClawI18n.t)
      ? window.PsyClawI18n.t(key, vars)
      : (window.t ? window.t(key, vars) : key);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }

""" + "".join(run_body) + """

  window.PsyClawRun = {
    wire: wireRunTab,
  };
})();
"""

# New app.js shell
# Replace lastSystemSnapshot usage in settings with PsyClawSystem.refreshHostUI
tail_text = "".join(tail)
tail_text = tail_text.replace(
    """                          if (lastSystemSnapshot && typeof renderDeviceFigure === 'function') {
                            renderDeviceFigure(
                              lastSystemSnapshot.facts,
                              lastSystemSnapshot.checks,
                              lastSystemSnapshot.overall,
                              lastSystemSnapshot.counts,
                              lastSystemSnapshot.browserExtra
                            );
                          }""",
    """                          if (window.PsyClawSystem && typeof window.PsyClawSystem.refreshHostUI === 'function') {
                            window.PsyClawSystem.refreshHostUI();
                          }""",
)

# Also handle minified spacing variants - regex
import re
tail_text2, n = re.subn(
    r"if\s*\(\s*lastSystemSnapshot\s*&&\s*typeof\s+renderDeviceFigure\s*===\s*'function'\s*\)\s*\{[^}]*renderDeviceFigure\([^;]*;(?:\s*[^}]*)*\}",
    "if (window.PsyClawSystem && window.PsyClawSystem.refreshHostUI) { window.PsyClawSystem.refreshHostUI(); }",
    tail_text,
    count=1,
    flags=re.DOTALL,
)
if n:
    tail_text = tail_text2
    print("replaced lastSystemSnapshot block via regex")
else:
    # try line-by-line softer replace
    if "lastSystemSnapshot" in tail_text:
        print("WARNING: lastSystemSnapshot still in tail — manual fix needed")
        for i, line in enumerate(tail_text.splitlines()):
            if "lastSystemSnapshot" in line or "renderDeviceFigure" in line:
                print(f"  tail L{i+1}: {line[:100]}")

# boot() calls
tail_text = tail_text.replace("wireSystemTab();", "if (window.PsyClawSystem) window.PsyClawSystem.wire();")
tail_text = tail_text.replace("wireRunTab();", "if (window.PsyClawRun) window.PsyClawRun.wire();")

app_js = """/* psyclaw-webui SPA shell
 *
 * Tabs: Builder · System · Run
 * System → app-system.js (window.PsyClawSystem)
 * Run    → app-run.js    (window.PsyClawRun)
 * This file: tabs, net status, project files, settings, boot.
 */
(function () {
  'use strict';

  function t(key, vars) {
    return (window.PsyClawI18n && window.PsyClawI18n.t)
      ? window.PsyClawI18n.t(key, vars)
      : (window.t ? window.t(key, vars) : key);
  }

""" + "".join(header[6:])  # skip original header comment + IIFE + t (we rewrote)
# Wait - header includes IIFE open and t and tab code. Better rebuild carefully.

# Rebuild shell properly from original header without double IIFE
shell_inner = "".join(lines[8:i_system])  # from function t through net - includes t

app_js = (
    """/* psyclaw-webui SPA shell
 *
 * Tabs: Builder · System · Run
 * System → app-system.js (window.PsyClawSystem)
 * Run    → app-run.js    (window.PsyClawRun)
 * This file: tabs, net status, project files, settings, boot.
 */
(function () {
  'use strict';

"""
    + shell_inner
    + "\n"
    + tail_text
)

# Fix: tail_text still starts with wireProjectFiles section which was inside IIFE - good
# But original tail included closing })(); - good
# shell_inner starts with "  function t" - good
# Remove leftover system/run function refs

# Write files
(ROOT / "app-system.js").write_text(system_js, encoding="utf-8", newline="\n")
(ROOT / "app-run.js").write_text(run_js, encoding="utf-8", newline="\n")
# backup original
(ROOT / "app.js.bak-before-split").write_text(SRC, encoding="utf-8", newline="\n")
(ROOT / "app.js").write_text(app_js, encoding="utf-8", newline="\n")
print("wrote app-system.js", len(system_js))
print("wrote app-run.js", len(run_js))
print("wrote app.js", len(app_js))
print("system has wireSystemTab", "function wireSystemTab" in system_js)
print("run has wireRunTab", "function wireRunTab" in run_js)
print("app has wireProjectFiles", "function wireProjectFiles" in app_js)
print("app lastSystem leftover", "lastSystemSnapshot" in app_js)
print("app wireSystemTab call leftover", "wireSystemTab()" in app_js)
