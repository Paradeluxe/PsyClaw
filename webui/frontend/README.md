# WebUI frontend layout

Vanilla JS (no bundler). Flask serves this folder as static files.

## Load order (`index.html`)

| Script | Role |
|--------|------|
| `i18n.js` | `window.PsyClawI18n` |
| `builder.js` | `window.PsyClawBuilder` — design model + Flow UI |
| `app-system.js` | `window.PsyClawSystem` — System tab / gate / probes |
| `app-run.js` | `window.PsyClawRun` — Run tab / roster / instrument |
| `app.js` | Shell: tabs, net status, project open/save, settings, boot |
| `forms.js` | Optional form helpers (if referenced) |
| `style.css` | All UI styles |

## App modules (runtime split)

- **`app-system.js`** — host figure, engine gate, device tests  
- **`app-run.js`** — Start / Pilot / Autopilot, roster, instrument  
- **`app.js`** — welcome gate, project files, settings, `boot()`  

Re-extract after large shell edits: `python webui/scripts/_extract_app_modules.py`  
(from monorepo root; overwrites the three files from a monolithic `app.js` if present).

## Builder modules (source parts + assembled runtime)

Editable slices live in **`builder-parts/`**:

| Part | Contents |
|------|----------|
| `builder-part-model.js` | design model, selection, flow tree ops |
| `builder-part-display.js` | monitors, I/O devices, display card |
| `builder-part-ui.js` | palette, timeline, flow canvas |
| `builder-part-preview.js` | inspector component PREVIEW |
| `builder-part-boot.js` | boot + `window.PsyClawBuilder` export |

**Runtime file** is still a single `builder.js` (one IIFE — shared closure).  
After editing parts:

```bash
python webui/scripts/_split_builder.py --assemble
```

Or full re-split from a monolithic `builder.js.bak-before-split` if needed.

## Cache bust

Bump `?v=` on script tags in `index.html` when shipping frontend changes.
