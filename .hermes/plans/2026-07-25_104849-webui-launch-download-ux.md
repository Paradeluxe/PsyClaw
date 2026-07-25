# WebUI Launch & Download UX Optimization Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make PsyClaw WebUI first-time install, day-to-day launch, and post-run data takeaway feel lab-operator-friendly (pick-up-and-use), without turning it into an installer product rewrite.

**Architecture:** Keep Flask + `start.py` + monorepo layout. Fix broken packaging paths, bootstrap missing `.venv` on first double-click, make install finish with shortcut + optional auto-start, and make “Download” deliver the real analysis pack (project `data/` names + full pack zip), not only sandbox `trials.csv`. Docs/release surface catch up last.

**Tech Stack:** Python 3.10+, Flask, vanilla JS SPA (`webui/frontend`), Windows `.bat` / `.lnk`, pytest, optional stdlib `zipfile` for data pack.

**Repo root:** `E:\hermes_playground\psyclaw` · webui: `webui/` · port `127.0.0.1:8876`

---

## Audit snapshot (current — 2026-07-25)

### A. 唤起 / Launch — what already works

1. `webui/start.py` — venv prefer, health identity (`app==psyclaw-webui` && `status==ok`), same-port reopen browser, foreign-port clear error, `--stop` / `--restart` / `--no-browser`, Windows `os.startfile` browser open, error pause on Win.
2. `start.bat` / `start.sh` / `start.command` — OS entry points.
3. Welcome gate + `tryAutoOpenLast` recent project — good cold start *inside* the SPA.
4. One-shot `skills/psyclaw/install-all.bat` + `install-full.sh` — clone/pull + venv + pip + `~/.psyclaw/config.json`.
5. `docs/INSTALL.md` — thorough for a technical operator.
6. Launcher identity tests: `webui/tests/test_launchers.py`.

### B. 唤起 / Launch — not user-friendly (ranked)

| # | Friction | Evidence | Severity |
|---|----------|----------|----------|
| L1 | **First double-click dies** if no `.venv` | `start.bat` only prints create-venv recipe; no bootstrap | **P0** |
| L2 | **Desktop shortcut icon broken** | `make_desktop_shortcut.py` → `assets/icon.ico`; disk has `webui/icon.ico` only, **no `assets/`** | **P0** |
| L3 | **Install ends with “go type commands”** | `install-all.bat` does not create shortcut, does not offer start | **P1** |
| L4 | **No GitHub Release / zip** | `gh release list` empty; `has_downloads=false`; lab PCs without git stuck | **P1** |
| L5 | **Chicken-egg one-shot** | To run `install-all.bat` you already need a clone or raw script download | **P1** (docs + Release zip) |
| L6 | Always-on console window | Looks like dev tool; acceptable for v0.1 lab, not “app” | **P2** (optional later) |
| L7 | PsychoPy still a second cliff | Flask boots without it; real Start needs separate env — System tab helps but first-run copy is thin | **P2** |
| L8 | Release packaging skill/docs stale | `references/release-packaging.md` still says MIT / old `psyclaw-webui` path | **P2** docs only |

### C. 下载 / Download — two meanings

**C1. Software download (get the product onto the machine)** — see L4/L5.

**C2. Experiment data download (after a run)**

| # | Friction | Evidence | Severity |
|---|----------|----------|----------|
| D1 | Button only hits sandbox `trials.csv` | `app-run.js`: `'/api/runs/' + id + '/data/trials.csv'` | **P0** |
| D2 | Browser may **display** CSV not save | `routes.run_data`: `as_attachment=False`, mimetype always `text/csv` | **P0** |
| D3 | Filename generic `trials.csv` | Not `{id}_s{sess}_{ts}.csv` under project `data/` | **P0** |
| D4 | Full pack not downloadable | Disk has `_summary.json` + `_by_condition.csv` + `_metrics_long.csv`; UI ignores them | **P1** |
| D5 | “Open folder” is the real path, but easy to miss | Works via `/api/projects/reveal`; Download button sits in log footer looking primary | **P1** IA |
| D6 | Instrument CSV row is text-only | No click-to-reveal file / no download of *that* basename | **P2** |

### D. Verdict (plain)

- **Day-2 launch** (already installed, `.venv` exists): **acceptable** — `start.bat` / shortcut / `start.py --restart` are fine once fixed icon path.
- **Day-0 install + first launch:** **not pick-up-and-use** — requires git + Python literacy; double-click fails without prior terminal steps.
- **Post-run data takeaway:** **half-done** — project `data/` mirror is correct product; the labeled **Download CSV** button is a leaky sandbox shortcut that under-delivers vs Guide copy.

**Do not** in this plan: Electron/packaged exe, auto-install PsychoPy, cloud hosting, frontend mega-refactor, skill auto-patch.

---

## Target UX (acceptance)

### Launch

1. Fresh Windows lab PC with Python 3.10+ on PATH: double-click **one** entry (or run one-shot) → venv created if missing → deps installed if missing → server up → browser opens `http://127.0.0.1:8876/`.
2. Desktop shortcut named **PsyClaw WebUI** with working product icon.
3. Re-double-click while already running → browser only (no scary dual server).
4. Dirty port (other app) → Chinese/English clear error + `PSYCLAW_PORT` hint (already mostly true).
5. Optional: GitHub Release zip of monorepo snapshot + README “Download ZIP” path for no-git machines.

### Download (data)

1. After `finished`, primary action gets **analysis-ready** files with real names.
2. Prefer: open/reveal project `data/`; secondary: browser download of trial CSV **and** full pack zip.
3. Attachment headers + sensible filename; never force-navigate away from SPA if avoidable (`<a download>` or `blob` fetch).
4. Guide strings match behavior (en/zh).

---

## Task breakdown

### Task 1: Fix desktop shortcut icon path (P0)

**Objective:** Shortcut uses real `webui/icon.ico` (and png on Linux).

**Files:**
- Modify: `webui/scripts/make_desktop_shortcut.py`
- Modify: `webui/docs/INSTALL.md` (assets → root icons if mentioned)
- Test: `webui/tests/test_desktop_shortcut_paths.py` (new)

**Step 1: Write failing test**

```python
# webui/tests/test_desktop_shortcut_paths.py
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_icon_ico_exists_at_webui_root():
    assert (ROOT / "icon.ico").is_file()

def test_make_desktop_shortcut_resolves_root_icon():
    import importlib.util
    path = ROOT / "scripts" / "make_desktop_shortcut.py"
    spec = importlib.util.spec_from_file_location("mds", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    # Prefer a small helper if added; else assert source no longer hardcodes assets/ only
    ico = ROOT / "icon.ico"
    assert ico.is_file()
    src = path.read_text(encoding="utf-8")
    assert "assets/icon.ico" not in src or "icon.ico" in src
    # After fix: primary path is root icon.ico
    assert 'os.path.join(root, "icon.ico")' in src or "icon.ico" in src
```

**Step 2: Run test to verify failure**

Run: `cd webui && python -m pytest tests/test_desktop_shortcut_paths.py -v`  
Expected: FAIL or weak assert until path fixed.

**Step 3: Minimal implementation**

In `make_desktop_shortcut.py`:

```python
def _icon_ico(root: str) -> str:
    for rel in ("icon.ico", os.path.join("assets", "icon.ico")):
        p = os.path.join(root, rel)
        if os.path.isfile(p):
            return p
    return os.path.join(root, "icon.ico")

def _icon_png(root: str) -> str:
    for rel in ("icon.png", os.path.join("assets", "icon.png")):
        p = os.path.join(root, rel)
        if os.path.isfile(p):
            return p
    return os.path.join(root, "icon.png")
```

Use `_icon_ico` / `_icon_png` in Windows/Linux shortcut builders. Keep fallback to `assets/` for forward-compat.

**Step 4: Run test to verify pass**

Run: `python -m pytest tests/test_desktop_shortcut_paths.py -v`  
Expected: PASS

**Step 5: Commit**

```bash
git add webui/scripts/make_desktop_shortcut.py webui/tests/test_desktop_shortcut_paths.py webui/docs/INSTALL.md
git commit -m "fix(webui): resolve desktop shortcut icon from webui root"
```

---

### Task 2: Bootstrap `.venv` on first `start.bat` / `start.py` (P0)

**Objective:** First launch creates venv + installs `requirements.txt` when missing, then starts.

**Files:**
- Modify: `webui/start.py`
- Modify: `webui/start.bat` (optional thin: allow system python to run start.py once)
- Test: `webui/tests/test_launchers.py` (extend) or `test_start_bootstrap.py`

**Step 1: Write failing test**

```python
def test_ensure_venv_creates_when_missing(tmp_path, monkeypatch):
    # import start module helpers after extracting:
    # _ensure_runtime(root) -> python_exe
    ...
    assert not (tmp_path / ".venv").exists()
    # with monkeypatch on subprocess for venv+pip
    py = launcher._ensure_runtime(str(tmp_path))
    assert py.endswith("python.exe") or py.endswith("python")
```

**Step 2: Run — expect FAIL** (`_ensure_runtime` missing)

**Step 3: Implementation sketch**

In `start.py` before `_resolve_python`:

1. If `_venv_python(root)` missing:
   - Find host python ≥3.10 (current/`python`/`py -3` probe — mirror install-all logic carefully on Win).
   - `subprocess.run([host, "-m", "venv", ".venv"], cwd=root, check=True)`
   - `subprocess.run([venv_py, "-m", "pip", "install", "-r", "requirements.txt"], cwd=root, check=True)`
   - Print progress lines: `Creating .venv…` / `Installing deps…`
2. If venv exists but `import flask` fails → `pip install -r requirements.txt` once.
3. On failure → clear message + link `docs/INSTALL.md`; Windows pause (existing).

`start.bat` change: if no `.venv`, fall back to `where python` / `py -3` to run `start.py` (so bootstrap can run), else keep venv-only path:

```bat
if exist "%VENV_PY%" (
  "%VENV_PY%" "%START_PY%" %*
) else (
  where python >nul 2>&1 && python "%START_PY%" %* && goto :after
  where py >nul 2>&1 && py -3 "%START_PY%" %* && goto :after
  echo missing Python 3.10+ ...
  set ERR=1
)
```

**Step 4: Tests**

- Unit: mock subprocess; assert call order venv → pip → resolve.
- Do **not** real-network pip in CI; mark optional integration.

Run: `python -m pytest tests/test_launchers.py tests/test_start_bootstrap.py -q`  
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat(webui): bootstrap venv+deps on first start"
```

---

### Task 3: One-shot install finishes with shortcut + start hint (P1)

**Objective:** After `install-all.bat` / `install-full.sh`, create desktop shortcut and print one obvious next action; optional `PSYCLAW_START=1` auto-launch.

**Files:**
- Modify: `skills/psyclaw/install-all.bat`
- Modify: `skills/psyclaw/install-full.sh`
- Modify: `webui/docs/INSTALL.md`, root `README.md` / `README.zh-CN.md` (one line)

**Step 1: No heavy TDD — smoke script**

```bat
REM after install section
".venv\Scripts\python.exe" scripts\make_desktop_shortcut.py
echo.
echo Next: double-click Desktop "PsyClaw WebUI"  OR  start.bat
if /i "%PSYCLAW_START%"=="1" (
  start "" "%~dp0..\..\webui\start.bat"
)
```

Careful with relative path from `skills/psyclaw/` — use `%WEBUI_DIR%`.

**Step 2: Manual verify**

Run (noninteractive):  
`set PSYCLAW_NONINTERACTIVE=1 && skills\psyclaw\install-all.bat %TEMP%\psyclaw-smoke`  
Expected: shortcut created under Desktop (or skip if no Desktop); exit 0.

**Step 3: Commit**

```bash
git commit -m "feat(install): create desktop shortcut at end of one-shot"
```

---

### Task 4: Data download API — attachment + real filename (P0)

**Objective:** `GET /api/runs/<id>/data/<file>` downloads as attachment; trial CSV uses project-facing name when known.

**Files:**
- Modify: `webui/backend/api/routes.py` (`run_data`)
- Modify: `webui/backend/runner/...` only if need metadata read
- Test: `webui/tests/test_api_flows.py` or `test_run_data_download.py`

**Step 1: Failing test**

```python
def test_run_data_attachment_header(client, finished_run_with_csv):
    r = client.get(f"/api/runs/{run_id}/data/trials.csv")
    assert r.status_code == 200
    cd = r.headers.get("Content-Disposition", "")
    assert "attachment" in cd.lower()
    assert ".csv" in cd.lower()
```

**Step 2: Run — FAIL** (`as_attachment=False`)

**Step 3: Implementation**

```python
return send_from_directory(
    data_dir,
    filename,
    mimetype=_guess_mime(filename),  # csv vs json
    as_attachment=True,
    download_name=_download_name(run_id, filename),  # prefer mirrored basename from instrument/state
)
```

`_download_name`: if `filename == "trials.csv"` and state/instrument has `csv` basename or project mirror name, use that; else `trials.csv`.

**Step 4: PASS + commit**

```bash
git commit -m "fix(webui): send run data as attachment with real filename"
```

---

### Task 5: Download full data pack (zip) + UI wiring (P0/P1)

**Objective:** One click gets trial + summary + by_condition + metrics_long when present.

**Files:**
- Create: route `GET /api/runs/<id>/data-pack.zip` (or `/export`)
- Modify: `webui/frontend/app-run.js`
- Modify: `webui/frontend/index.html` (button label / second action)
- Modify: `webui/frontend/i18n.js` (en/zh)
- Test: `webui/tests/test_data_pack_download.py`

**Step 1: Failing test**

```python
def test_data_pack_zip_contains_trials(client, finished_run_with_pack):
    r = client.get(f"/api/runs/{run_id}/data-pack.zip")
    assert r.status_code == 200
    assert r.headers["Content-Type"].startswith("application/zip")
    import io, zipfile
    z = zipfile.ZipFile(io.BytesIO(r.data))
    names = z.namelist()
    assert any(n.endswith(".csv") for n in names)
```

**Step 2: Implementation**

- Build zip in memory or temp from `runs/<id>/data/*` **and** if `project_path` known, prefer files from `<project>/data/` matching this run’s stem.
- Filename: `{participant}_s{sess}_{ts}_pack.zip` or `{run_id}_data.zip`.

**Step 3: Frontend**

Replace or split footer actions:

- Primary: **Download data pack** → `/api/runs/${id}/data-pack.zip` via temporary `<a download>` (stay on page).
- Secondary text link: **CSV only** → trials attachment.
- Keep **Open folder** as strongest lab path (already in toolbar).

Enable when `status === 'finished'` (same as today).

**Step 4: i18n**

```js
'run.downloadPack': 'Download data pack',
'run.downloadCsv': 'Download CSV only',
// zh
'run.downloadPack': '下载数据包',
'run.downloadCsv': '仅下载 CSV',
```

Update Guide strings `guide.csvDesc`.

**Step 5: Commit**

```bash
git commit -m "feat(webui): download full post-run data pack zip"
```

---

### Task 6: Run tab IA — make Open folder + pack obvious (P1)

**Objective:** Operator sees where files went without reading Guide.

**Files:**
- Modify: `webui/frontend/index.html` (log footer / instrument)
- Modify: `webui/frontend/app-run.js` (on finished: log line with absolute `data/` path)
- Modify: `webui/frontend/style.css` (minor; bump `?v=`)
- Modify: `webui/frontend/index.html` cache bust

**Step 1: On finished transition**

```js
appendLog('INFO', t('run.dataReady', { dir: projectDataDir || 'project/data' }));
```

**Step 2: Instrument CSV row**

If `#instr-csv` has a basename and project path known, make it a button/link calling reveal **or** download that file (no new backend if reveal folder is enough — prefer reveal `data/` subfolder if easy; else keep folder root).

**Step 3: Visual verify**

Hard-refresh `http://127.0.0.1:8876/?v=…` → Pilot mock finish → log shows path → pack download works → Open folder raises Explorer.

**Step 4: Commit**

```bash
git commit -m "ux(webui): surface data path after finished run"
```

---

### Task 7: GitHub Release zip path (P1 — docs + script only unless user ok to tag)

**Objective:** No-git lab can download a zip; README documents it. **Do not tag/push release without user OK.**

**Files:**
- Create: `webui/scripts/build_dist_zip.py` (local artifact under `%TEMP%` or `dist/`)
- Modify: root `README.md` / `README.zh-CN.md` / `webui/docs/INSTALL.md` — “Download ZIP” section
- Modify: `webui/docs/RELEASE_CHECKLIST.md` — attach zip steps

**Step 1: Dist script**

```python
# Pack monorepo without .git, .venv, runs/, __pycache__, vault paths
# Output: psyclaw-webui-0.1.0-src.zip containing skills/ + webui/ + README
```

**Step 2: INSTALL.md section**

```markdown
## No git?

1. Download source zip from GitHub Releases (or Code → Download ZIP on main).
2. Unzip to `%USERPROFILE%\psyclaw`
3. Double-click `webui\start.bat` (Task 2 bootstrap) OR run `skills\psyclaw\install-all.bat` if tree incomplete.
```

**Step 3: Commit docs+script only**

```bash
git commit -m "docs(webui): no-git zip install path + dist script"
```

**Step 4: User gate** — ask before `gh release create`.

---

### Task 8: Docs / skill hygiene for launch+download (P2)

**Objective:** Public copy matches behavior; stale release-packaging note fixed in monorepo docs only (not auto-patch protected hub skill).

**Files:**
- Modify: `webui/docs/INSTALL.md`, `webui/README.md`, `webui/README.zh-CN.md`
- Modify: monorepo root READMEs if Quick start still assumes manual venv only
- Optional hand edit: Hermes skill `psyclaw-webui` references (manual; **no** `skill_manage` on protected skills)

Checklist:

- [ ] First launch = double-click / bootstrap described before multi-step venv
- [ ] Download = pack + project `data/` + Open folder
- [ ] Icon path `icon.ico` not `assets/icon.ico` only
- [ ] Remove MIT/skeleton tone if any remains in webui docs

**Commit:**

```bash
git commit -m "docs: align install and download UX with launcher bootstrap"
```

---

### Task 9: Regression gate (mandatory end)

**Objective:** Green tests + manual launch smoke on this machine.

**Steps:**

```bash
cd E:/hermes_playground/psyclaw/webui
python -m pytest tests/ -q
# free 8876 if dirty
python scripts/stop_server.py
python start.py --no-browser &
sleep 3
curl -s http://127.0.0.1:8876/api/health
# expect: {"app":"psyclaw-webui","status":"ok"}
```

Manual:

1. `stop` → delete `.venv` in a **temp copy** of webui → `start.bat` → boots.
2. Finished Pilot → Download pack → zip opens with ≥1 csv.
3. Desktop shortcut icon visible (re-run `make_desktop_shortcut.py`).

**Commit only if fixes needed.**

---

## Out of scope (explicit)

- Silent GUI (no console) / tray app / NSIS / MSIX
- Bundling PsychoPy inside Flask venv by default
- Changing marker format or Run FSM
- Auto `skill_manage` on hub `psyclaw` / hand `psyclaw-webui` skill
- Push / GitHub Release publish without user OK
- Frontend module split (already done `b67f86f`)

---

## Suggested execution order

1. Task 1 icon (2 min, pure win)  
2. Task 4 attachment filename (data honesty)  
3. Task 5 data pack zip + UI  
4. Task 6 finished log IA  
5. Task 2 start bootstrap (highest install impact)  
6. Task 3 one-shot shortcut  
7. Task 7 dist zip script + docs  
8. Task 8 docs align  
9. Task 9 full gate  

## Risk notes

- Bootstrap pip needs network first time — message must say so; offline labs use prebuilt venv or wheelhouse later (not this plan).
- Zip of project data must not path-traverse; only files under run data dir / resolved project data dir.
- `start.bat` fallback to system Python must still prefer venv after bootstrap.
- Do not `git checkout` uncommitted frontend WIP.

## Done definition

- [ ] Double-click path works without pre-created `.venv` (with Python on PATH)
- [ ] Desktop shortcut shows product icon
- [ ] Finished run → download pack with real analysis files OR clear Open folder path
- [ ] CSV download uses attachment + non-generic name when available
- [ ] `pytest` green; health identity still enforced
- [ ] README/INSTALL describe both git and zip first-run
- [ ] No public release/tag unless user says so
