# psyclaw

[English](README.md) · [中文](README.zh-CN.md)

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Skill](https://img.shields.io/badge/AI%20skill-psyclaw-8B5CF6)](https://github.com/Paradeluxe/psyclaw)
[![Marker](https://img.shields.io/badge/marker-.psyclaw-0ea5e9)](https://github.com/Paradeluxe/psyclaw)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/Paradeluxe/psyclaw)
[![Lab GUI](https://img.shields.io/badge/lab%20GUI-psyclaw--webui-22c55e)](https://github.com/Paradeluxe/psyclaw)
[![GitHub stars](https://img.shields.io/github/stars/Paradeluxe/psyclaw?style=social)](https://github.com/Paradeluxe/psyclaw)

Turn a description (or paper Method) into a project folder with **`<folderName>.psyclaw`** — then run subjects and get CSV.

**Ethos: pick up and use.** Paper / NL → runnable marker → run subjects → trial long CSV + summary + by-condition + metrics_long under `data/`.

This is a **monorepo** — one clone gets both the agent skill and the lab GUI:

```
psyclaw/
├── skills/psyclaw/     ← agent skill (any AI CLI with skills/<name>/ convention)
├── webui/              ← lab GUI (Flask app: design / run / CSV)
├── LICENSE, NOTICE
```

## What's here

| Part | Role | Who uses it |
|------|------|-------------|
| **Skill** (`skills/psyclaw/`) | Write experiment 说明书 (`<folderName>.psyclaw`) | AI agent / CLI |
| **WebUI** (`webui/`) | Draw / run / CSV — local lab app | Human operator (standalone) |

## Quick start

```bash
# 1. Clone
git clone https://github.com/Paradeluxe/psyclaw.git ~/psyclaw

# 2. Install skill (CLI-specific)
# Hermes:
hermes install Paradeluxe/psyclaw/skills/psyclaw
# Claude Code:
cp -r ~/psyclaw/skills/psyclaw ~/.claude/skills/
# Any CLI: point your agent at ~/psyclaw/skills/psyclaw/

# 3. Setup webui
cd ~/psyclaw/webui
python -m venv .venv
# Windows:  .venv\Scripts\activate
# Unix:     source .venv/bin/activate
pip install -r requirements.txt

# 4. Start webui
python start.py
# → http://127.0.0.1:8876
```

## User usage pipeline

```text
INPUT
  ├─ Natural-language description of the experiment
  ├─ Paper Method / PDF / HTML / paste   (fetch via browser-skill if needed)
  └─ Existing project folder + marker   (edit in place)

        ▼
CLARIFY  (one question per turn · coach)
  • Design first (k×m, within/between/mixed)
  • then IV → DV → control → random → practice → response → trial
  • OutPath last  (default ./experiments/<slug>/)
  • Stop when satisfied, says write/defaults, or core items are clear

        ▼
WRITE + VALIDATE (marker ready)
  <projectDir>/<folderName>.psyclaw     # design JSON, not Builder .psyexp

        ▼
ASK RUN  (agent asks — do not wait for the user to invent the run request)
  "The design marker is ready. Run participants?"
        ├─ No  → stop
        └─ Yes → webui (run finished → CSV in project/data/)
```

| User intent | What happens |
|-------------|--------------|
| Create an experiment | clarify → write marker → **ask run** |
| Edit an existing design | edit marker → validate → **ask run** |
| Run / multi-subject | sequential webui runs; auto ID; experimenter=AI if agent-run |
| Design only / do not run | stop once marker is ready |
| First-time full setup | doctor → consent → install gaps only |

## One-shot install (skill source + webui)

Scripts live in **`skills/psyclaw/`** (also available after any monorepo clone):

| OS | Entry | Default target |
|----|--------|----------------|
| **Windows** | `skills\psyclaw\install-all.bat` | `%USERPROFILE%\psyclaw` |
| **macOS / Linux** | `skills/psyclaw/install-full.sh` | `~/psyclaw` |

```bat
REM Windows (cmd) — optional path arg; skip pause with PSYCLAW_NONINTERACTIVE=1
set PSYCLAW_NONINTERACTIVE=1
skills\psyclaw\install-all.bat
REM or: skills\psyclaw\install-all.bat D:\lab\psyclaw
```

```bash
# Unix
chmod +x skills/psyclaw/install-full.sh
./skills/psyclaw/install-full.sh
# or: ./skills/psyclaw/install-full.sh /path/to/psyclaw
```

What the one-shot does:

1. `git clone` (or `git pull` if already a monorepo) **Paradeluxe/psyclaw**
2. Creates `webui/.venv` + `pip install -r webui/requirements.txt`
3. Writes `~/.psyclaw/config.json` → `webui_root`
4. **Prints** CLI-specific skill install lines (does **not** force Hermes/Claude)

Then start: `cd webui && python start.py` → http://127.0.0.1:8876  
PsychoPy is still separate (needed only to run subjects) — see INSTALL.

**Smoke-checked (Windows, 2026-07-25):** fresh clone → venv → flask import → `/api/health` `app=psyclaw-webui` / `status=ok`.

## Install details

Full webui setup, PsychoPy configuration, update, and doctor:
- **`webui/docs/INSTALL.md`** — canonical lab app install
- **`skills/psyclaw/references/install-orchestrator.md`** — agent-side orchestration
- **One-shot above** — first machine / “装全套” entry

First use / full lab setup: doctor gaps → **ask consent** → install only missing pieces (or run one-shot with consent).

## Repo layout

```text
psyclaw/
├── skills/psyclaw/
│   ├── SKILL.md
│   ├── scripts/doctor.py
│   ├── install-full.sh, install-all.bat
│   └── references/        # pipeline, norms, webui handoff gates
├── webui/
│   ├── backend/           # Flask + design compiler + runner
│   ├── frontend/          # SPA (Builder / System / Run)
│   ├── start.py, start.bat
│   ├── requirements.txt
│   ├── docs/INSTALL.md
│   └── tests/
├── README.md, README.zh-CN.md
├── LICENSE, NOTICE
```

## Doctor

```bash
python skills/psyclaw/scripts/doctor.py
```

## Optimization plan (todo)

Trunk stays:

`input → lit? → clarify → write → validate → ask-run → webui handoff`

### Done — skill pipeline (≤0.3.11)

- [x] session file · validate · marker stub · intent dedupe · lit negatives · norms split · handoff layers

### Done — webui / monorepo (2026-07-25 · `c34b497`+)

- [x] launcher identity (`app=="psyclaw-webui"`)
- [x] historical run read-only rehydrate (`StateMachine.from_disk`)
- [x] mock CSV mirror to `<project>/data/`
- [x] regressions (66 tests) · Settings max-width 1200px
- [x] push `main` · GitHub **default_branch → main**
- [x] clear stale :8876 minimal sim · Hermes install skill synced to monorepo

### Open

#### P1 — repo / distribute

- [x] private `Paradeluxe/psyclaw-webui` deprecated banner → monorepo `webui/` (`dfb127f`; not archived)
- [x] `master` skill-only banner → use `main` monorepo (`7765521`; branch kept)
- [x] docs paths → `Paradeluxe/psyclaw` + `skills/psyclaw` + `webui/` (no `psyclaw-skill/` tree)
- [x] one-shot install (`install-all.bat` / `install-full.sh`) smoke + README entry (CRLF bat, working `python` probe)

#### P2 — webui polish

- [ ] System status explainer (PsychoPy warn / mock / n/a graphics); unify `可 Pilot` semantics
- [ ] long device-name truncation (title/hover)
- [ ] Display black-preview emptiness (border/checker/label) — do not force audio-card height match
- [ ] Run empty states (roster 0 / Instrument all —)
- [ ] split large frontend (`app.js` / `builder.js`) — separate task

#### P3 — local vault (no remote)

- [ ] commit vault teardown residue + `experiments/` smoke
- [ ] one-line boundary: vault = local papers/experiments, not the product repo

### Suggested order

1. ~~private webui archive note + master banner~~  
2. ~~monorepo path docs~~  
3. ~~install-all smoke~~  
4. System/Run polish  
5. frontend split (own PR)  
6. vault local commit  

Fuller Chinese checklist: [README.zh-CN.md](README.zh-CN.md#管线优化计划todo).

## License

**AGPL-3.0** — [LICENSE](LICENSE). PsychoPy is separate — [NOTICE](NOTICE).