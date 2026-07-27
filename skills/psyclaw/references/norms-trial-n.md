# Norms appendix — trial N & duration (checklist item 9)

Load when setting per-cell N, session length, or **被试 N** (power). Core: `norms-core.md`.

**Trial N** = formal trials **per condition/cell**.  
**Participant N** = people — separate; do not fake power.

## Defaults (behavioral RT / accuracy, user shrugs)

| Layer | Default | Notes |
|-------|---------|--------|
| **Practice** | 8–12 | High-load (n-back…) → 12–20; pass ≥60% (one redo) |
| **Per condition (cell)** | **24** | Stable mean RT after light exclusions |
| **Demo / classroom** | 8–12 / cell | Say once: not publishable density |
| **Individual-diff / heavy exclusion** | 30–40 / cell | If user asks reliability |
| **Exclusion buffer** | × **1.15** | So post-reject cells ≈ target |

**Total formal** (within, fully crossed):

```text
total = (product of level counts) × trials_per_cell
# e.g. 2×2 × 24 = 96 formal
```

- **Total only** → split equal across cells; say per-cell.  
- **Per-cell** → compute total; recap both.  
- **≥6 cells:** keep 24 unless wall ~>35–40 min → offer 16–20/cell or blocks+rest.  
- **Continuous IV:** per sampled row/bin; same 24 default unless list long.  
- **Marker:** `conditions` rows × `nReps` = agreed total.

## Duration (recap before write)

```text
minutes ≈ total_formal_trials × seconds_per_trial / 60
```

Default skeleton ≈ **2.5–3.5 s/trial** → **~20–25 trials/min**.

| Total formal | ≈ task core | Note |
|--------------|-------------|------|
| 48 (2×2×12 demo) | ~2–3 min | classroom |
| **96 (2×2×24)** | **~4–6 min** | common lab |
| 192 | ~8–12 min | light |
| 300–400 | ~15–20 min | mid rest if fragile pop |
| ≥600 or **>~35 min wall** | — | blocks + rest; cut factors or per-cell |

Always recap: `per-cell N · total formal · ≈ minutes · practice n`.  
Spoken wall time: +~5–10 min (instructions/practice/breaks).

Timing skeleton default: fixation 500ms → stim → response → ITI 600–1500ms jitter. Frame-lock only if fMRI/ERP/eye-tracking/TMS.

**Marker write:** Method times stay in `*_ms`; component `duration` is **seconds** (`1500 ms → 1.5 s`). Open-ended = `-1`.

## Not this

- ERP/fMRI floors: if user says ERP, prefer ≥40 presented/cell before reject; else behavioral defaults.  
- **被试 N / power:** do not invent N. If asked, G*Power reference only:

  - paired-t: dz=0.5, α=0.05, power 0.80  
  - RM-ANOVA: f=0.25, ε=1, α=0.05, power 0.80  

  「装 G*Power → t-test / F-test Means Within-Repeated → 填上表参数 → 读最小 N」。Never self-compute sample size.
