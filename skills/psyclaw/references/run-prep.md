# Run prep (tell the user)

Load when `ask_run=yes` / handoff starts. **Operator-facing only** — no API dumps.  
Agent/API detail → `api-notes.md`. Failures → `failure-playbooks.md`.

## Before subjects

State this short checklist (same facts as webui **System** tab when available). Do not guess PsychoPy paths. **Session language** for all spoken lines (Hard rule 1).

| # | Item | Say plainly |
|---|------|-------------|
| 1 | **Project** | folder path + marker name |
| 2 | **WebUI** | `http://127.0.0.1:8876` up, or starting it |
| 3 | **PsychoPy** | python path + source (`env` / `library` / `standalone`) from System / resolve — not invented |
| 4 | **Gate** | System pass/warn/fail; **fail → fix before formal run** |

Example (ZH):

```text
准备跑被试：
- 项目：E:\labs\MyStroop\（MyStroop.psyclaw）
- 实验室软件：http://127.0.0.1:8876
- 实验引擎：C:\...\python.exe（library）
- System 预检：通过
```

## Multi-subject (one line)

按顺序逐个开跑；正式跑完自动下一号；`P_pilot` 不占正式号。智能体开跑时 `session.experimenter` = AI 身份。

## What “done” means (concrete — say these, not codes)

| Stage | What is happening | Done when |
|-------|-------------------|-----------|
| **Write design** | 写/改项目里的 `<folder>.psyclaw` 说明书 | `python scripts/validate_marker.py …` exit 0；有 webui 时再加 `--compile`，编出能开窗的 PsychoPy 脚本 |
| **One run finished** | 用 webui 真正跑完一轮（含 Autopilot 自动按键） | 该次 run 状态是 `finished`，不是中途挂掉 |
| **Data delivered** | 结果写进**项目**目录，不是只留在内部 runs | `<project>/data/` 里这次 run 有四件套：试次 `{id}_s{sess}_{ts}.csv`、`{stem}_summary.json`、`{stem}_by_condition.csv`、`{stem}_metrics_long.csv` |

- 说明书通过 ≠ 实验已经跑完  
- 只有一个试次 CSV、缺汇总文件 ≠ 数据交付完成  

跟用户汇报时用上表「在做什么 / 怎样算完」，不要说内部阶段代号。

## Agent lab smoke (when agent drives or validates a run)

**Autopilot 连跑 3 次**（同一设计、`project_path` 指到项目、headless 自动按键）。

| 第几次 | 要看到什么 |
|--------|------------|
| 1 | 跑完 + 项目 `data/` 四件套齐全 |
| 2 | 再跑完 + 再一份四件套；名册/编号按产品规则前进 |
| 3 | 再跑完 + 再一份四件套；确认不是偶然一次绿 |

- 只自动跑通 **1 次** 不能声称「验收通过」  
- 真人正式 Start / 真被试：仍按顺序开；**×3 只约束 agent 自动试跑**，不是人类实验规程  
- 手动 Pilot（`P_pilot`）不能代替这 3 次 Autopilot  
- API 形状 → `api-notes.md`

## Done checklist (agent, before close)

- [ ] path + marker name correct  
- [ ] design tag + deviations noted  
- [ ] design validated (script exit 0; compile if webui up)  
- [ ] `ask_run` recorded in session file  
- [ ] if agent validated run: **Autopilot ×3**, each finished + full four-file pack in `data/`, or user stopped cleanly → `state=done`  
- [ ] if user-only formal runs: each finished production run has the four-file pack under `data/`
