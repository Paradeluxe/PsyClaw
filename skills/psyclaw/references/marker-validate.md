# Marker validate (after every write/edit)

Run **in order**. Soft checks may warn; hard fails block “marker ready”.

## Hard fail (must pass)

| # | Check | Pass means |
|---|--------|------------|
| 1 | **File** | `<projectDir>/<folderName>.psyclaw` exists; `folderName` = basename of `projectDir` |
| 2 | **JSON** | File parses as a single JSON object (UTF-8) |
| 3 | **Shape** | Top-level has non-empty `routines` (array) and `flow` (array) |
| 4 | **Routine refs** | Every `flow` node with `"kind":"routine"` names a routine that exists in `routines[].name` |
| 5 | **Loop kids** | Every `"kind":"loop"` has non-empty `children` and `nReps` ≥ 1 |
| 6 | **Trial skeleton** | At least one routine used in a loop has a stimulus-like component (`text`/`image`/…) **and** a response component (`keyboard`/`slider`/…), unless user waived response |
| 7 | **No parallel schema** | No Builder `.psyexp` as deliverable; no invented top-level keys that replace `routines`/`flow` |
| T1 | **Timing units** | `start`/`duration` are **seconds** (`-1` = open-ended). No `duration_ms`. Generated markers: finite `duration > 30` hard-fail (e.g. `1500 ms → 1.5 s`). Validator/compiler do **not** auto-convert ambiguous values. |

## Soft warn (fix once, still may ask-run)

| # | Check | If missing |
|---|--------|------------|
| A | `name` | Set to `folderName` |
| B | `display` | Default window ok for lab; webui may fill |
| C | `devices` | Prefer explicit keyboard/mouse if used |
| D | conditions / stim columns | Factors + `corrAns` when scoring expected |
| E | practice vs main | Separate loops if practice was agreed |
| F | `design_notes` | design tag + path + lit citation + deviations |

## Optional deep gate (when webui is up)

| # | Check | Pass means |
|---|--------|------------|
| C1 | **Compile** | webui `design_compiler` (or equivalent) emits parseable Python containing `Window` |
| C2 | | Fail → fix marker; do not claim marker ready |

Skill-alone success = hard checks 1–7. Lab success still needs run `finished` + `<project>/data/` CSV (`webui-handoff.md`).

## Agent procedure

1. Write/edit marker (start from `marker-stub.psyclaw` if new).  
2. **Machine check (required):** from skill root or any cwd:
   ```bash
   python scripts/validate_marker.py <projectDir>/<folderName>.psyclaw
   # or: python scripts/validate_marker.py <projectDir>
   # optional C1:  python scripts/validate_marker.py <path> --compile
   # CI/agent:      python scripts/validate_marker.py <path> --json
   ```
   Script lives at `scripts/validate_marker.py` inside the skill package. Exit `0` = hard pass; `1` = hard fail; `2` = path/IO. Soft warns print but do not fail exit.  
3. Do **not** claim validate OK without exit 0 (or equivalent `--json` `"ok": true`).  
4. If webui up and user will run soon → add `--compile` (C1).  
5. On hard fail → fix, re-run script.  
6. On all hard pass → **marker ready** → ask run-subjects in **session language** (unless already answered).

## Recap line (before ask-run)

```text
ready: <path>/<folderName>.psyclaw · <design tag> · DV=… · N=… · validate OK
```
