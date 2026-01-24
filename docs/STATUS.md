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
