---
name: psyclaw
description: >
  Use when psych exp from NL/Method/edit. Write <folder>.psyclaw;
  ask-run→webui. Design-norms clarify; sequential CSV (experimenter=PsyClaw AI
  if agent-run). Not lab GUI; not Builder XML.
# Optional metadata (Agent Skills open standard: unknown keys are ignored)
version: 0.3.12
license: AGPL-3.0
metadata:
  author: Paradeluxe
  open_standard: https://agentskills.io/specification
  monorepo: https://github.com/Paradeluxe/psyclaw
  skill_path: skills/psyclaw
  companion_app: webui/
---

# PsyClaw

**Portable Agent Skill** ([agentskills.io](https://agentskills.io/specification)): this folder is the skill package. Any CLI that loads `SKILL.md` + optional `scripts/` + `references/` can use it (Claude Code, Codex, Cursor, Hermes, OpenCode, …).

| | This skill | Lab app (companion) |
|---|--------|--------|
| Role | Write experiment design 说明书 | Draw / run / data files |
| In monorepo | `skills/psyclaw/` | `webui/` |
| GitHub | `Paradeluxe/psyclaw` | same repo |
| Done means | project + valid marker (`scripts/validate_marker.py` ± compile) | each run finished + four-file pack under `<project>/data/`; agent smoke Autopilot ×3 |

```text
MyStroop/
  ├── MyStroop.psyclaw
  └── .psyclaw-session.json   # pipeline state (file wins over chat)
```

## How any agent should use this package

1. **Discover** — `name` + `description` (frontmatter) say when to load.
2. **Read** this `SKILL.md` (entry). Keep it loaded while the task runs.
3. **Open on demand** — files under `references/` listed below (do not dump all at once).
4. **Run scripts from this skill root** (directory that contains `SKILL.md`):
   ```bash
   python scripts/doctor.py
   python scripts/validate_marker.py <projectDir>/<folderName>.psyclaw
   python scripts/validate_marker.py <path> --compile   # if webui compiler available
   ```
5. **Install / locate webui** — `references/install-orchestrator.md` (CLI-specific skill *store* commands differ; monorepo paths do not).
6. **Do not** write project files under the skill install tree.

No Hermes-only, Claude-only, or Codex-only APIs are required for the core write→validate→ask-run loop.

## When to use

- User wants a psychology / PsychoPy-style experiment from natural language or paper Method.
- Edit an existing `<folder>.psyclaw`.
- Ask whether to run participants; hand off to webui; agent-driven smoke runs.
- Full install / first-time webui setup (then load install-orchestrator).

**Not for:** lab GUI implementation, `.psyexp` Builder XML as deliverable, stats analysis, bundling PsychoPy.

## When to use → what to open first

| User intent | Load first |
|------|------------|
| 做一个…（no paper） | `references/norms-core.md` (+ `session-state.md`) |
| paper / Method / DOI / 复现 / search full text | `skill-pipeline.md` → lit gate → `norms-core.md` |
| 改… existing design | marker + `norms-core.md` (touched) + `marker-validate.md` |
| run / multi-subject | `run-prep.md` (+ `api-notes.md` if calling webui) |
| design only, no run | stop after validate; session `ask_run=no` |
| full install / update skill·webui | `install-orchestrator.md` |

## Pre-flight (every load)

Before the pipeline, a quick dep check (≤5s). Skip if already done this session.

1. **Skill-side**: Python on PATH; `scripts/` runnable from skill root.
2. **WebUI present?** Prefer `~/.psyclaw/config.json` → `webui_root`. Else resolve per `install-orchestrator.md`.
3. **Missing?** One question in **session language** (Hard rule 1), e.g. EN: "PsyClaw webui is not installed. Install now?" — yes → install-orchestrator § First use. no → skill-only (write/validate marker only).
4. **All OK** → silent, continue.

## Pipeline

```text
[pre-flight] → INPUT → [lit?] fetch paper first → Clarify (1 Q/turn) → Write+validate → ask run subjects? (session language)
         lit yes: search→browser tool if available→file on disk → paper-anchored clarify
         run yes → webui sequential (experimenter=PsyClaw AI if agent-driven)
```

**State file:** read/write `.psyclaw-session.json` each step — `session-state.md`. No half-run mode. Multi-subject = sequential runs.

## Hard rules

1. **Session language (locked from first turn)** — From the user's **first substantive message** (not bare hi/ok; include task text and pasted UI copy). That language is default for all later agent↔user chat: clarify, install ask, ask-run, checklists, errors. Operator-facing marker notes follow it. **Do not** switch to English only because this SKILL/refs/description are EN. **Override** only if the user clearly switches. Mixed → majority / task-clause language.
2. **Session state file** — start: read `.psyclaw-session.json` (project if known, else cwd). Every step: update. Never under skill install tree. Schema: `session-state.md`. File wins over chat. Optional `lang` once detected.
3. **One question per turn** after lit gate (topic cluster OK). Design first, OutPath last (`./experiments/<slug>/`; never Desktop; never skill tree).
4. **Lit gate** — real lit intent only (出处/Method/DOI/复现/full-text search) → land file under `refs/` before Design Q. Not lit: pure task, tooling, empty “professional”. Ambiguous → one Q; else norms defaults.
5. **Stop clarify** on 满意/就这样/开始写/按默认 (or EN equivalents), or core Design·IV·DV·response·trial clear.
6. **User override wins**; log deviations in marker notes. Plain language; say what you are doing — no internal stage codes.
7. **After every marker write/edit** → `python scripts/validate_marker.py …` exit 0 (`marker-validate.md`) → ask run-subjects in session language only if `ask_run` still `null`.
8. **Before run** → user checklist — `run-prep.md`. API/compile — `api-notes.md`. Failures — `failure-playbooks.md`.
9. **Browser / fetch skill** = optional companion for lit landing; offer install if missing; never silent-install; no browse on pure-NL no-lit.
10. **Platform > paradigm hardcoding.** No release/tag/push without approval.
11. **Bug / narrow ask** → one surgical fix — `user-conservative-workflow-preference.md`.
12. **Install/update** → `install-orchestrator.md` only. This skill never freestyle-upgrades PsychoPy.

## Marker (minimal)

Design JSON the webui `design_compiler` accepts: `routines`, `flow`/loops, components, conditions, session fields. Do not invent a parallel schema.

- **New marker:** copy/adapt `references/marker-stub.psyclaw`.
- **After every write/edit:** `python scripts/validate_marker.py <projectDir>/<folderName>.psyclaw` (exit 0). Optional `--compile` when webui available.
- Unsure of types → `webui-handoff.md` / live webui schema.

Optional (only if user asks): `seed`, `exclusion_rules` (flag-only default).

## Verify (concrete)

| Step | Command / check |
|------|-----------------|
| Package health | `python scripts/doctor.py` → `ok: true` |
| Design OK | `validate_marker.py` exit 0 |
| Design compiles | `validate_marker.py --compile` or doctor stub compile when webui present |
| One run OK | webui run status `finished` |
| Data delivered | `<project>/data/`: trial CSV + `_summary.json` + `_by_condition.csv` + `_metrics_long.csv` |
| Agent smoke | Autopilot **×3**, each finished + full pack |

## Common pitfalls

- Claiming validate OK without script exit 0.
- Treating one trial CSV as full delivery (need four-file pack in **project** `data/`).
- Omitting `project_path` → files only under internal `runs/`.
- Writing under skill install tree or Desktop.
- Emitting `.psyexp` as the skill deliverable.
- Flipping chat language to EN because docs are EN.
- One Autopilot green = smoke done (need ×3 when agent validates).

Detail playbooks: `references/failure-playbooks.md`.

## Load on demand

| File | When |
|------|------|
| `references/skill-pipeline.md` | lit-first, fetch, OutPath, full steps |
| `references/session-state.md` | start/resume + every step |
| `references/session-stub.json` | first `.psyclaw-session.json` |
| `references/norms-core.md` | every clarify / write |
| `references/norms-counterbalance.md` | randomization / Latin square / blocks |
| `references/norms-trial-n.md` | trial N · duration · N subjects |
| `references/norms-marker-map.md` | write-time field mapping |
| `references/experiment-design-norms.md` | index → norms-* |
| `references/marker-stub.psyclaw` | new marker |
| `references/marker-validate.md` | after write/edit |
| `references/webui-handoff.md` | handoff index |
| `references/run-prep.md` | ask-run yes |
| `references/api-notes.md` | webui API / compile / data pack |
| `references/failure-playbooks.md` | failures |
| `references/install-orchestrator.md` | install / update / multi-CLI skill store |
| `references/user-conservative-workflow-preference.md` | bug / narrow fix |

## Out of scope

`.psyexp` pipelines · paper batch libraries · bundling PsychoPy · stats analysis · half-run lab modes
