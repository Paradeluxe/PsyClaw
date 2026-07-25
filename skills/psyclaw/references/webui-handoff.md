# WebUI handoff (index)

Skill writes **`<folderName>.psyclaw`**. After the marker validates, ask whether to run subjects — **session language** — if session `ask_run` is still `null`. Yes → lab app **psyclaw-webui**.

| Load | When |
|------|------|
| [`run-prep.md`](run-prep.md) | ask-run yes — user checklist, what “done” means, agent Autopilot ×3 smoke |
| [`api-notes.md`](api-notes.md) | calling webui / compile / data pack / API |
| [`failure-playbooks.md`](failure-playbooks.md) | paywall, webui down, compile fail, missing project data, lost session |
| [`marker-validate.md`](marker-validate.md) | after write/edit (+ `scripts/validate_marker.py`) |
| [`marker-stub.psyclaw`](marker-stub.psyclaw) | new marker shape |

**Concrete done-lines (say these to the user):**  
1. Design: marker validates (optional compile opens a Window).  
2. Run: this session finished.  
3. Data: project `data/` has trial CSV + summary + by_condition + metrics_long.  

**Agent smoke:** Autopilot ×3; each must finish and drop that full pack.  
**Out of scope:** half-run lab mode (Builder PREVIEW ≠ participant run).

**Related:** `Paradeluxe/psyclaw` · pipeline `skill-pipeline.md` · state `session-state.md`
