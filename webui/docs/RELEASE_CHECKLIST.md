# Release checklist

Maintainer checklist when cutting a version tag.

## Before tag

- [ ] Working tree clean; no secrets, tokens, or real participant data
- [ ] `LICENSE` is AGPL-3.0; `CITATION.cff` version matches `pyproject.toml`
- [ ] README matches shipped UI (tabs, `<folderName>.psyclaw`, usage pipeline)
- [ ] `PSYCLAW_PSYCHOPY_PYTHON` documented; no machine-specific absolute path required
- [ ] Example projects use relative asset paths only
- [ ] `python -m pytest tests/ -q` green on a clean clone with documented PsychoPy path
- [ ] Scope honest: listed components + keyboard RT; not full Builder replacement

## Tag

- [ ] Bump version in `pyproject.toml` and `CITATION.cff`
- [ ] Tag `vX.Y.Z` and note highlights in release notes
- [ ] Optional: `python webui/scripts/build_dist_zip.py --out dist/psyclaw-src-vX.Y.Z.zip` and attach to GitHub Release (**only with user OK**)
- [ ] Optional companion: Hermes skill release notes if marker schema changed

## Never ship

- API keys, messaging tokens, private lab paths as the only install story
- Participant CSVs from real subjects
- Copyrighted paper PDFs in the release tree
