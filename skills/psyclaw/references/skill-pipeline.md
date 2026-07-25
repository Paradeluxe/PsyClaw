# `psyclaw` skill pipeline (2026-07-21)

One pipeline. Plain language first. Detail lives here; `SKILL.md` is the thin entry.

## Two parts, one repo

| | `psyclaw` (skill) | `psyclaw-webui` (lab app) |
|---|---|---|
| Role | Write 说明书 | draw / run / CSV |
| GitHub | `Paradeluxe/psyclaw` | `Paradeluxe/psyclaw` |
| Path | `skills/psyclaw/` | `webui/` subdir |
| Install | CLI skill installer | `webui/docs/INSTALL.md` |

## Shared IR

```text
MyStroop/
  └── MyStroop.psyclaw    # folder basename + .psyclaw
```

- Design JSON (routines + flow), **not** `.psyexp`.
- Skill goal: produce/edit marker → **ask run**. Lab success needs webui.

## Canonical flow

```text
INPUT (NL | PDF/Method | existing folder)
  → [LIT INTENT?] ──yes──► FIND literature FIRST → paper-anchored clarify
  └──no───────────────────► Clarify (1 Q/turn · Design first · OutPath last)
  → Write + validate marker
  → ASK: 要跑被试吗？
       No  → stop
       Yes → webui sequential subjects
```

### Steps

1. **Hear** intent — create/update `.psyclaw-session.json` (`session-state.md`; stub: `session-stub.json`)  
2. **Lit-first** (if lit intent) — land article/Method before design Qs; `lit=pending`→`landed`/`waived`  
3. **Clarify** — norms coach; paper-anchored if lit landed; shrink `gaps`  
4. **Write** folder + `<folderName>.psyclaw` at OutPath — new files: start from `marker-stub.psyclaw`; move session file into project if needed  
5. **Validate** — `python scripts/validate_marker.py <marker>` hard checks 1–7 (optional `--compile` if webui up) → marker ready  
6. **Ask run** only if session `ask_run` is still `null`; then set `yes`/`no`  
7. **Handoff** if yes → `run-prep.md` checklist → webui (`api-notes.md` if calling) → if agent validates: **Autopilot ×3**, each finished + full pack in project `data/` (or user formal runs) → `state=done`; failures → `failure-playbooks.md`  

Write success = step 5 (marker validates). Lab success = step 7 (runs finish + project data pack; agent smoke ×3). Multi-subject = sequential runs. No half-run mode.  
When reporting to the user, say the concrete action (writing marker / finishing a run / files in `data/`), not stage codes.  
**Resume:** if session file exists, continue from its `state` — do not restart clarify from zero.

## Lit-first gate

If literature intent → **first real work is retrieval**, not the design checklist.

### Intent recognition

Scan first substantive message + later turns. Real lit signal → lit-first **on**.  
Do **not** treat every academic-sounding word as lit (see **Not lit**).

| Class | Examples → lit **on** |
|-------|------------------------|
| Explicit ref | 参考、依据、按照、基于、改编自、复现、复制、跟…一样、照着…做 |
| Paper + source intent | 文献、论文、Method、方法部分、前人、发表、期刊 — **and** want that paper's method |
| Citation | 作者+年份、et al.、DOI、PMID、arxiv、publisher/PDF URL |
| Named + source | 「经典 Stroop / 按 Posner」**且**带出处/复现意味 |
| Search ask | 搜一下、找一篇、帮我查（全文/Method） |
| File given | PDF/路径/粘贴 Method → lit on, **read file** |

| Not lit (lit **off**) | Examples — **do not** search |
|----------------------|------------------------------|
| Pure task | 「做一个红绿 Stroop」无参考/文献/DOI |
| Feasibility / chat | 「研究一下能不能做 Stroop」「这实验靠谱吗」「我想了解一下」— 探索 ≠ 复现 |
| Teach-me / 概念 | 「什么是被试内」「Stroop 是什么」— 先答概念；用户说「按某文做」再 lit-on |
| Tool / run / install | 「更新 webui」「跑被试」「doctor」「装一下」 |
| Edit only | 「把按键改成 f/j」on existing marker |
| Empty「专业/正式」 | 「做一个专业的 Stroop」无出处 → **not** random paper grab |

**Ambiguous**（「专业的 / 标准的 / 正式点」且无出处）→ **one Q**: 跟文献走还是通用默认？  
- User picks 文献 → lit-on  
- User picks 默认 / 不答 / 含糊 → **norms defaults immediately** (don't stall, don't search)  

**Do not** wait for magic word `搜一下` if 参考/复现/文献+出处 already said.  
**Do not** lit-on on lone「研究」when it means “想想/看看行不行”.

| Detect | First actions | Do not yet |
|--------|---------------|------------|
| Lit on | search → save `refs/` → short recap | Ask 几×几 / IV / N |
| PDF/path/paste | Read → recap | Ignore file; generic defaults |
| Lit off | Normal clarify | Random paper search |

**Pass:** path under `./refs/` or `<project>/refs/` (PDF/HTML/`method-extract.md`) **or** user waived + pasted Method.  
**Fail:** claimed 按文献 but no search/read — **invalid**; do it now.

**Where:** before OutPath → `./refs/` (or `~/psyclaw/refs/`); after project → `<project>/refs/` + note in marker.

## Net fetch order

**Triggers:** 参考/复现 · DOI/URL/标题要全文 · 搜一下 · 只有引用没有正文.

| Step | Action |
|------|--------|
| 1 | Host web search / fetch first; save file when possible |
| 2 | Fail (no hit / abstract-only / paywall) → **browser-skill** |
| 2a | Installed → open publisher/OS/user-allowed source → PDF or Method |
| 2b | Missing → **ask once** to install; never silent-install |
| 3 | **Success gate:** local path or saved Method extract. “I looked” without content = fail |
| 4 | Tell user path + one-line source → paper-anchored clarify |
| 5 | Still fail → reason + paste fallback; **do not invent Method** |

Prefer OA (author MS, OSF, PMC) before giving up. Host search before browser. No net on pure-NL no-lit.

### Class-2 after land

1. Recap what paper fixes  
2. Clarify **only gaps / user changes**  
3. Shrug → **paper values first**  
4. Write; citation + path + deviations in notes  

## Intent map (canonical — SKILL only lists Load first)

| User | Flow (step #s above) | Notes |
|------|----------------------|--------|
| 做一个…（无文献） | 1→3→4→5→6 | lit off |
| 做一个…+文献/复现 | 1→**2**→3 paper-anchored→…→6 | lit on |
| 可行性/概念聊聊 | answer; stay hear/clarify light | lit off until they say 按文献做 |
| 改… | open marker → edit → 4→5→6 | gaps = touched only |
| 要跑 / 多人 | handoff webui; experimenter=AI if agent-run | `ask_run=yes` |
| 不要跑 / 只要说明书 | stop at marker ready | `ask_run=no` · `done` |
| 全装 / 首次 | `install-orchestrator.md` | outside design pipeline |
| 更新 skill / psyclaw | skill + related + webui 整段 | same |
| 更新 webui | webui only | PsychoPy only if webui requires |

## Clarify stop / priority

- Priority: **Design** first; **OutPath** last (skip if editing existing).  
- Stop: 满意 / 就这样 / 开始写 / 可以了 / 别问了按默认 / core items clear.  
- Norms: default `norms-core.md`; appendices `norms-counterbalance.md` / `norms-trial-n.md` / `norms-marker-map.md` (index: `experiment-design-norms.md`).

## OutPath

- New: `./experiments/<folderName>/` under session cwd  
- Marker: `<projectDir>/<folderName>.psyclaw`  
- Never Desktop; never skill install tree  
- Edit existing → path known, do not re-ask  

## Naming

| Name | Meaning |
|------|---------|
| Skill id | **`psyclaw`** |
| GitHub | `Paradeluxe/psyclaw` (monorepo: `skills/psyclaw/` + `webui/`) |
| Skill path | `skills/psyclaw/` inside the monorepo |
| Agent local | e.g. `~/.config/opencode/skills/psyclaw`, `~/.claude/skills/psyclaw` |

## Language / explain

- **Session language** = user's first substantive message (task text + pasted on-screen copy; skip bare hi/ok). Lock for the rest of agent↔user chat unless they clearly switch.
- SKILL.md / references stay EN for agents; **never** let that pull user-facing replies into EN when the user started in another language.
- Index `description` is EN on purpose (model skill picker) — unrelated to chat language.
- Short lists + concrete paths when stuck; no multi-path architecture dumps in chat.
