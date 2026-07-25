# Failure playbooks

One standard reply pattern each: **what happened → what we need → next step**. Do not invent Method / silent-install / freestyle PsychoPy upgrades.

## 1. Paywall / no full text / abstract only

**Say:**  
「这篇只有摘要/付费墙，我这边拿不到 Method，不能按文献编造参数。」

**Next:**  
1. 请用户粘贴 Method，或提供 PDF/OA 链接（OSF/PMC/作者稿）  
2. 或 **waive lit** → 改用 norms 默认，并在 `design_notes` / session 记 `lit=waived`  
3. 仍要文献时保持 `lit=pending`，**不要**进入 Design 深问

## 2. browser-skill missing (needed for fetch)

**Say:**  
「需要浏览器技能才能打开出版社页面；要不要现在安装 browser-skill？（不装就请你贴 Method/PDF）」

**Next:** ask once · never silent-install · user no → paste fallback or waive.

## 3. WebUI won’t start / port dead

**Say:**  
「实验室软件没在 http://127.0.0.1:8876 起来。我不会在 skill 里硬升 PsychoPy。」

**Next:**  
1. 按 webui `docs/INSTALL.md` 启动 / 查占用  
2. 确认端口 **8876**（不是 8787）  
3. System 预检失败 → 用户在 webui System 里 Re-run  
4. Marker 仍可交付；`ask_run` 可保持 yes，state 停在 `handoff` 直到起来

## 4. Compile / validate fail

**Say:**  
「说明书还不能编译/校验没过：〈一条具体原因〉。」

**Next:**  
1. Run `marker-validate.md` hard checks  
2. Fix marker (start from stub shape if structure broken)  
3. Re-validate; optional recompile  
4. **Do not** claim marker ready or start formal subjects

## 5. Run finished but project data pack incomplete

**Say (session language), e.g. ZH:**  
「这次跑是结束了，但项目 `data/` 里没有齐：需要试次 CSV，加上 summary、by_condition、metrics_long。多半是没指项目路径，或结果没拷进项目文件夹。」

**Next:** re-run with `project_path` = project dir; confirm all four files under `<project>/data/`. Files only under internal `runs/` do not count as delivered. Agent smoke still needs Autopilot ×3, each with a full pack.

## 6. Session file missing / corrupt

**Say:**  
「进度文件丢了或坏了；我根据现有 marker/对话重建一份。」

**Next:**  
1. If marker exists → `state=ask_run` or `clarify` from marker + user one-line confirm  
2. Rewrite `.psyclaw-session.json` from `session-stub.json`  
3. Do not restart lit search if `refs/` already has the paper

## 7. User gone mid-lit

Keep `lit=pending` in session file. On resume: show path tried + offer paste/OA/waive — do not silently fill Method.
