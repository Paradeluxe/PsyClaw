# PsyClaw 150-paper replication pipeline

Canonical marker: `<folderName>.psyclaw` only (legacy Builder files are not the deliverable).

## Commands

```bash
# unit/integration tests
python -m pytest webui/tests/replication150 -q

# one paper dry-run
python -m tools.replication150.cli one cat1_stroop --manifest E:/hermes_playground/psyclaw-vault/catalog/papers.json --dry-run

# batch dry-run
python -m tools.replication150.cli batch --manifest E:/hermes_playground/psyclaw-vault/catalog/papers.json --category 1 --dry-run

# cold backup (required before real vault writes)
python -m tools.replication150.cli backup --vault E:/hermes_playground/psyclaw-vault --out E:/backup/psyclaw_150_<timestamp>
```

## Validation ladder

1. Corpus integrity (50+50+50)
2. PDF resolve + audit
3. Method evidence
4. Marker validate + compile
5. WebUI open parity
6. Protocol assertions
7. Autopilot ×3
8. four-file analysis pack per run
9. Pilot/visual sample

## Materials policy

- Public/downloadable stimuli for replication: allowed.
- Application/license gated corpora: list only, do not download.
