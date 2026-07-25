# Session state file

**Source of truth** for “where we are” in the pipeline. Chat may echo one line; **file wins** after reload/compress.

## Path

| When | Path |
|------|------|
| Project dir known | `<projectDir>/.psyclaw-session.json` |
| Before OutPath | `./.psyclaw-session.json` under **session cwd** (not Desktop, not skill install tree) |
| OutPath just locked | **Move/write** into `<projectDir>/.psyclaw-session.json`; delete cwd copy if different |

Never write under the skill install tree (`…/skills/psyclaw/`).

## Schema (minimal)

```json
{
  "version": 1,
  "state": "clarify",
  "lang": null,
  "lit": "off",
  "lit_path": null,
  "gaps": ["Random", "Trial"],
  "ask_run": null,
  "marker": null,
  "project_dir": null,
  "design_tag": null,
  "notes": "",
  "updated": "2026-07-21T12:00:00"
}
```

| Field | Values / meaning |
|-------|------------------|
| `state` | `hear` \| `lit` \| `clarify` \| `write` \| `validate` \| `ask_run` \| `handoff` \| `done` |
| `lang` | `null` until first substantive user msg → then BCP-47-ish tag (`zh` / `en` / …). Chat + operator-facing text follow this; do not reset because docs are EN |
| `lit` | `off` \| `pending` \| `landed` \| `waived` |
| `lit_path` | local Method/PDF path under `refs/` when landed; else `null` |
| `gaps` | checklist codes still open: `Design` `IV` `DV` `Control` `Random` `Practice` `Script` `Response` `Trial` `OutPath` |
| `ask_run` | `null` \| `yes` \| `no` — once set in session, do not re-ask unless user resets |
| `marker` | absolute/relative path to `<folderName>.psyclaw` when written |
| `project_dir` | project folder when known |
| `design_tag` | e.g. `2×2 within` |
| `notes` | short free text (deviations, blockers) |
| `updated` | ISO-8601 when last written |

## Agent rules

1. **On skill start / resume** — if a session file exists in project or cwd, **read it** and continue from `state`; do not restart clarify from zero.  
2. **After every step** — update fields + `updated`; write file.  
3. **Legal transitions** (skip only if user explicitly jumps and you log it):

```text
hear → lit | clarify
lit  → clarify          (only if lit landed or waived)
clarify → write         (stop signals / core gaps empty)
write → validate
validate → ask_run | write   (fail → fix → write)
ask_run → handoff | done     (yes → handoff; no → done)
handoff → done
```

4. **Lit gate:** if `lit` is `pending`, do **not** ask Design/IV/N; stay in retrieval until `landed` or `waived`.  
5. **Ask-run:** if `ask_run` is already `yes`/`no`, skip the question (optional one-line reminder on small edits).  
6. **Done:** `state=done` when marker-only delivery finished, or handoff finished / user stops.  
7. **Chat echo (optional):** one line for humans, e.g.  
   `state: clarify · lit: off · gaps: Random,Trial · ask_run: —`

## Stub

Copy `session-stub.json` and fill; or write the schema above on first hear.
