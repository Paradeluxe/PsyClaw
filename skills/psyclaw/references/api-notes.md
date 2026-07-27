# WebUI API notes (agent)

Load only when calling webui, compiling, or debugging runs. User-facing prep → `run-prep.md`.

## Architecture

```text
<folderName>.psyclaw  (design JSON)
        │
        ▼
Flask 127.0.0.1:8876
  POST /api/runs { design, session, headless, project_path }
        │
        ▼
design_compiler → pure PsychoPy .py
        │
        ▼
PsychoPyProcess
  • runs/<id>/data/*.csv                 (internal)
  • <project_path>/data/{id}_s{sess}_{ts}.csv   (REQUIRED mirror)
```

- Repo: `Paradeluxe/psyclaw` (webui/ subdir) · port **8876** only (not 8787)
- Lab app is **not** a skill; companion skill is only `psyclaw`
- Open duration canonical: **`-1`**
- **Timing units:** Method/template: `*_ms` + `unit=ms` · marker `start` / `duration`: seconds · never copy raw ms into duration (`1500 ms → 1.5 s`)
- Platform > named paradigms
- Marker: **`<folderName>.psyclaw`** (webui migrates legacy `design.psyclaw`)

## Success checks

| Stage | Pass means |
|-------|------------|
| **Design ready** | `scripts/validate_marker.py` exit 0; optional `--compile` → PsychoPy Python that opens a `Window` |
| **Run finished** | `/api/runs` → `finished` |
| **Data in project** | under **`<project_path>/data/`**: trial CSV **+** `{stem}_summary.json` **+** `{stem}_by_condition.csv` **+** `{stem}_metrics_long.csv` |

**Agent lab smoke:** Autopilot **×3** (same design, `project_path` set). Each run must finish and drop the full four-file pack. One green Autopilot ≠ smoke done.

When talking to the user, say the stage in plain language (writing the marker / finishing a run / files in project `data/`), not internal codes.

## Run API (minimal)

```json
{
  "design": { },
  "headless": true,
  "project_path": "C:\\\\path\\\\to\\\\MyExp",
  "session": {
    "participant_id": "P_autopilot",
    "session": "1",
    "participant_name": "batch",
    "notes": "",
    "experimenter": "PsyClaw AI"
  }
}
```

- Pilot: `participant_id: "P_pilot"` (no production ID burn)
- Autopilot smoke: headless + auto-keys; agent default **3 sequential** Autopilot runs (each finished + full data pack)
- **experimenter:** Autopilot / agent headless always stores `session.experimenter` = **`PsyClaw AI`** (webui forces this even if the form/API field is blank; CSV + roster + instrument)
- Formal: sequential IDs from `participants.json`
- Omit `project_path` → internal `runs/` only → **fails “data in project”**

## CSV minimum

- Session: `participant_id`, `session`, `participant_name`, `notes`, `session_date`, `uid`
- Trial: `trial`, `routine`, `response`, `corrAns`, `corr`, `rt`, `keys` + stimlist cols
- Pack: `{stem}.csv` + `_summary.json` + `_by_condition.csv` + `_metrics_long.csv`
- Detail (webui): `trial-metrics.md`

## Design object

Prefer `marker-stub.psyclaw` as start. Shape: `name`, `display`, `devices`, `routines[]`, `flow[]` (routine | loop + conditions + children).

Types (typical): `text`, `keyboard`, `image`, `sound`/`audio`, `video`, `rect`, `slider`, `code`. Prefer live compiler accepts.

### Classic metrics (optional)

```json
"metrics": { "group_by": ["congruent"] }
```

Stimlist carries factors (`congruent`, `trialType`, …) + `corrAns` when scoring. No paradigm-named compiler forks.

## Pitfalls

1. Marker ready ≠ lab delivery  
2. Missing `project_path` → empty project data folder  
3. Port **8876** only  
4. Do not emit `.psyexp` as skill deliverable  
5. Skill never freestyle-upgrades PsychoPy
