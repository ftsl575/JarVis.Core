# Status

## Current state
- Repo scaffold in place (adapters/, core/, docs/, scripts/, samples/).
- Chat/window handoff system added: docs/STATUS.md, docs/HANDOFF.md, docs/DECISIONS.md, docs/ROADMAP.md, docs/CHAT_RULES.md plus `npm run handoff` (scripts/handoff.js).
- HPE adapter parses configurator XLSX files and exports:
  - Canonical v1 JSONL
  - Items JSONL
  - Summary JSON
- HPE baseline v1 is documented in `docs/BASELINE.md`.
- Unicode (Cyrillic) filenames are preserved end-to-end:
  - `source.file` contains the exact original filename
  - derived IDs include the original filename without garbling
- Test infrastructure cleaned up:
  - Jest removed
  - Tests migrated to Node built-in test runner (`node:test`)
  - `npm test` runs without extra dependencies

## What’s next (1 step)
- Add Canonical v1 validation and enrichment logic in core processing:
  - schema validation against `canonical_v1.schema.json`
  - required-field checks
  - vendor-specific (HPE) normalization rules
  - clear error/warning codes for downstream consumers

## HPE diagnostics logging (post-run)
### Design
1) Two-level model
   - Per-run snapshot: immutable run folder under `diag/run_<YYYY-MM-DD_HHMMSS>__<label>`.
   - Global accumulated history: append-only `diag/history.jsonl` for cross-run analysis.
2) Separation of concerns
   - Diagnostics are generated strictly after the HPE invoice workflow completes and are derived from produced outputs only.
   - Production outputs remain authoritative and unchanged.
3) Traceability
   - Each snapshot and history record includes `run_id`, timestamps, the absolute input path (and a byte-identical `input.xlsx` copy), and `git_sha`.
4) Naming and labeling
   - `run_id` format: `run_<YYYY-MM-DD_HHMMSS>__<label>`.
   - Label is derived from the input filename (filesystem-safe), preserving Unicode when possible.
   - If multiple runs occur within the same second, a deterministic numeric suffix is appended.
5) Robustness
   - Missing artifacts do not fail the pipeline; `run_meta.json` records missing entries.
   - `history.jsonl` is append-only and aggregated per run to avoid duplication within a run.

### What gets captured
After `npm run docs:hpe:invoice`, a new snapshot folder is created under `diag/` containing:
- `input.xlsx` (copy of the cleaned spec used to generate the invoice)
- `input_path.txt` (absolute path to the input file)
- `canonical.jsonl`
- `items.jsonl`
- `summary.json`
- `hpe_invoice.xlsx`
- `run_meta.json` (run metadata, file hashes, and counts)

An append-only `diag/history.jsonl` is updated with per-run aggregated records (per part number, description, device type).

### HPE batch diagnostics
- Batch inputs live in `C:\Users\G\Desktop\JarVis\JarVis.Core\diag\_batch_inputs` (all direct child `.xlsx`, case-insensitive).
- Run: `npm run diag:hpe:batch`.
- Outputs: one `diag/run_<timestamp>__<label>` per input (plus optional `diag/history.jsonl`).

## Inputs needed from user
- 3–10 sanitized sample HPE configurator `.xlsx` files.
- Expected outputs for those samples (canonical JSONL / CSV / reference export).
- Any naming constraints:
  - file/folder naming
  - customer or order identifiers
  - field naming conventions for downstream documents.

## How to run (local)
```bash
npm install
npm run handoff
npm run canon:hpe
npm test
