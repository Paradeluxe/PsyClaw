# psyclaw (Hermes skill)

> [!IMPORTANT]
> **Legacy branch `master` (skill-only snapshot).**  
> Current product is the **monorepo on `main`**:  
> **[Paradeluxe/psyclaw](https://github.com/Paradeluxe/psyclaw)** — `skills/psyclaw/` + `webui/`.  
> Clone / pull **`main`**, not `master`. Default branch on GitHub is already `main`.

[English](README.md) · [中文](README.zh-CN.md)

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Hermes skill](https://img.shields.io/badge/Hermes-%2Fpsyclaw-8B5CF6)](https://github.com/Paradeluxe/psyclaw-skill)
[![Marker](https://img.shields.io/badge/marker-.psyclaw-0ea5e9)](https://github.com/Paradeluxe/psyclaw-skill)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/Paradeluxe/psyclaw-skill)
[![Lab GUI](https://img.shields.io/badge/lab%20GUI-psyclaw--webui-22c55e)](https://github.com/Paradeluxe/psyclaw-webui)
[![GitHub stars](https://img.shields.io/github/stars/Paradeluxe/psyclaw-skill?style=social)](https://github.com/Paradeluxe/psyclaw-skill)

Turn a description (or paper Method) into a project folder with **`<folderName>.psyclaw`**.

**Ethos: pick up and use.** Paper / NL → runnable marker → hand off to [psyclaw-webui](https://github.com/Paradeluxe/psyclaw-webui) for subjects → trial long CSV + summary + by-condition + metrics_long under `data/`.

- **Slash:** `/psyclaw`
- **GitHub:** https://github.com/Paradeluxe/psyclaw-skill
- **Not** the lab GUI — that is **[psyclaw-webui](https://github.com/Paradeluxe/psyclaw-webui)** (run subjects → CSV).

## User usage pipeline

One track. Install is separate (see below). This is **how people use** `/psyclaw` day to day.

```text
INPUT
  ├─ Natural-language description of the experiment
  ├─ Paper Method / PDF / HTML / paste   (fetch via browser-skill if needed)
  └─ Existing project folder + marker   (edit in place)

        ▼
CLARIFY  (one question per turn · coach)
  • Suggest standard defaults when the user is unsure
  • Design first (k×m, within/between/mixed, continuous IVs)
  • then IV → DV → control → random → practice → script → response → trial
  • OutPath last  (default ./experiments/<slug>/)
  • Stop when the user is satisfied, says write/defaults, or core items are clear

        ▼
WRITE + VALIDATE (marker ready)
  <projectDir>/<folderName>.psyclaw     # design JSON, not Builder .psyexp

        ▼
ASK RUN  (agent asks — do not wait for the user to invent the run request)
  "The design marker is ready. Run participants?"

        ├─ No  → stop (marker is enough)
        │
        └─ Yes → handoff psyclaw-webui (run finished → CSV in project/data/)
                   • Run subjects in order (one after another)
                   • Participant ID / UID auto-assigned
                   • P_pilot does not consume production IDs
                   • Finished formal run → next ID + new UID
                   • When the agent drives the run: session.experimenter = AI identity
```

| User intent | What happens |
|-------------|--------------|
| Create an experiment | clarify → write marker → **ask run** |
| Edit an existing design | edit marker → validate → **ask run** |
| Run / multi-subject | sequential webui runs; auto ID; experimenter=AI if agent-run |
| Design only / do not run | stop once marker is ready |
| First-time full setup | doctor → consent → install gaps only |

**Not in scope for this skill:** half-run / “preview only a few trials” as a product mode (webui has Builder PREVIEW for components; lab success is full Start/Pilot + CSV). Statistics after CSV. Builder `.psyexp`.

### Deliverable on disk

```text
MyExp/
  MyExp.psyclaw          # required marker (folder basename + .psyclaw)
  data/                  # appears after runs (webui mirror)
  participants.json      # roster (webui)
```

| Check | Meaning |
|-------|---------|
| **Marker ready** | Marker compiles (valid design JSON → PsychoPy script shape) |
| **Run finished** | Run status `finished` |
| **Data on disk** | CSV under **`<project>/data/`** |

Skill alone = marker ready + the run question. Full lab success needs webui + PsychoPy.

## Install (not the usage pipeline)

```bash
hermes skills install psyclaw -y
# always-safe full id:
hermes skills install Paradeluxe/psyclaw-skill/skills/psyclaw -y
```

Then `/psyclaw` in a new session.

| | Installs | Does not install |
|--|----------|------------------|
| `hermes skills install …` | this skill → `/psyclaw` | webui, Flask venv, PsychoPy, browser-skill |
| Lab GUI | [psyclaw-webui](https://github.com/Paradeluxe/psyclaw-webui) separately | Hermes agent |
| Related | **browser-skill** optional (class-2 PDF/Method fetch) | not silent-installed |

First use / full lab setup: doctor gaps → **ask consent** → install only missing pieces. See `skills/psyclaw/references/install-orchestrator.md`.

## Repo layout

```text
psyclaw-skill/
  README.md            # English (default)
  README.zh-CN.md      # Chinese
  LICENSE
  NOTICE
  skills.sh.json
  skills/
    psyclaw/
      SKILL.md
      scripts/doctor.py
      references/   # pipeline, norms, webui handoff gates
```

## Doctor

```bash
python skills/psyclaw/scripts/doctor.py
```

## Pipeline optimization plan (todo)

Post-0.3.6 review. Trunk stays:

`INPUT → lit? → clarify → write → validate → ask_run → handoff`

Next gains: **checkable steps, safer defaults, less load** — not another flowchart.

### P0 — execution (agent failure modes)

- [x] **Session state file** — `<projectDir>/.psyclaw-session.json` (cwd before OutPath); `session-state.md` + stub (0.3.9); file wins over chat
- [x] **Validate is executable** — `references/marker-validate.md` (hard 1–7 + soft + optional compile)
- [x] **Minimal legal stub** — `references/marker-stub.psyclaw`; SKILL/pipeline point here (0.3.7)
- [x] **Dedupe intent tables** — SKILL = Load first only; flow in `skill-pipeline.md` (0.3.10)

### P1 — dialogue / gates

- [x] **One topic cluster / turn** — allowed in hard rules + norms-core (earlier)
- [x] **Lit false-positive examples** — feasibility/概念/空专业 ≠ lit; pipeline Not lit table (0.3.10)
- [x] **Ambiguous「专业」default** — one Q then norms defaults if no answer (0.3.10)
- [x] **Ask-run once per session** — session field `ask_run`; skip re-prompt when set (0.3.9)

### P2 — norms load weight (~251 lines)

- [x] **Split norms** — `norms-core.md` / `norms-trial-n.md` / `norms-counterbalance.md` / `norms-marker-map.md` (0.3.8)
- [x] **Default-load core only**; appendices on N / balance / field mapping; old file = index
- [x] **Merge checklist #1–3** — core allows one design one-liner cluster when user is fast

### P3 — product boundaries

- [x] **Split handoff** — `run-prep.md` vs `api-notes.md`; `webui-handoff.md` = index (0.3.11)
- [x] **Failure playbooks** — `failure-playbooks.md` (paywall, browser-skill, webui, compile, CSV, session)
- [x] **Done checklist (5 ticks)** — in `run-prep.md`

### Suggested order

1. ~~Validate + stub~~  
2. ~~Split norms~~  
3. ~~Session state file~~  
4. ~~Intent dedupe + lit negatives~~  
5. ~~Handoff + failure playbooks~~ — **done (0.3.11)**  

## License

**AGPL-3.0** — [LICENSE](LICENSE). PsychoPy is separate — [NOTICE](NOTICE).
