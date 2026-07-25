# psyclaw（Hermes 技能）

[English](README.md) · [中文](README.zh-CN.md)

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Hermes skill](https://img.shields.io/badge/Hermes-%2Fpsyclaw-8B5CF6)](https://github.com/Paradeluxe/psyclaw)
[![Marker](https://img.shields.io/badge/marker-.psyclaw-0ea5e9)](https://github.com/Paradeluxe/psyclaw)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/Paradeluxe/psyclaw)
[![Lab GUI](https://img.shields.io/badge/lab%20GUI-psyclaw--webui-22c55e)](https://github.com/Paradeluxe/psyclaw)
[![GitHub stars](https://img.shields.io/github/stars/Paradeluxe/psyclaw?style=social)](https://github.com/Paradeluxe/psyclaw)

把自然语言描述（或论文 Method）变成项目文件夹里的 **`<folderName>.psyclaw`**。

**宗旨：拿起来就能用。** 论文/自然语言 → 可跑标记 → webui 跑被试 → `data/` 长表+汇总+指标长表。

- **斜杠命令：** `/psyclaw`
- **GitHub：** https://github.com/Paradeluxe/psyclaw
- WebUI 在同仓库 `webui/` 子目录（跑被试 → CSV）。

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
hermes install Paradeluxe/psyclaw/skills/psyclaw
```

然后在新会话里用 `/psyclaw`。

| | 会装 | 不会装 |
|--|------|--------|
| `hermes skills install …` | 本技能 → `/psyclaw` | webui、Flask 虚拟环境、PsychoPy、browser-skill |
| 实验室 GUI | 另行安装 [psyclaw-webui](https://github.com/Paradeluxe/psyclaw) | Hermes 智能体 |
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

- [ ] **私有仓 `Paradeluxe/psyclaw-webui` 归档策略** — monorepo `webui/` 已是真源；私有仓停在 `404b003`（debug 8877）。选：归档 / README 指向 monorepo / 或标 deprecated
- [ ] **`master` 旧 skill-only 线** — default 已切 main；决定是否 archive/delete `master` 或加 banner 防误 clone
- [ ] **装机路径文档** — SKILL/README 仍可能写 `Paradeluxe/psyclaw-skill`；统一为 `Paradeluxe/psyclaw`（`skills/psyclaw`）
- [ ] **一次安装 skill+webui** — `install-all.bat` / `install-full.sh` 实机验收 + 文档入口写清

#### P2 — webui 产品抛光

- [ ] **System 状态表达** — PsychoPy 警告 / mock runner / `n/a` graphics 要有可见原因或详情入口；`可 Pilot` 语义与色一致
- [ ] **长设备名截断** — I/O 扬声器等：title 悬停完整名或换行
- [ ] **Display 黑预览空洞感** — 边界/棋盘/「黑色输出」说明（勿为等高硬改音频卡）
- [ ] **Run 空态** — roster 0 行时更轻；Instrument 全 `—` 时分组或折叠
- [ ] **前端大拆模块** — `app.js` / `builder.js` 分文件（另开任务，勿顺手大改）

#### P3 — 本地 vault（无 remote）

- [ ] **`psyclaw-vault` 收尾 commit** — 旧 pipeline 56 删除 + `experiments/` untracked；确认后 commit（仍无 remote）
- [ ] **vault 与 monorepo 边界** — 文档一句：vault = 本地 papers/experiments，不是产品仓

### 建议排期

1. 私有 webui 仓归档文案 + master banner  
2. 文档路径统一 monorepo  
3. install-all 实机一次装通  
4. System/Run 状态与空态抛光  
5. 前端拆模块（独立 PR）  
6. vault commit（仅本地）

## 许可证

**AGPL-3.0** — [LICENSE](LICENSE)。PsychoPy 另计 — [NOTICE](NOTICE)。
