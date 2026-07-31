# PsyClaw Run Bench UI/UX Optimization Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 优化 Run 页 Bench 的层级、美观性与可操作性，让设计警告、上次运行核心指标和产物路径在桌面与 751px 窄视口都能快速扫读，同时不改变现有后端预检与运行协议。

**Architecture:** 保留现有 `POST /api/design/preflight`、`renderInstrument()` 和 Instrument 数据结构，只重组 `#pilot-instrument-card` 的前端呈现。Bench 分为 Design、Last run 两层：Design 默认突出 warn/fail 并可展开全部检查；Last run 分成 Core metrics、Run details、Files，Files 增加前端复制能力。`run-grid` 保持 Instrument | Live log 两卡架构：宽屏并排、≤1100px 堆叠、751px 下核心指标 2×2、详情单列；Live log 只做必要的响应式与空态核验，不引入新的后端状态或第三张卡。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Flask、pytest、Playwright、Node `--check`、bsk/Chrome 截图核验

**现状与约束：**
- 工作区 `E:\hermes_playground\psyclaw` 已有大量未提交改动；Bench、design preflight 也在这些 WIP 中。禁止 `git checkout`、`git reset --hard`、整文件覆盖或 `git add -A`。
- 只编辑 monorepo 的 `webui/`；`:8876` 当前由 `E:\hermes_playground\psyclaw\webui\backend\app.py` 提供，磁盘与 served CSS/HTML 哈希一致。
- 当前真实截图：751×831 时 Bench 与 Live log 已堆叠；Bench 约 637px 高，Design 芯片换两行，Last run 平铺 15 行，Live log 约 216px 高。问题是 Bench 层级平、重复状态多、产物路径不可操作，不是后端缺功能。
- 保留黑红 mission-control、Manrope UI、JetBrains Mono telemetry；绿色仅表示通过，琥珀仅表示警告，红色仅表示失败/阻断。
- 不把 Session/Roster/Run controls 融入 Bench；不增加第三张 Run card；不删除 Instrument 字段的数据生产。
- 视觉完成必须用真实项目 `webui/tests/example_experiment` 打开 Run，检查 1440×900、1100×800、751×831 三个视口，并对截图做视觉核验。

---

### Task 1: 固化 Bench 结构与响应式合同

**Objective:** 用静态合同测试锁定 Bench 的三层 Last run 结构、设计检查展开控件、Files 操作位和现有两卡 Run IA。

**Files:**
- Create: `webui/tests/test_run_bench_contract.py`
- Test: `webui/tests/test_run_bench_contract.py`

**Step 1: Write failing test**

```python
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "frontend" / "style.css").read_text(encoding="utf-8")
JS = (ROOT / "frontend" / "app-run.js").read_text(encoding="utf-8")


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
    assert re.search(r"@media \(max-width: 1100px\)[\s\S]*?\.run-grid\s*\{\s*grid-template-columns:\s*1fr", CSS)
    assert "@media (max-width: 760px)" in CSS
    assert "#tab-run .bench-core-grid" in CSS
```

**Step 2: Run test to verify failure**

Run:

```bash
cd /e/hermes_playground/psyclaw/webui
./.venv/Scripts/python.exe -m pytest tests/test_run_bench_contract.py -q
```

Expected: FAIL — 当前没有 `bench-core`、`bench-details`、`bench-files`、展开按钮或复制动作。

**Step 3: Keep the test isolated from unrelated WIP**

测试只读取前端静态资产，不导入运行服务，不依赖 PsychoPy，也不改现有 `test_design_preflight.py`。

**Step 4: Re-run the focused test**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/test_run_bench_contract.py -q
```

Expected: 仍为预期 FAIL，而不是语法错误或路径错误。

**Step 5: Commit**

```bash
git add webui/tests/test_run_bench_contract.py
git diff --cached --stat
git diff --cached
# 仅在测试文件可独立提交时执行：
git commit -m "test(webui): define run bench ui contract"
```

---

### Task 2: 重组 Bench HTML 为 Core、Details、Files

**Objective:** 保留所有现有 DOM id 和数据来源，把 Last run 从无差别平铺列表重组为核心指标、运行详情和产物文件三层。

**Files:**
- Modify: `webui/frontend/index.html:513-558`
- Modify: `webui/tests/test_run_bench_contract.py`
- Test: `webui/tests/test_run_bench_contract.py`

**Step 1: Extend failing test for preserved Instrument IDs**

```python
def test_bench_restructure_preserves_instrument_data_targets():
    for element_id in (
        "instr-status", "instr-mode", "instr-rows", "instr-acc",
        "instr-mean-rt", "instr-hit", "instr-fa", "instr-fps",
        "instr-display", "instr-pid", "instr-sess", "instr-when",
        "instr-run", "instr-folder", "instr-csv",
    ):
        assert HTML.count(f'id="{element_id}"') == 1
```

**Step 2: Run test to verify failure**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/test_run_bench_contract.py::test_bench_keeps_two_run_cards_and_adds_three_last_run_groups -q
```

Expected: FAIL — 三层容器尚不存在。

**Step 3: Write minimal semantic markup**

将 `#bench-last` 内部改为：

```html
<div class="bench-section-head">
  <span class="bench-section-label" data-i18n="run.benchLast">Last run</span>
  <span class="bench-section-meta muted" id="bench-last-meta">—</span>
</div>
<p class="run-instr-empty muted" id="instr-empty" data-i18n="run.instrEmpty">...</p>

<div class="bench-last-content" id="pilot-instrument-list" hidden>
  <dl class="bench-core-grid" id="bench-core">
    <div class="bench-metric is-status"><dt data-i18n="run.instrStatus">Status</dt><dd id="instr-status">—</dd></div>
    <div class="bench-metric is-mode"><dt data-i18n="run.instrMode">Mode</dt><dd id="instr-mode">—</dd></div>
    <div class="bench-metric"><dt data-i18n="run.instrTrials">Trials</dt><dd id="instr-rows">—</dd></div>
    <div class="bench-metric"><dt data-i18n="run.instrAcc">Accuracy</dt><dd id="instr-acc">—</dd></div>
    <div class="bench-metric"><dt data-i18n="run.instrMeanRt">Mean RT</dt><dd id="instr-mean-rt">—</dd></div>
  </dl>

  <dl class="bench-details-grid" id="bench-details">
    <div><dt data-i18n="run.instrHit">Hit rate</dt><dd id="instr-hit">—</dd></div>
    <div><dt data-i18n="run.instrFa">FA rate</dt><dd id="instr-fa">—</dd></div>
    <div><dt data-i18n="run.instrFps">FPS</dt><dd id="instr-fps">—</dd></div>
    <div><dt data-i18n="run.instrDisplay">Display</dt><dd id="instr-display">—</dd></div>
    <div><dt data-i18n="run.instrPid">Participant</dt><dd id="instr-pid">—</dd></div>
    <div><dt data-i18n="run.instrSess">Session</dt><dd id="instr-sess">—</dd></div>
    <div><dt data-i18n="run.instrWhen">When</dt><dd id="instr-when">—</dd></div>
    <div><dt data-i18n="run.instrRun">Run</dt><dd id="instr-run">—</dd></div>
  </dl>

  <dl class="bench-files" id="bench-files">
    <div class="bench-file-row">
      <dt data-i18n="run.instrFolder">Folder</dt>
      <dd id="instr-folder">—</dd>
      <button type="button" class="bench-copy" data-copy-target="instr-folder" data-i18n-title="run.copyValue" title="Copy value" aria-label="Copy folder path">...</button>
    </div>
    <div class="bench-file-row">
      <dt data-i18n="run.instrCsv">CSV</dt>
      <dd id="instr-csv">—</dd>
      <button type="button" class="bench-copy" data-copy-target="instr-csv" data-i18n-title="run.copyValue" title="Copy value" aria-label="Copy CSV path">...</button>
    </div>
  </dl>
</div>
```

要求：
- `#pilot-instrument-list` 继续作为 `setInstrumentEmpty()` 的 show/hide 目标，避免改状态逻辑。
- 所有 `instr-*` id 只出现一次。
- Copy icon 用内联 Lucide-style SVG，无 emoji。
- 不恢复已删除的 Instrument Notes、Headless、Name、Timestamp、Experimenter、KB/Mic/Sound/Needs 行；本次不扩大范围。

**Step 4: Run structural tests**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/test_run_bench_contract.py -q
```

Expected: Files/structure 相关断言通过；Disclosure/JS 断言仍失败，留给下一任务。

**Step 5: Commit**

```bash
git add -p webui/frontend/index.html webui/tests/test_run_bench_contract.py
git diff --cached --stat
git diff --cached
# 只有 Bench hunks 可独立拆分时执行：
git commit -m "ui(run): structure bench metrics and files"
```

---

### Task 3: 让 Design 默认突出问题并可展开全部检查

**Objective:** 把 Design 从七个同权芯片压缩为“摘要 + warn/fail 默认可见 + 展开全部”，保留每项详情点击能力。

**Files:**
- Modify: `webui/frontend/index.html:523-531`
- Modify: `webui/frontend/app-run.js:1367-1470`
- Modify: `webui/frontend/i18n.js:458-466,1095-1103`
- Modify: `webui/tests/test_run_bench_contract.py`
- Test: `webui/tests/test_run_bench_contract.py`

**Step 1: Write failing behavior contract**

```python
def test_design_disclosure_keeps_problem_checks_visible():
    assert "bench-chip is-hidden-pass" in JS
    assert "c.status === 'pass'" in JS
    assert "benchDesignExpanded" in JS
    assert "run.benchShowAll" in I18N
    assert "run.benchShowIssues" in I18N
```

在测试文件顶部补：

```python
I18N = (ROOT / "frontend" / "i18n.js").read_text(encoding="utf-8")
```

**Step 2: Run test to verify failure**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/test_run_bench_contract.py::test_design_disclosure_keeps_problem_checks_visible -q
```

Expected: FAIL — 当前所有 pass/warn/fail 一律展开。

**Step 3: Implement disclosure without changing API**

在 Design section header 增加：

```html
<div class="bench-section-actions">
  <span class="bench-section-meta muted" id="bench-design-meta">—</span>
  <button type="button" class="bench-design-toggle" id="bench-design-toggle" aria-expanded="false" data-i18n="run.benchShowAll">Show all</button>
</div>
```

在 `app-run.js`：

```javascript
var benchDesignExpanded = false;

function syncBenchDesignDisclosure() {
  var toggle = document.getElementById('bench-design-toggle');
  var chips = document.getElementById('bench-design-chips');
  if (!toggle || !chips) return;
  chips.querySelectorAll('.bench-chip.is-pass').forEach(function (chip) {
    chip.classList.toggle('is-hidden-pass', !benchDesignExpanded);
  });
  toggle.setAttribute('aria-expanded', benchDesignExpanded ? 'true' : 'false');
  toggle.textContent = t(benchDesignExpanded ? 'run.benchShowIssues' : 'run.benchShowAll');
}
```

- `paintDesignPreflight()` 仍按 fail→warn→pass 排序。
- 每个 pass chip 保留在 DOM，只在折叠态加 `.is-hidden-pass`；warn/fail 永远可见。
- 若 `warn=0` 且 `fail=0`，折叠态保留一个简洁 `All checks passed` summary，不制造空白区。
- `bench-design-note` 默认只展示第一个 warn/fail；点击任意可见 chip 更新详情。
- 增加中英 i18n：`Show all / Show issues`、`展开全部 / 只看问题`、`All checks passed / 全部检查通过`。

**Step 4: Run focused tests and JS syntax check**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/test_run_bench_contract.py -q
node --check frontend/app-run.js
```

Expected: PASS；Node exit 0。

**Step 5: Commit**

```bash
git add -p webui/frontend/index.html webui/frontend/app-run.js webui/frontend/i18n.js webui/tests/test_run_bench_contract.py
git diff --cached --stat
git diff --cached
# 只有相关 hunks 可独立拆分时执行：
git commit -m "ui(run): focus bench design checks on issues"
```

---

### Task 4: 增加产物路径复制与明确的 n/a 语义

**Objective:** 让 Folder/CSV 可直接复制完整值，并把不可用指标从“像丢数据的破折号”变成清晰的 `n/a`，不改变 Instrument JSON。

**Files:**
- Modify: `webui/frontend/app-run.js:796-1048`
- Modify: `webui/frontend/i18n.js`
- Modify: `webui/tests/test_run_bench_contract.py`
- Test: `webui/tests/test_run_bench_contract.py`

**Step 1: Write failing contract for copy and n/a**

```python
def test_bench_copy_and_na_are_frontend_only():
    assert "async function copyBenchValue" in JS
    assert "navigator.clipboard.writeText" in JS
    assert "document.execCommand('copy')" in JS
    assert "run.copyDone" in I18N
    assert "run.notApplicable" in I18N
```

**Step 2: Run test to verify failure**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/test_run_bench_contract.py::test_bench_copy_and_na_are_frontend_only -q
```

Expected: FAIL — 当前无复制逻辑，缺失指标显示 `—`。

**Step 3: Implement copy and presentation helpers**

```javascript
function benchDisplayValue(value, applicable) {
  if (applicable === false || value == null || value === '') return t('run.notApplicable');
  return String(value);
}

async function copyBenchValue(targetId, button) {
  var target = document.getElementById(targetId);
  var value = target ? String(target.getAttribute('data-copy-value') || target.title || target.textContent || '').trim() : '';
  if (!value || value === '—' || value === t('run.notApplicable')) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch (e) {
    var area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  button.classList.add('is-copied');
  button.setAttribute('title', t('run.copyDone'));
  setTimeout(function () { button.classList.remove('is-copied'); button.setAttribute('title', t('run.copyValue')); }, 1200);
}
```

- `instr-folder` 与 `instr-csv` 保存完整路径到 `data-copy-value` 和 `title`；视觉文本继续 folder full path 与 CSV basename。
- `Hit rate`/`FA rate`/无 metrics 时显示 i18n `n/a`，并加 `.is-na`；`renderInstrument()` 每次更新时同步 class。
- 复制按钮使用事件委托绑定一次，避免每次 render 重复 listener。
- 不把 UID、Run ID、Participant 等扩展为复制按钮，YAGNI。

**Step 4: Run contract and smoke tests**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/test_run_bench_contract.py tests/test_frontend_smoke.py::test_workspace_tabs_render_without_browser_errors -q
node --check frontend/app-run.js
```

Expected: PASS；无 page/console/request error；Node exit 0。

**Step 5: Commit**

```bash
git add -p webui/frontend/app-run.js webui/frontend/i18n.js webui/tests/test_run_bench_contract.py
git diff --cached --stat
git diff --cached
# 仅相关 hunks：
git commit -m "feat(run): copy bench artifacts and clarify unavailable metrics"
```

---

### Task 5: 建立 Bench 视觉层级与 751px 响应式布局

**Objective:** 用 CSS 让 Core metrics 成为第一视觉层，Details 次之，Files 最后；保持黑红 mission-control，并在 751px 下清晰堆叠。

**Files:**
- Modify: `webui/frontend/style.css:4931-4959,5200-5221,5334-5379,6500-6607,7179-7313`
- Modify: `webui/frontend/index.html:9,805-808`
- Modify: `webui/tests/test_run_bench_contract.py`
- Test: `webui/tests/test_run_bench_contract.py`

**Step 1: Write failing CSS contract**

```python
def test_bench_visual_hierarchy_uses_tokens_and_no_tiny_type():
    assert "#tab-run .bench-core-grid" in CSS
    assert "#tab-run .bench-details-grid" in CSS
    assert "#tab-run .bench-files" in CSS
    assert "font-size: var(--fs-sm)" in CSS
    assert "font-size: 11px" not in CSS[CSS.index("/* ---- Bench"):]
    assert ".bench-chip.is-hidden-pass" in CSS
    assert ".bench-copy.is-copied" in CSS
```

**Step 2: Run test to verify failure**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/test_run_bench_contract.py::test_bench_visual_hierarchy_uses_tokens_and_no_tiny_type -q
```

Expected: FAIL — 当前 Bench 使用旧 `.status-list` 平铺和多处 11/12px fallback。

**Step 3: Implement minimal high-leverage CSS**

目标样式：

```css
/* Bench header */
#tab-run .bench-head { align-items: center; margin-bottom: 14px; }
#tab-run .bench-overall {
  font-size: var(--fs-xs);
  padding: 5px 10px;
  border-radius: 999px;
}

/* Sections */
#tab-run .bench-section { padding-top: 14px; margin-top: 14px; }
#tab-run .bench-section-head { align-items: center; margin-bottom: 10px; }
#tab-run .bench-section-label { font-family: var(--font); font-size: var(--fs-sm); text-transform: none; letter-spacing: .02em; }
#tab-run .bench-section-meta { font-size: var(--fs-xs); }

/* Core: five primary values, 3 columns wide */
#tab-run .bench-core-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}
#tab-run .bench-metric {
  min-width: 0;
  padding: 11px 12px;
  background: var(--void);
  border: 1px solid var(--line);
  border-radius: 6px;
}
#tab-run .bench-metric dt { font: 600 var(--fs-xs)/1.2 var(--font); color: var(--text-ghost); }
#tab-run .bench-metric dd { margin: 6px 0 0; font: 600 var(--fs-md)/1.2 var(--mono); color: var(--text); }

/* Details: compact, lower contrast */
#tab-run .bench-details-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 16px;
  margin: 14px 0 0;
  border-top: 1px solid var(--line);
}
#tab-run .bench-details-grid > div { display: grid; grid-template-columns: 6.75em minmax(0, 1fr); padding: 8px 0; border-bottom: 1px solid var(--line); }

/* Files: full-width, copyable telemetry */
#tab-run .bench-files { margin: 14px 0 0; display: grid; gap: 8px; }
#tab-run .bench-file-row { display: grid; grid-template-columns: 6.75em minmax(0, 1fr) 32px; align-items: center; gap: 8px; padding: 8px 10px; background: var(--void); border: 1px solid var(--line); border-radius: 6px; }
#tab-run .bench-file-row dd { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); }
#tab-run .bench-copy { width: 32px; height: 32px; ... }
#tab-run .bench-copy.is-copied { color: var(--ok); border-color: var(--ok); }
#tab-run .is-na { color: var(--text-ghost) !important; font-weight: 500 !important; }

/* Design disclosure */
#tab-run .bench-section-actions { display: flex; align-items: center; gap: 10px; min-width: 0; }
#tab-run .bench-design-toggle { ...secondary button... }
#tab-run .bench-chip.is-hidden-pass { display: none; }

@media (max-width: 760px) {
  #tab-run .bench-core-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  #tab-run .bench-details-grid { grid-template-columns: 1fr; }
  #tab-run .bench-file-row { grid-template-columns: 5.75em minmax(0, 1fr) 32px; }
  #tab-run .bench-section-head { align-items: flex-start; }
  #tab-run .bench-section-actions { flex-wrap: wrap; justify-content: flex-end; }
}

@media (max-width: 520px) {
  #tab-run .bench-core-grid { grid-template-columns: 1fr; }
}
```

约束：
- `run-grid` 宽屏仍为 `1fr / 1.35fr`，≤1100px 仍堆叠；不把 Live log 变成第三卡或 footer。
- Bench 内部字号底线 14px；不复活 9–11px telemetry density。
- `bench-design-note` 改为带琥珀/红色左边线的紧凑 callout，但不大面积填色。
- 删除未被 DOM 使用的 `.run-design-preflight` / `.run-design-checks` 死 CSS，避免旧设计与 Bench 规则双轨。
- 保持 cards gap 20px；Live log 在堆叠态 `min-height` ≥220px，日志区不塌成状态条。
- 更新 `style.css?v=`、`app-run.js?v=`、`i18n.js?v=` 为更高纯整数。

**Step 4: Run CSS/contract regression**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/test_run_bench_contract.py tests/test_run_mode_status_contract.py -q
node --check frontend/app-run.js
```

Expected: PASS；Node exit 0。

**Step 5: Commit**

```bash
git add -p webui/frontend/style.css webui/frontend/index.html webui/tests/test_run_bench_contract.py
git diff --cached --stat
git diff --cached
# 仅相关 hunks：
git commit -m "style(run): clarify bench hierarchy and responsive layout"
```

---

### Task 6: 添加真实浏览器交互与多视口测试

**Objective:** 自动验证 Bench 展开、复制、核心指标布局、窄屏堆叠、无横向溢出和 Live log 最小高度。

**Files:**
- Modify: `webui/tests/test_frontend_smoke.py`
- Test: `webui/tests/test_frontend_smoke.py`

**Step 1: Write failing Playwright test**

```python
def test_run_bench_disclosure_copy_and_responsive_layout(live_app_url: str) -> None:
    playwright = pytest.importorskip("playwright.sync_api")
    executable = _browser_executable()
    if not executable:
        pytest.skip("Chrome/Edge executable not available")

    project = ROOT / "tests" / "example_experiment"
    with playwright.sync_playwright() as runner:
        browser = runner.chromium.launch(headless=True, executable_path=executable)
        for viewport in (
            {"width": 1440, "height": 900},
            {"width": 1100, "height": 800},
            {"width": 751, "height": 831},
        ):
            context = browser.new_context(viewport=viewport, permissions=["clipboard-read", "clipboard-write"])
            page = context.new_page()
            page.goto(live_app_url, wait_until="networkidle", timeout=30_000)
            page.evaluate(
                "([key, value]) => localStorage.setItem(key, JSON.stringify(value))",
                ["psyclaw.recentProjects", [{"path": str(project), "name": "example_experiment"}]],
            )
            page.reload(wait_until="networkidle", timeout=30_000)
            page.wait_for_function("() => document.body.classList.contains('has-project')", timeout=15_000)
            page.locator('.tab-btn[data-tab="run"]').click()
            page.wait_for_function("() => document.querySelectorAll('#bench-design-chips .bench-chip').length > 0", timeout=15_000)

            toggle = page.locator("#bench-design-toggle")
            assert toggle.get_attribute("aria-expanded") == "false"
            assert page.locator("#bench-design-chips .bench-chip.is-pass:visible").count() == 0
            toggle.click()
            assert toggle.get_attribute("aria-expanded") == "true"
            assert page.locator("#bench-design-chips .bench-chip.is-pass:visible").count() > 0

            page.locator('[data-copy-target="instr-csv"]').click()
            assert page.locator('[data-copy-target="instr-csv"]').evaluate("el => el.classList.contains('is-copied')")

            metrics = page.evaluate(
                """() => {
                  const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom}; };
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
            assert metrics["overflow"] <= 1
            assert metrics["log"]["h"] >= 220
            if viewport["width"] <= 1100:
                assert metrics["log"]["y"] >= metrics["bench"]["bottom"]
            if viewport["width"] == 751:
                assert len(metrics["coreColumns"].split()) == 2
            context.close()
        browser.close()
```

**Step 2: Run test to verify failure**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/test_frontend_smoke.py::test_run_bench_disclosure_copy_and_responsive_layout -q
```

Expected: FAIL — 新结构/交互/布局尚未全部满足，或测试暴露 copy/响应式边界。

**Step 3: Make only minimal implementation adjustments**

根据失败点只调整：
- 展开按钮状态同步；
- copy fallback；
- `@media (max-width:760px)` 两列；
- stacked Live log `min-height`；
- 任何实际横向溢出。

禁止借机重构 Session、Roster、System 或 Builder。

**Step 4: Run browser tests to verify pass**

Run:

```bash
./.venv/Scripts/python.exe -m pytest \
  tests/test_frontend_smoke.py::test_run_bench_disclosure_copy_and_responsive_layout \
  tests/test_frontend_smoke.py::test_workspace_tabs_render_without_browser_errors \
  tests/test_run_mode_status_contract.py \
  tests/test_run_bench_contract.py -q
```

Expected: PASS；三个视口无横向溢出、Bench/Log 在窄屏正确堆叠、复制反馈可见。

**Step 5: Commit**

```bash
git add -p webui/tests/test_frontend_smoke.py webui/frontend/index.html webui/frontend/app-run.js webui/frontend/style.css
git diff --cached --stat
git diff --cached
# 仅相关 hunks：
git commit -m "test(run): cover bench interactions and responsive layout"
```

---

### Task 7: 完整回归、真实页面截图与视觉验收

**Objective:** 在真实服务与真实项目上证明 Bench 工作、美观、无回归，并记录工作区未提交状态，不误报完成。

**Files:**
- Verify only: `webui/frontend/index.html`
- Verify only: `webui/frontend/app-run.js`
- Verify only: `webui/frontend/i18n.js`
- Verify only: `webui/frontend/style.css`
- Verify only: `webui/tests/test_run_bench_contract.py`
- Verify only: `webui/tests/test_frontend_smoke.py`

**Step 1: Run syntax and focused suites**

Run:

```bash
cd /e/hermes_playground/psyclaw/webui
node --check frontend/app-run.js
./.venv/Scripts/python.exe -m pytest \
  tests/test_run_bench_contract.py \
  tests/test_run_mode_status_contract.py \
  tests/test_design_preflight.py \
  tests/test_frontend_smoke.py -q
```

Expected: Node exit 0；pytest 全 PASS，无新 warnings/errors。

**Step 2: Run broader WebUI regression**

Run:

```bash
./.venv/Scripts/python.exe -m pytest tests/ -q
```

Expected: 全套 PASS。若与已存在的非 Bench WIP 冲突，记录具体失败用例与失败是否由 Bench 修改导致，禁止把旧失败误算为本任务成功。

**Step 3: Verify the live service owns the edited tree**

Run:

```bash
curl -s http://127.0.0.1:8876/api/health
md5sum frontend/style.css
curl -s http://127.0.0.1:8876/style.css | md5sum
md5sum frontend/index.html
curl -s http://127.0.0.1:8876/ | md5sum
```

Expected: health 为 `{"app":"psyclaw-webui","status":"ok"}`；磁盘/served 哈希逐项相同。若 backend WIP 变更需要重启，先结束所有 :8876 LISTENING PID，再从 monorepo `webui/` 使用 `.venv/Scripts/python.exe backend/app.py` 启动，并在 3–5 秒内 health poll。

**Step 4: Capture and inspect three real screenshots**

使用 Playwright 或 bsk 打开 `webui/tests/example_experiment` → Run：

```text
1440×900  — Bench | Live log 并排；核心指标第一眼可见；两卡等高或内部滚动合理
1100×800  — 断点边界无挤压、无横向溢出
751×831   — Bench 在上、Live log 在下；Core 2×2；Details 单列；Files 可读可复制
```

截图必须滚动到 `#pilot-instrument-card` 与 `.run-log-panel` 同时可见；视觉核验：
- Design 折叠时仅 warn/fail + summary，展开后所有 pass 出现；
- Bench header、Design、Core、Details、Files 层级清楚；
- `n/a` 不像错误；Folder/CSV 截断但 title/data-copy-value 为完整值；
- Live log 仍是独立卡，不是 footer/第三卡；
- 黑红色板未被橙色/蓝色新 chrome 污染；
- 无 9–11px 小字、无卡片融合、无大面积 glow。

**Step 5: Audit git state and commit safely**

Run:

```bash
cd /e/hermes_playground/psyclaw
git status --short
git diff --stat
git diff --check
git diff -- webui/frontend/index.html webui/frontend/app-run.js webui/frontend/i18n.js webui/frontend/style.css webui/tests/test_run_bench_contract.py webui/tests/test_frontend_smoke.py
```

Expected: `git diff --check` exit 0；报告 Bench 相关文件与其它 WIP 分离情况。若用户随后要求 commit，使用 `git add -p` 逐 hunk 暂存，贴 commit SHA 与 git exit code；未获 push 授权不得 push。
