# psyclaw

[English](README.md) · [中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Skill](https://img.shields.io/badge/AI%20skill-psyclaw-8B5CF6)](https://github.com/Paradeluxe/psyclaw)
[![Marker](https://img.shields.io/badge/marker-.psyclaw-0ea5e9)](https://github.com/Paradeluxe/psyclaw)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/Paradeluxe/psyclaw)
[![Lab GUI](https://img.shields.io/badge/lab%20GUI-psyclaw--webui-22c55e)](https://github.com/Paradeluxe/psyclaw)
[![GitHub stars](https://img.shields.io/github/stars/Paradeluxe/psyclaw?style=social)](https://github.com/Paradeluxe/psyclaw)

把自然语言描述（或论文 Method）变成项目文件夹里的 **`<folderName>.psyclaw`** — 再跑被试、落 CSV。

**宗旨：拿起来就能用。** 论文/自然语言 → 可跑标记 → 跑被试 → `data/` 长表 + 汇总 + 条件表 + 指标长表。

这是 **monorepo**：一次 clone 同时拿到 agent 技能与实验室 GUI：

```
psyclaw/
├── skills/psyclaw/     ← agent 技能（任意遵循 skills/<name>/ 的 CLI）
├── webui/              ← 实验室 GUI（Flask：设计 / 开跑 / CSV）
│   └── frontend/       ← SPA（app 拆 system/run；builder-parts/ 组装为 builder.js）
├── LICENSE, NOTICE
```

**不在本仓：** 本机可选的 **psyclaw-vault**（论文 / `experiments/` 试跑）是**另一文件夹**，**无 GitHub remote**。  
**vault = 本地 papers + 实验数据；产品源码只在本 monorepo。**

**150 篇复现管线：** 见 [docs/replication150.md](docs/replication150.md) 与 [docs/replication150-acceptance.md](docs/replication150-acceptance.md)。

| 部分 | 作用 | 使用者 |
|------|------|--------|
| **Skill**（`skills/psyclaw/`） | 写实验说明书（`<folderName>.psyclaw`） | AI agent / CLI |
| **WebUI**（`webui/`） | 画流程 / 跑被试 / CSV | 本机主试（可独立用） |
| **Vault**（可选，仅本机） | 论文 + 实验文件夹，不是产品代码 | 实验室机器 |

- **斜杠命令：** `/psyclaw`（装 skill 后）
- **GitHub：** https://github.com/Paradeluxe/psyclaw（**不要**再找旧仓 `psyclaw-skill` / 独立 `psyclaw-webui`）

## 用户使用管线

只有一条主线。安装见下文，与日常使用分开。本节是 **日常怎么用**。

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

## 快速开始

```bash
# 1. Clone monorepo（真源只有这一仓）
git clone https://github.com/Paradeluxe/psyclaw.git ~/psyclaw

# 2. 安装 skill（按 CLI 选一条）
# Hermes:
hermes install Paradeluxe/psyclaw/skills/psyclaw
# Claude Code:
cp -r ~/psyclaw/skills/psyclaw ~/.claude/skills/
# 任意 CLI：把 agent 指到 ~/psyclaw/skills/psyclaw/

# 3. 准备 webui
cd ~/psyclaw/webui
python -m venv .venv
# Windows:  .venv\Scripts\activate
# Unix:     source .venv/bin/activate
pip install -r requirements.txt

# 4. 启动 webui
python start.py
# → http://127.0.0.1:8876

# 5. 应用入口由一键安装器自动创建。手动重建：
# python scripts/make_desktop_shortcut.py
```

### 装完之后去哪打开

| 系统 | 入口 | 搜索 |
|------|------|------|
| **Windows** | 桌面图标 · 开始菜单 | PsyClaw |
| **macOS** | Launchpad · Spotlight | PsyClaw |
| **Linux** | 应用菜单（GNOME/KDE） | PsyClaw |

## 安装说明（不是使用管线）

| 机制 | 会装 | 不会装 |
|------|------|--------|
| Agent CLI 装 skill | 读 monorepo 的 `skills/psyclaw/` 进 CLI skill 库 | webui 虚拟环境、PsychoPy |
| WebUI 本机准备 | `webui/` 下 Flask `.venv` + `requirements.txt` | agent skill 文件、PsychoPy |
| 实验室 GUI | **同仓** `webui/`（不是另一个 GitHub 产品仓） | — |
| 相关 | **browser-skill** 可选（拉 PDF/Method） | 不静默安装 |

**不要**再 clone 已弃用的独立仓 `Paradeluxe/psyclaw-webui` 或旧 skill 线当现行版；请用本 monorepo 的 **`main`**。

### 一次装通（推荐入口）

| 系统 | 入口 | 默认装到 |
|------|------|----------|
| **Windows** | `skills\psyclaw\install-all.bat` | `%USERPROFILE%\psyclaw` |
| **macOS / Linux** | `skills/psyclaw/install-full.sh` | `~/psyclaw` |

```bat
REM Windows — 可带路径；无人值守：set PSYCLAW_NONINTERACTIVE=1
skills\psyclaw\install-all.bat
REM 或: skills\psyclaw\install-all.bat D:\lab\psyclaw
```

```bash
chmod +x skills/psyclaw/install-full.sh
./skills/psyclaw/install-full.sh          # 或带自定义路径
```

脚本会：clone/pull monorepo → 建 `webui/.venv` 并装 Flask 依赖 → 写入 `~/.psyclaw/config.json` 的 `webui_root` → **打印**各 CLI 装 skill 命令（不强制装 Hermes）。  
然后：`cd webui && python start.py` → http://127.0.0.1:8876  
PsychoPy 仍单独装（只跑被试时需要）。

**实机验收（Windows，2026-07-25）：** 全新目录 clone → venv → flask → `/api/health` 返回 `app=psyclaw-webui` / `status=ok`。

### 分步文档

- **`webui/docs/INSTALL.md`** — 实验室端规范
- **`skills/psyclaw/references/install-orchestrator.md`** — agent 侧编排

首次使用 / 全装：doctor 查缺 → **征得同意** → 只装缺的；或同意后跑上面的一次装通。

## 仓库布局

```text
psyclaw/                         # Paradeluxe/psyclaw  monorepo
├── skills/psyclaw/
│   ├── SKILL.md
│   ├── scripts/doctor.py
│   ├── install-full.sh, install-all.bat
│   └── references/              # 管线、规范、webui 交接门禁
├── webui/
│   ├── backend/                 # Flask + 编译器 + runner
│   ├── frontend/                # SPA（Builder / System / Run）
│   ├── start.py, start.bat
│   ├── requirements.txt
│   ├── docs/INSTALL.md
│   └── tests/
├── README.md, README.zh-CN.md
├── skills.sh.json
├── LICENSE, NOTICE
```

## 自检

```bash
python skills/psyclaw/scripts/doctor.py
```

## 管线优化计划（todo）

主干不动：

`输入 → 文献？ → 澄清 → 写入 → 校验 → 问是否开跑 → 交接 webui`

### 已完成 — skill 管线（≤0.3.11）

- [x] 会话状态 `.psyclaw-session.json` · validate · marker stub · intent 去重
- [x] lit 负面样例 · ask-run 每会话一次 · norms 拆分 core/附录
- [x] handoff 分层（run-prep / api-notes）· failure-playbooks

### 已完成 — webui / monorepo（2026-07-25 · `c34b497`+）

- [x] **启动器 identity** — health 只认 `app=="psyclaw-webui" && status=="ok"`；脏端口 exit 1
- [x] **历史 run 只读重载** — `StateMachine.from_disk()`；不再 finished→created
- [x] **mock CSV 镜像** — 完成也写 `<project>/data/`
- [x] **回归** — launcher / state / API flows / frontend smoke（66 tests）
- [x] **Settings 宽屏** — 限宽 1200px
- [x] **push `main`** + GitHub **default_branch → main**（monorepo 为默认面）
- [x] **本机脏 8876** 旧 minimal 已清；真 webui 接管
- [x] **Hermes 装机 skill** 与 monorepo `skills/psyclaw/` 对齐

### 未完成 — 下一刀

#### P1 — 仓库 / 分发卫生

- [x] **私有仓 `Paradeluxe/psyclaw-webui` 归档策略** — 轻方案：README 顶部 deprecated → monorepo `webui/`（`dfb127f`）；未 Archive 仓库
- [x] **`master` 旧 skill-only 线** — README 顶部 banner：请用 `main` monorepo（`7765521`）；未删分支
- [x] **装机路径文档** — 去掉 `psyclaw-skill/` 旧树与「另行安装独立 webui」表述；统一 `Paradeluxe/psyclaw` + `skills/psyclaw` + `webui/`
- [x] **一次安装 skill+webui** — `install-all.bat` / `install-full.sh` 实机验收 + README 入口（bat CRLF、可用 `python` 探测）

#### P2 — webui 产品抛光

- [x] **System 状态表达** — gate 旁可见原因；mock / graphics n/a / PsychoPy；黄灯文案改为「仅 Pilot」
- [x] **长设备名截断** — 设备下拉 `title` 悬停全名 + ellipsis
- [x] **Display 黑预览空洞感** — 空设计时棋盘底 +「黑色输出预览」提示（未改音频卡高度）
- [x] **Run 空态** — roster 空表说明；Instrument 未跑时整块空态（非一排 `—`）
- [x] **前端拆模块** — `app-system.js` / `app-run.js` / `app.js`；builder `builder-parts/` + assemble

#### P3 — 本地 vault（无 remote）

- [x] **`psyclaw-vault` 收尾 commit** — 删旧 pipeline + `experiments/Stroop` smoke（仅本地，无 remote）
- [x] **vault 与 monorepo 边界** — vault = 本地 papers/experiments，不是产品仓

### 建议排期

1. ~~私有 webui 仓归档文案 + master banner~~  
2. ~~文档路径统一 monorepo~~  
3. ~~install-all 实机一次装通~~  
4. ~~System/Run 状态与空态抛光~~  
5. ~~前端拆模块~~  
6. ~~vault commit（仅本地）~~

## 许可证

**MIT** — [LICENSE](LICENSE)。PsychoPy 另计 — [NOTICE](NOTICE)。
