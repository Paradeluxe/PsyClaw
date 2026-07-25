# psyclaw（Hermes 技能）

> [!IMPORTANT]
> **旧分支 `master`（仅 skill 的历史快照）。**  
> 现行产品在 **`main` monorepo**：  
> **[Paradeluxe/psyclaw](https://github.com/Paradeluxe/psyclaw)** — `skills/psyclaw/` + `webui/`。  
> 请 clone / 使用 **`main`**，不要用 `master`。GitHub 默认分支已是 `main`。

[English](README.md) · [中文](README.zh-CN.md)

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Hermes skill](https://img.shields.io/badge/Hermes-%2Fpsyclaw-8B5CF6)](https://github.com/Paradeluxe/psyclaw-skill)
[![Marker](https://img.shields.io/badge/marker-.psyclaw-0ea5e9)](https://github.com/Paradeluxe/psyclaw-skill)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/Paradeluxe/psyclaw-skill)
[![Lab GUI](https://img.shields.io/badge/lab%20GUI-psyclaw--webui-22c55e)](https://github.com/Paradeluxe/psyclaw-webui)
[![GitHub stars](https://img.shields.io/github/stars/Paradeluxe/psyclaw-skill?style=social)](https://github.com/Paradeluxe/psyclaw-skill)

把自然语言描述（或论文 Method）变成项目文件夹里的 **`<folderName>.psyclaw`**。

**宗旨：拿起来就能用。** 论文/自然语言 → 可跑标记 → webui 跑被试 → `data/` 长表+汇总+指标长表。

- **斜杠命令：** `/psyclaw`
- **GitHub：** https://github.com/Paradeluxe/psyclaw-skill
- **不是**实验室 GUI——那是 **[psyclaw-webui](https://github.com/Paradeluxe/psyclaw-webui)**（跑被试 → CSV）。

## 用户使用管线

只有一条主线。安装见下文，与日常使用分开。本节是 **`/psyclaw` 日常怎么用**。

```text
输入
  ├─ 自然语言描述实验
  ├─ 论文 Method / PDF / HTML / 粘贴   （需要时用 browser-skill 拉取）
  └─ 已有项目文件夹 + 标记文件         （原地修改）

        ▼
澄清  （每轮只问一个问题 · 教练式）
  • 用户不确定时给出标准默认建议
  • 先定设计结构（几×几、被试内/间/混合、连续自变量）
  • 再 IV → DV → 对照 → 随机 → 练习 → 指导语 → 反应 → 单试次
  • 最后才定输出路径（默认 ./experiments/<slug>/）
  • 停止信号：满意 / 就这样 / 开始写 / 按默认 / 核心项已清

        ▼
写入 + 校验（说明书就绪）
  <projectDir>/<folderName>.psyclaw     # 设计 JSON，不是 Builder 的 .psyexp

        ▼
询问是否开跑  （由智能体主动问——不要干等用户自己发明「能跑吗」）
  「说明书写好了。要跑被试吗？」

        ├─ 否  → 结束（有标记文件即可）
        │
        └─ 是  → 交接 psyclaw-webui（运行完成 → CSV 落在 project/data/）
                   • 按顺序逐个跑被试
                   • 被试编号 / UID 自动分配
                   • P_pilot 不占用正式编号
                   • 正式跑完 → 下一号 + 新 UID
                   • 智能体驱动开跑时：session.experimenter = AI 身份
```

| 用户意图 | 行为 |
|----------|------|
| 做一个实验 | 澄清 → 写说明书 → **问是否开跑** |
| 改已有设计 | 改标记 → 校验 → **问是否开跑** |
| 要跑 / 多人 | webui 顺序跑；自动编号；智能体开跑则 experimenter=AI |
| 不要跑 / 只要说明书 | 说明书就绪后停止 |
| 全装 / 首次部署 | doctor → 征得同意 → 只补缺项 |

**本技能不做：** 半跑 /「只预览几题」作为产品模式（webui 的 Builder 有组件 PREVIEW；实验室交付是完整 Start/Pilot + CSV）。不做 CSV 后的统计分析。不做 Builder `.psyexp`。

### 磁盘交付物

```text
MyExp/
  MyExp.psyclaw          # 必需标记（文件夹名 + .psyclaw）
  data/                  # 跑完后由 webui 镜像写出
  participants.json      # 名册（webui）
```

| 检查 | 含义 |
|------|------|
| **说明书就绪** | 标记可编译（合法设计 JSON → PsychoPy 脚本形态） |
| **运行完成** | 运行状态为 `finished` |
| **数据落盘** | CSV 落在 **`<project>/data/`** |

仅技能 = 说明书就绪 + 询问是否开跑。完整实验室成功需要 webui + PsychoPy。

## 安装（不是使用管线）

```bash
hermes skills install psyclaw -y
# 始终可用的完整 id：
hermes skills install Paradeluxe/psyclaw-skill/skills/psyclaw -y
```

然后在新会话里用 `/psyclaw`。

| | 会装 | 不会装 |
|--|------|--------|
| `hermes skills install …` | 本技能 → `/psyclaw` | webui、Flask 虚拟环境、PsychoPy、browser-skill |
| 实验室 GUI | 另行安装 [psyclaw-webui](https://github.com/Paradeluxe/psyclaw-webui) | Hermes 智能体 |
| 相关 | **browser-skill** 可选（第二类：拉 PDF/Method） | 不静默安装 |

首次使用 / 全装：doctor 查缺 → **征得同意** → 只装缺的。详见 `skills/psyclaw/references/install-orchestrator.md`。

## 仓库布局

```text
psyclaw-skill/
  README.md            # 英文（默认）
  README.zh-CN.md      # 中文
  LICENSE
  NOTICE
  skills.sh.json
  skills/
    psyclaw/
      SKILL.md
      scripts/doctor.py
      references/   # 管线、规范、webui 交接门禁
```

## 自检

```bash
python skills/psyclaw/scripts/doctor.py
```

## 管线优化计划（todo）

0.3.6 瘦身后评审。主干不动：

`输入 → 文献？ → 澄清 → 写入 → 校验 → 问是否开跑 → 交接 webui`

下一波收益在 **每步可检查、可默认、可少加载**，不再重画流程图。

### P0 — 执行层（agent 最易翻车）

- [x] **会话状态文件** — `<projectDir>/.psyclaw-session.json`（OutPath 前用 cwd）；`session-state.md` + stub（0.3.9）；以文件为准
- [x] **Validate 可执行** — `references/marker-validate.md`（硬检查 1–7 + 软警告 + 可选 compile）
- [x] **最小合法 stub** — `references/marker-stub.psyclaw`；SKILL/pipeline 已挂接（0.3.7）
- [x] **Intent 表去重** — SKILL 只留 Load first；流程仅 `skill-pipeline.md`（0.3.10）

### P1 — 对话 / 闸门

- [x] **每轮一个 topic cluster** — 硬规则 + norms-core 已允许
- [x] **Lit 误触发负面样例** — 可行性/概念/空专业 ≠ lit（0.3.10）
- [x] **Ambiguous「专业」默认** — 一问后无答则 norms 默认（0.3.10）
- [x] **Ask-run 每会话一次** — session 字段 `ask_run`；已设置则不再弹问（0.3.9）

### P2 — norms 加载重量（约 251 行）

- [x] **拆分 norms** — `norms-core.md` / `norms-trial-n.md` / `norms-counterbalance.md` / `norms-marker-map.md`（0.3.8）
- [x] **默认只 load core**；N/平衡/字段映射再 load 附录；旧文件改为索引
- [x] **checklist #1–3 可合并** — core 允许快速用户一句 design one-liner

### P3 — 产品边界

- [x] **Handoff 分层** — `run-prep.md` vs `api-notes.md`；`webui-handoff.md` 为索引（0.3.11）
- [x] **失败剧本** — `failure-playbooks.md`
- [x] **收工 5 勾** — 见 `run-prep.md`

### 建议排期

1. ~~Validate + stub~~  
2. ~~拆 norms~~  
3. ~~会话状态文件~~  
4. ~~Intent 去重 + lit 负面样例~~  
5. ~~Handoff + 失败剧本~~ — **已完成（0.3.11）**  

## 许可证

**AGPL-3.0** — [LICENSE](LICENSE)。PsychoPy 另计 — [NOTICE](NOTICE)。
