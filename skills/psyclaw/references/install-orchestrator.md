# One repo, one clone (monorepo, 2026-07-23)

## Monorepo layout

```
psyclaw/                      ← clone Paradeluxe/psyclaw
├── skills/psyclaw/          ← agent skill (skills/<name>/SKILL.md convention)
│   ├── SKILL.md
│   ├── references/
│   └── scripts/
├── webui/                   ← lab app (Flask)
│   ├── backend/
│   ├── frontend/
│   ├── start.py, start.bat
│   ├── requirements.txt
│   └── docs/INSTALL.md
├── README.md, LICENSE, NOTICE
```

One `git clone` gets both. One `git pull` updates both.

## Who installs what

| Mechanism | Installs | Does **not** install |
|-----------|----------|----------------------|
| **Agent CLI skill install** | Reads `skills/psyclaw/` from the repo into the CLI's skill store | webui venv, PsychoPy |
| **WebUI setup** (`webui/start.py` first run, or manual `docs/INSTALL.md`) | Flask `.venv` + `requirements.txt` | Agent skill files, PsychoPy |
| **PsychoPy** | Installed by user per `webui/docs/INSTALL.md` § Requirements | — |

**Never claim** skill install alone deploys the GUI. Skill and webui share a repo
but have separate install steps.

**PsychoPy ownership:** belongs to **webui**, not the skill. Skill never
`pip install -U psychopy` on its own. If webui release notes / INSTALL / optional
requirements do not ask for a PsychoPy bump, leave PsychoPy alone (probe
"present?" only when running subjects).

## First use = doctor

On first use (or when user says 全装 / 部署 / setup):

1. Check skill-side small deps / scripts runnable.
2. Check webui present **if** lab software needed this turn — resolve path in order:
   1. `PSYCLAW_WEBUI_ROOT` if set and valid
   2. **`~/.psyclaw/config.json`** → `webui_root` (persistent; survives skill reinstall)
   3. default **`~/psyclaw/webui`** if that folder is a webui tree
   4. else ask
   Helper (if clone known): `python webui/scripts/user_config.py show` inside monorepo.
3. **If webui already found (git clone / runnable tree):** **do not re-install.** Prefer **update**. After any successful find/update/start: ensure path is saved:
   ```bash
   cd webui && python scripts/user_config.py remember
   # or: start.py / make_desktop_shortcut.py auto-remember
   ```
   Never clone a second copy without asking.
4. **If webui missing:** ask once (consent + location), then prefer **one-shot**:
   - **Windows:** `skills\psyclaw\install-all.bat` [optional monorepo path]  
     (`set PSYCLAW_NONINTERACTIVE=1` to skip `pause`)
   - **Unix:** `skills/psyclaw/install-full.sh` [optional path]
   - Manual equivalent: `git clone https://github.com/Paradeluxe/psyclaw.git ~/psyclaw` → `webui` venv + `user_config.py remember`
   One-shot already remembers `webui_root`. Custom path = pass the folder as the first argument.
5. **If run needed:** probe PsychoPy only (env → library → standalone). Missing → **webui** `docs/INSTALL.md` (skill does not freestyle-upgrade PsychoPy).
6. Missing skill → install skill gap with consent (CLI-specific command; repo path is `Paradeluxe/psyclaw/skills/psyclaw`). One-shot **prints** these lines; it does not run Hermes for you.
7. All present / updated → do the task (write `<folderName>.psyclaw`).

Not every turn reinstalls. See **Updates** below when the user asks to update.

### Webui location policy

| | |
|--|--|
| **Default** | `~/psyclaw/webui` — clone monorepo to `~/psyclaw`, webui is the `webui/` subdir |
| **Override** | User names another folder → allowed; clone there |
| **Remember** | `~/.psyclaw/config.json` key `webui_root` — **required after install/update** so next time is automatic |
| **Env** | `PSYCLAW_WEBUI_ROOT` overrides config when set |
| **Never default to** | Desktop · skill install tree · `Program Files` (no admin story) |

## One update entry point (monorepo)

```text
更新 / update psyclaw
  ├─ 1. git pull (updates both skill source + webui code)
  ├─ 2. Related skills / companion software（如 browser-skill，在用才更）
  ├─ 3. WebUI venv deps
  └─ 4. PsychoPy 仅当 webui 本版要求
```

Because skill and webui live in one repo, `git pull` updates both.
No separate "update skill" vs "update webui" — they're one tree.

### Triggers

| User says | Scope |
|-----------|--------|
| 更新 / 升级 / update psyclaw | **Full**: `git pull` + related + webui venv + conditional PsychoPy |
| 全装 / 首次 | First-use doctor |

### Steps

Follow **`webui/docs/INSTALL.md` § Update** (canonical):

1. **Stop old server first** (if running): `cd webui && python scripts/stop_server.py` or `stop.bat` — **bounded ≤20s**. Never loop on "Old server still running / forcing clean restart"; if stop fails once, report PIDs/port and ask user (Task Manager) — do not hang the update.
2. `git pull` the monorepo.
3. `cd webui` → activate venv → `pip install -r requirements.txt` (pull 后例行一次).
4. **PsychoPy** — **仅当** `webui/docs/INSTALL.md` / changelog / optional req 写明要升；否则 **不动**.
5. Start again: `cd webui && python start.py` or `python start.py --restart`.
6. If agent CLI needs skill re-sync after `git pull`, copy/update
   `skills/psyclaw/` into that CLI's skill store (product-specific; see
   **Skill installation** below). Source of truth is always the monorepo.

### Rules

1. One `git pull` updates both skill and webui (monorepo).
2. Skill **不**自己发明 PsychoPy 升级；只通过 webui 文档.
3. Skill 文件 = CLI skill store; webui = 本机一份（对所有 CLI 共用）.
4. 网络操作按用户政策要同意；可一批：「将 clone/update 仓库 + 装依赖」.
5. 普通 做一个… / 改… → 不走更新.

## Skill installation (cross-CLI)

Package shape follows the **Agent Skills open standard**
([agentskills.io/specification](https://agentskills.io/specification)):

```text
psyclaw/                 ← skill root (folder name = name)
├── SKILL.md             ← required: name + description + instructions
├── scripts/             ← optional executables
└── references/          ← optional progressive-disclosure docs
```

Required frontmatter fields only: `name`, `description`. Extra keys
(`version`, `license`, `metadata`, …) are optional; compliant agents ignore
keys they do not understand.

Source of truth in the monorepo: `skills/psyclaw/`. Copy or install that
folder into whatever skill store the agent uses.

| CLI / product | Typical install |
|---------------|-----------------|
| Any (spec) | Place folder so the agent discovers `…/psyclaw/SKILL.md` |
| Claude Code | `skills/psyclaw/` → `.claude/skills/psyclaw/` (or project skills dir) |
| Codex / Cursor / VS Code Copilot | Agent skill directory for that product (same folder layout) |
| OpenCode | e.g. `~/.config/opencode/skills/psyclaw` |
| Hermes | `hermes install Paradeluxe/psyclaw/skills/psyclaw` (or copy into its skill store) |
| Manual | Point the agent at `Paradeluxe/psyclaw/skills/psyclaw` or a local clone |

Short name `psyclaw` works when the resolver finds exactly one skill with
`name: psyclaw`. Full monorepo path: `Paradeluxe/psyclaw/skills/psyclaw`.

Maintainers edit `skills/psyclaw/` in the monorepo; end users sync into
**their** agent's skill store after `git pull`.

## One-shot scripts (entry)

| File | Platform | Does |
|------|----------|------|
| `skills/psyclaw/install-all.bat` | Windows | clone/pull monorepo · `webui/.venv` · pip · `user_config remember` · print skill CLI lines |
| `skills/psyclaw/install-full.sh` | macOS/Linux | same |

Root README § **One-shot install** is the user-facing pointer. Bat files **must** be CRLF (see repo `.gitattributes`).

## Layer roadmap

| Layer | Shape |
|-------|-------|
| A | git clone + webui venv + docs/INSTALL.md |
| A′ | **One-shot** — `install-all.bat` / `install-full.sh` (clone + venv + remember) |
| B | **Double-click self-bootstrap** — `webui/start.bat` / `start.command` / `start.sh` → `start.py` creates `.venv` + `pip install -r requirements.txt` on first launch; desktop shortcut best-effort |
| C | zip / installer with embedded Python (future) |

PsychoPy external every layer.

### Webui self-bootstrap (agents)

After clone of monorepo / first find of webui:

1. **Do not** ask non-coders to type `python -m venv` / `pip install` by hand.
2. Prefer: `cd webui && python start.py --setup-only` or double-click / `start.bat` (first run prepares env).
3. Only fall back to manual INSTALL §1 if auto-setup fails (`runs/_setup_last.log`).
4. PsychoPy remains a separate probe (Run subjects); not installed by webui bootstrap.