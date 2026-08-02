# PsyClaw WebUI

> **Monorepo package.** This folder is `webui/` inside
> **[Paradeluxe/psyclaw](https://github.com/Paradeluxe/psyclaw)** (`main`).
> Clone that repo — do not treat the deprecated private `psyclaw-webui` tree as source of truth.
> Agent skill lives next to this package at `skills/psyclaw/`.

[English](README.md) · [中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-0ea5e9)](pyproject.toml)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-API-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![PsychoPy](https://img.shields.io/badge/PsychoPy-lab%20runner-ec4899)](https://www.psychopy.org/)
[![Bind](https://img.shields.io/badge/bind-127.0.0.1%3A8876-64748b)](http://127.0.0.1:8876/)
[![Platform](https://img.shields.io/badge/platform-Windows--first-lightgrey)](docs/INSTALL.md)
[![Marker](https://img.shields.io/badge/marker-.psyclaw-0ea5e9)](https://github.com/Paradeluxe/psyclaw)
[![Skill](https://img.shields.io/badge/AI%20skill-psyclaw-8B5CF6)](https://github.com/Paradeluxe/psyclaw)
[![GitHub stars](https://img.shields.io/github/stars/Paradeluxe/psyclaw?style=social)](https://github.com/Paradeluxe/psyclaw)

Local lab UI to **design** and **run** PsychoPy experiments on this computer.

**Ethos: pick up and use.** Open a folder → Pilot → Start → analysis-ready data under `data/`. Optional AI skill: paste a Method / paper → get a runnable marker, then the same Run path.

```text
<folderName>.psyclaw (JSON) → our compiler → PsychoPy Python → <project>/data/*
  trials CSV (long) + summary.json + by_condition.csv + metrics_long.csv
```

- **Not** PsychoPy Builder XML. **Not** an online participant platform.
- Windows-first. Data stays on the lab machine (listens on `127.0.0.1` only).
- Marker name: **`<folderName>.psyclaw`** (legacy fixed `design.psyclaw` migrates on open/save).
- Paper → script: with Hermes `/psyclaw`, give NL or a Method PDF; skill writes the marker (marker ready). You run subjects here.

## User usage pipeline

How a lab session works with this UI (and optional AI skill).

### A. Human in the lab (this repo only)

```text
Open / New project folder
        ▼
Builder   edit design → Save  (<folder>/<folder>.psyclaw)
   or open a marker written by the AI skill
        ▼
System    preflight host + PsychoPy (when needed)
        ▼
Run
  • Pilot     live window, manual keys · P_pilot (no production ID)
  • Autopilot headless auto keys · P_autopilot
  • Start     formal participant run
        ▼
Session fields
  auto:   Participant ID · timestamp · UID (YYYYMMDD_<8hex>)
  open:   Name · Session · Experimenter · Notes · Extra
        ▼
finished → CSV mirrored to <project>/data/{id}_s{sess}_{ts}.csv
         → + `_summary.json` · `_by_condition.csv` · `_metrics_long.csv`
         → roster update → next free ID + new UID (no manual Next)
```

**Data pack (every finished run):**

| File | Use |
|------|-----|
| `{id}_s{s}_{ts}.csv` | Long trial table (analysis default) |
| `…_summary.json` | Overall accuracy / mean RT + by-group |
| `…_by_condition.csv` | One row per condition cell (Excel) |
| `…_metrics_long.csv` | Tidy long metrics (R / ggplot) |

Instrument shows accuracy, mean RT, and Go/NoGo hit/FA when present.

**Multiple subjects:** run them **in order**. IDs are auto-encoded. Do not invent a second batch product — sequential Start is the multi-subject path.

| Gate | Pass |
|------|------|
| Marker ready | design compiles |
| Run finished | run `finished` |
| Data on disk | CSV under **`<project_path>/data/`** |

### B. With Hermes `/psyclaw` (optional)

AI skill writes the marker; this UI runs subjects. Skill install ≠ this GUI.

```text
/psyclaw
  hear → clarify (coach + defaults) → write <folder>.psyclaw (marker ready)
       → agent asks: "Run participants?"
            No  → stop at marker
            Yes → open this webui / POST /api/runs
                  sequential subjects
                  when agent drives run: session.experimenter = PsyClaw AI
                  auto ID / UID; P_pilot free; finished → next ID
```

There is **no** product mode for “play only instructions / only N trials” as a half-run. Builder has component PREVIEW; lab delivery is Pilot / Start + CSV.


## Features

| Area | What you get |
|------|----------------|
| **Builder** | Drag-drop components, timeline, flow loops + stimlist, inspector PREVIEW |
| **System** | Host / PsychoPy preflight, display & audio device picks |
| **Run** | Start · Pilot · Autopilot; session + roster; Instrument; project `data/` CSV |
| **i18n** | English / Chinese |

Palette today: **text, keyboard, image, video, fixation, code** (plus types the live compiler accepts).

## Quick start

From the monorepo root (recommended):

```bash
git clone https://github.com/Paradeluxe/psyclaw.git ~/psyclaw
cd ~/psyclaw/webui
# First launch bootstraps .venv + deps if missing (needs network once):
python start.py
# Windows: double-click start.bat
# → http://127.0.0.1:8876/
```

Optional manual venv (same result as first-launch bootstrap):

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix:    source .venv/bin/activate
pip install -r requirements.txt
python start.py
```

1. Install **PsychoPy** in a **separate** environment (not required for Flask boot).
2. Full install / update / doctor: **`docs/INSTALL.md`**.
3. **No git?** GitHub → Code → Download ZIP, unzip to `~/psyclaw`, then `webui/start.bat` / `python start.py`. Maintainer source zip: `python webui/scripts/build_dist_zip.py`.

If `PSYCLAW_PSYCHOPY_PYTHON` is unset, the app probes common install locations. Prefer an explicit value when running subjects.

## Layout

```text
backend/          Flask API, design_compiler, runner, system probe
frontend/         SPA (vanilla HTML/JS/CSS)
docs/             PRODUCT, INSTALL, design system, contract, release checklist
tests/            pytest + example_experiment (Stroop fixture)
examples/         sample stimlists
designs/          sample project folders
runs/             server-side run artifacts (gitignored)
```

## Docs

| File | Content |
|------|---------|
| `README.md` | English (default) |
| `README.zh-CN.md` | Chinese |
| `docs/PRODUCT.md` | Goals / non-goals / tabs |
| `docs/INSTALL.md` | Lab install |
| `docs/design.md` | UI design system |
| `docs/CONTRACT.md` | Design & API conventions |
| `docs/RELEASE_CHECKLIST.md` | Maintainer release checklist |
| `LICENSE` | MIT |
| `CITATION.cff` | Citation metadata |

## Checks

```bash
python -m pytest tests/ -q
curl -s http://127.0.0.1:8876/api/health
```

## License

**MIT** — see [LICENSE](LICENSE). PsychoPy is separate third-party software — [NOTICE](NOTICE).
