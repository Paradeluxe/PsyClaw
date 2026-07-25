# PsyClaw WebUI

> **Monorepo 子包。** 本目录是
> **[Paradeluxe/psyclaw](https://github.com/Paradeluxe/psyclaw)**（`main`）里的 `webui/`。
> 请 clone 该 monorepo；不要把已弃用的私有仓 `psyclaw-webui` 当真源。
> Agent 技能在同仓 `skills/psyclaw/`。

[English](README.md) · [中文](README.zh-CN.md)

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-0ea5e9)](pyproject.toml)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-API-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![PsychoPy](https://img.shields.io/badge/PsychoPy-lab%20runner-ec4899)](https://www.psychopy.org/)
[![Bind](https://img.shields.io/badge/bind-127.0.0.1%3A8876-64748b)](http://127.0.0.1:8876/)
[![Platform](https://img.shields.io/badge/platform-Windows--first-lightgrey)](docs/INSTALL.md)
[![Marker](https://img.shields.io/badge/marker-.psyclaw-0ea5e9)](https://github.com/Paradeluxe/psyclaw)
[![Skill](https://img.shields.io/badge/AI%20skill-psyclaw-8B5CF6)](https://github.com/Paradeluxe/psyclaw)
[![GitHub stars](https://img.shields.io/github/stars/Paradeluxe/psyclaw?style=social)](https://github.com/Paradeluxe/psyclaw)

本机实验室界面：在这台电脑上 **设计** 并 **运行** PsychoPy 实验。

**宗旨：拿起来就能用。** 打开文件夹 → Pilot → Start → `data/` 里直接是可分析数据。可选 AI：丢 Method/论文 → 写出可跑标记 → 同一条 Run 管线。

```text
<folderName>.psyclaw（JSON）→ 自研编译器 → PsychoPy Python → <project>/data/*
  试次长表 CSV + summary.json + by_condition.csv + metrics_long.csv
```

- **不是** PsychoPy Builder 的 XML。**不是**在线被试平台。
- 以 Windows 为主。数据留在实验室机器（仅监听 `127.0.0.1`）。
- 标记文件名：**`<folderName>.psyclaw`**（旧的固定名 `design.psyclaw` 在打开/保存时迁移）。
- 论文 → 脚本：Hermes `/psyclaw` 收自然语言或 Method PDF，技能写标记（说明书就绪）；本 UI 跑被试。

## 用户使用管线

实验室会话怎么走（以及可选的 AI 技能）。

### A. 人在实验室（仅本仓库）

```text
打开 / 新建项目文件夹
        ▼
Builder   编辑设计 → 保存  (<folder>/<folder>.psyclaw)
   或打开 AI 技能写好的标记文件
        ▼
System    主机与 PsychoPy 预检（需要时）
        ▼
Run
  • Pilot     真人窗口、手动按键 · P_pilot（不占正式号）
  • Autopilot 无头自动按键 · P_autopilot
  • Start     正式被试
        ▼
Session 字段
  自动：被试编号 · 时间戳 · UID（YYYYMMDD_<8hex>）
  可选：姓名 · 场次 · 主试 · 备注 · 额外字段
        ▼
结束 → CSV 镜像到 <project>/data/{id}_s{sess}_{ts}.csv
     → 另有 `_summary.json` · `_by_condition.csv` · `_metrics_long.csv`
     → 更新名册 → 下一空闲编号 + 新 UID（无需手动点 Next）
```

**每次跑完的数据包：**

| 文件 | 用途 |
|------|------|
| `{id}_s{s}_{ts}.csv` | 试次长表（默认分析） |
| `…_summary.json` | 总正确率 / 平均 RT + 分组 |
| `…_by_condition.csv` | 每条件一行（Excel） |
| `…_metrics_long.csv` | 指标长表（R / ggplot） |

Instrument 显示正确率、平均 RT；Go/NoGo 时还有击中/虚报率。

**多名被试：** **按顺序** 跑。编号自动编码。不要另做第二套批量产品——顺序点 Start 就是多人路径。

| 检查 | 通过条件 |
|------|----------|
| 说明书就绪 | 设计可编译 |
| 运行完成 | 运行状态 `finished` |
| 数据落盘 | CSV 在 **`<project_path>/data/`** |

### B. 配合 Hermes `/psyclaw`（可选）

AI 技能写标记；本 UI 跑被试。技能安装 ≠ 本 GUI。

```text
/psyclaw
  听取 → 澄清（教练 + 默认）→ 写 <folder>.psyclaw（说明书就绪）
       → 智能体询问：要跑被试吗？
            否  → 停在标记文件
            是  → 打开本 webui / POST /api/runs
                  按顺序跑被试
                  智能体驱动时：session.experimenter = AI 身份
                  自动编号 / UID；P_pilot 不占号；结束后下一号
```

**没有**「只播指导语 / 只跑 N 题」的半跑产品模式。Builder 有组件 PREVIEW；实验室交付是 Pilot / Start + CSV。


## 功能

| 区域 | 内容 |
|------|------|
| **Builder** | 拖放组件、时间线、流程循环 + 刺激表、检查器 PREVIEW |
| **System** | 主机 / PsychoPy 预检、显示器与音频设备选择 |
| **Run** | Start · Pilot · Autopilot；会话 + 名册；Instrument；项目 `data/` CSV |
| **i18n** | 英文 / 中文 |

当前组件板：**text, keyboard, image, video, fixation, code**（以及在线编译器已支持的类型）。

## 快速开始

从 monorepo 根目录开始（推荐）：

```bash
git clone https://github.com/Paradeluxe/psyclaw.git ~/psyclaw
cd ~/psyclaw/webui
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix:    source .venv/bin/activate
pip install -r requirements.txt
# 可选：PSYCLAW_PSYCHOPY_PYTHON 指向能 import psychopy 的 Python
python start.py
# → http://127.0.0.1:8876/
```

1. **PsychoPy** 装在**独立**环境（Flask 启动不必装）。
2. 完整安装 / 更新 / doctor：**`docs/INSTALL.md`**。

未设置 `PSYCLAW_PSYCHOPY_PYTHON` 时会探测常见路径；正式跑被试建议显式设置。

## 目录布局

```text
backend/          Flask API、design_compiler、runner、系统探测
frontend/         SPA（原生 HTML/JS/CSS）
docs/             PRODUCT、INSTALL、设计系统、契约、发布清单
tests/            pytest + example_experiment（Stroop 夹具）
examples/         示例刺激表
designs/          示例项目文件夹
runs/             服务端运行产物（gitignore）
```

## 文档

| 文件 | 内容 |
|------|------|
| `README.md` | 英文（默认） |
| `README.zh-CN.md` | 中文 |
| `docs/PRODUCT.md` | 目标 / 非目标 / 标签页 |
| `docs/INSTALL.md` | 实验室安装 |
| `docs/design.md` | UI 设计系统 |
| `docs/CONTRACT.md` | 设计与 API 约定 |
| `docs/RELEASE_CHECKLIST.md` | 维护者发版清单 |
| `LICENSE` | AGPL-3.0 |
| `CITATION.cff` | 引用元数据 |

## 检查

```bash
python -m pytest tests/ -q
curl -s http://127.0.0.1:8876/api/health
```

## 许可证

**AGPL-3.0** — 见 [LICENSE](LICENSE)。PsychoPy 为独立第三方软件 — [NOTICE](NOTICE)。
