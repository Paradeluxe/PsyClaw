# Install (lab PC)

PsyClaw WebUI is a **local** Flask app. It does not host remote participants.
Data stays on the experiment machine under your project folder `data/`.

This WebUI ships as part of the **psyclaw monorepo** (`Paradeluxe/psyclaw`) —
the `webui/` subdirectory. Clone once, get both the agent skill and the lab app.

## Requirements

| Need | Notes |
|------|--------|
| Python 3.10+ | For the **WebUI server** (Flask). Can be a normal venv. |
| PsychoPy environment | Separate Python that can `import psychopy`. **Prefer pip/venv library**; Standalone app is fallback. |
| OS | **Windows first** (folder pickers / Open folder raise). macOS/Linux: server runs; some dialogs fall back. |

PsychoPy is **not** bundled into the Flask venv by default. Prefer a separate env that can `import psychopy`:

```bash
pip install psychopy
# or: conda / a dedicated venv that can `import psychopy`
```

Standalone from [psychopy.org](https://www.psychopy.org/) still works if no library is on PATH.

**Version policy (ownership):** PsychoPy upgrades are **part of webui**, not the agent skill.  
- Day-to-day `git pull` does **not** bump PsychoPy unless this doc, a release note, or an optional req file (e.g. `requirements-psychopy.txt`) says so.  
- When a release **does** need a newer PsychoPy, state the pin here or in the changelog; webui update procedure applies it.  
- Agents updating "psyclaw" must not freestyle-upgrade PsychoPy on their own.

## 0. Where to put this repo

| | Path |
|--|------|
| **Default (recommended)** | `~/psyclaw` — Windows: `%USERPROFILE%\psyclaw` |
| **Custom** | Any writable folder the user chooses (fine) |
| **Remember** | Written to **`~/.psyclaw/config.json`** (`webui_root`). Optional env `PSYCLAW_WEBUI_ROOT` overrides. |

**Find order** (agents / update / doctor):

1. `PSYCLAW_WEBUI_ROOT` if set and valid  
2. `~/.psyclaw/config.json` → `webui_root`  
3. default `~/psyclaw` if it exists  
4. else ask (first install only)

```bash
# show / write remembered path
cd webui && python scripts/user_config.py show
python scripts/user_config.py remember
# → ~/.psyclaw/config.json
```

`start.py` and `make_desktop_shortcut.py` **auto-remember** this clone on run.

**Already installed?** If any step above finds a valid tree → **skip clone**; use **§ Update** only. Do not install a second copy unless the user asks for a new location.

First-time only (nothing found): ask **default vs custom path**, then either:

**A. One-shot (preferred)** — from any monorepo checkout or after downloading just the scripts:

```bat
REM Windows
set PSYCLAW_NONINTERACTIVE=1
path\to\psyclaw\skills\psyclaw\install-all.bat
REM optional custom root: install-all.bat D:\lab\psyclaw
```

```bash
# Unix
./skills/psyclaw/install-full.sh
# optional: ./skills/psyclaw/install-full.sh /path/to/psyclaw
```

One-shot: clone/pull · create `webui/.venv` · `pip install -r requirements.txt` · write `~/.psyclaw/config.json`.  
It **prints** agent skill install commands; it does not install Hermes for you.

**B. Manual clone + remember**

```bash
# default layout (Windows cmd)
git clone https://github.com/Paradeluxe/psyclaw.git "%USERPROFILE%\psyclaw"
cd /d "%USERPROFILE%\psyclaw\webui"
python scripts/user_config.py remember
```

## 1. Server deps

```bash
cd webui   # the webui/ subdirectory inside the monorepo
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Unix:
# source .venv/bin/activate
pip install -r requirements.txt
```

## 2. PsychoPy Python (library first)

Resolution order:

1. `PSYCLAW_PSYCHOPY_PYTHON` if set  
2. **Library** — `python` / `python3` on PATH that can `import psychopy`  
3. **Standalone** — common PsychoPy app install paths  

Override (optional; any interpreter that imports psychopy):

```bash
# Windows (PowerShell) — venv with psychopy installed
$env:PSYCLAW_PSYCHOPY_PYTHON = "E:\path\to\.venv\Scripts\python.exe"

# Standalone still OK
$env:PSYCLAW_PSYCHOPY_PYTHON = "C:\Program Files\PsychoPy\python.exe"
```

On shared lab machines, set the env var explicitly so the choice is stable.

Check resolution:

```bash
cd webui
python -c "from backend.psychopy_env import describe_resolution; import json; print(json.dumps(describe_resolution(), indent=2))"
```

## 3. Run (standalone launcher)

WebUI is a **standalone lab app** (no agent skill required). After §1 venv is ready:

| OS | Double-click / command |
|----|------------------------|
| **Any** | `cd webui && python start.py` (or `python3 start.py`) |
| **Windows** | `cd webui && start.bat` |
| **macOS** | `cd webui && start.command` (first time: right-click → Open, or `chmod +x start.command start.sh`) |
| **Linux** | `cd webui && ./start.sh` (`chmod +x start.sh` once) |

**Windows:** double-click `start.bat` — uses **only** repo `.venv\Scripts\python.exe` (no `py` launcher).  
**macOS/Linux:** `start.command` / `start.sh` → `python3 start.py`.  
Starts server, waits until `/api/health` is up, opens **http://127.0.0.1:8876/**.  
`--no-browser` skips the browser. Stop with Ctrl+C. On error, Windows console **pauses**.

Desktop shortcut must point at a clone that **already has** `.venv` (run §1 first). Recreate shortcut after install:

```bash
cd webui
python scripts/make_desktop_shortcut.py
```

Equivalent manual start:

```bash
cd webui
python backend/app.py
```

Default bind is localhost only. Port override: `PSYCLAW_PORT=9000`.  
Force mock runner (no PsychoPy): `PSYCLAW_FORCE_MOCK=1`.

**Port already in use:** `start.py` checks first.

| Situation | Behavior |
|-----------|----------|
| `8876` already serves this app (`/api/health`) | Open browser only — no second server |
| Something else on the port | Exit with a clear message; set `PSYCLAW_PORT=8877` (etc.) or free the port |
| Need a clean restart (after update) | `python start.py --restart` or `stop.bat` then `start.bat` |

```bash
# stop only (does not hang; kills listeners on 8876 + psyclaw python)
cd webui && python scripts/stop_server.py
# Windows: stop.bat

# stop + start + open browser
python start.py --restart
```

**Desktop shortcut (optional):**

```bash
cd webui
python scripts/make_desktop_shortcut.py
```

Uses `assets/icon.ico` (Windows) / `assets/icon.png` (Linux). macOS: drag `start.command` to Desktop; set icon from `assets/icon.png` via Get Info if desired.

Brand assets: `assets/icon.svg` (source), `icon.png`, `icon-512.png`, `icon.ico`. Browser tab uses `frontend/favicon.ico`.

## 4. First project

1. **Open** or **New** → choose an empty folder (or the example under `tests/example_experiment`).
2. Marker file is **`<folderName>.psyclaw`** (JSON design). Not PsychoPy Builder XML.
3. **System** tab → Re-run host check (PsychoPy import, display, disk free on project volume).
4. **Run** → Pilot (manual) or Autopilot (headless auto-keys for smoke) or Start (formal).

CSV lands in **`<project>/data/`** (and a copy under server `runs/<id>/`).

## 5. Update

**Entry:** user says 更新 / update psyclaw, **or** an agent runs its update and **nests** this section.

A single `git pull` updates both the skill (`skills/psyclaw/`) and the webui (`webui/`) since they live in one repo.

### Steps

```bash
cd ~/psyclaw   # or wherever you cloned the monorepo

# 0) If the lab UI is running, stop it first (bounded; do not "force restart" forever)
cd webui && python scripts/stop_server.py
# Windows: stop.bat
cd ..

git pull

# activate the same venv you use to run the server
cd webui
# Windows:  .venv\Scripts\activate
# Unix:     source .venv/bin/activate
pip install -r requirements.txt
```

1. **Stop old server** — `scripts/stop_server.py` (kills port **8876** + known `app.py`/`start.py` PIDs; **≤ ~20s**, then continues or reports failure). Do **not** spin on "Old server still running" without this script.  
2. **Code** — `git pull` on the tracked branch. Updates both skill and webui.  
3. **Server libs** — always re-run `pip install -r requirements.txt` after pull (safe if unchanged).  
4. **PsychoPy** — **only if this release says so** (note below, changelog, or optional `requirements-psychopy.txt`). Otherwise **do not** `pip install -U psychopy`.  
5. **Start again** — `python start.py` or `python start.py --restart` (stop+start in one).  
6. **Check** (optional) — System tab host check, or:
   ```bash
   cd webui
   python -c "from backend.psychopy_env import describe_resolution; import json; print(json.dumps(describe_resolution(), indent=2))"
   ```

### PsychoPy on update (default: leave alone)

| Situation | Action |
|-----------|--------|
| Pull has **no** PsychoPy pin / note | Leave current PsychoPy as-is |
| Release needs a newer library | Follow the pin in this doc or changelog (prefer library env, not Standalone reinstall unless documented) |
| PsychoPy missing entirely | Install once per § Requirements / § 2 (first-time), not every update |

### Done when

- Repo matches remote (or pull reported already up to date)  
- venv deps applied  
- PsychoPy touched **only** if this release required it  
- Server restarted if it was up  

## 6. Tests

```bash
cd webui
python -m pytest tests/ -q
```

## Agent skill

The agent skill lives in `skills/psyclaw/` inside this repo. Any AI CLI that
supports the `skills/<name>/SKILL.md` convention can discover and load it.

Install commands vary per CLI — check your agent's documentation. For Hermes:

```bash
hermes install Paradeluxe/psyclaw/skills/psyclaw
```

The skill is **not** required to run the WebUI. It helps an AI agent design
experiments and write `<folderName>.psyclaw` markers. The WebUI runs standalone.

## Not in this package

- Paper PDF libraries / 50+50+50 corpora (benchmark packages are separate).
- Cloud / browser-based multi-participant hosting.