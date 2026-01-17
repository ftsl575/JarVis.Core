# Status

## Current state
- Repo scaffold in place (adapters/, core/, docs/, scripts/, samples/).
- Chat/window handoff system added: docs/STATUS.md, docs/HANDOFF.md, docs/DECISIONS.md, docs/ROADMAP.md, docs/CHAT_RULES.md plus `npm run handoff` (scripts/handoff.js).
- HPE adapter now parses configurator XLSX files and exports Canonical v1 JSONL, item JSONL, and a summary report.

## What’s next (1 step)
- Add Canonical v1 validation and enrichment logic inside core processing for HPE (required fields, vendor-specific rules, and downstream exports).

## Inputs needed from user
- 3–10 sanitized sample HPE configurator `.xlsx` files.
- Expected outputs for those samples (canonical JSON/CSV/line format, or a reference export).
- Any naming constraints (file/folder naming, customer IDs, field naming conventions).

## How to run (local)
```bash
npm install
npm run handoff
npm run canon:hpe
```

## Troubleshooting
- If `npm install` fails, confirm dependency versions are published and the npm registry is reachable from your network.
- Development Node.js version: v22.21.1.
