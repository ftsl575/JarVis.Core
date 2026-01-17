# Status

## Current state
- Repo scaffold in place (adapters/, core/, docs/, scripts/, samples/).
- Chat/window handoff system added: docs/STATUS.md, docs/HANDOFF.md, docs/DECISIONS.md, docs/ROADMAP.md, docs/CHAT_RULES.md plus `npm run handoff` (scripts/handoff.js).
- Canonical parsing/validation logic is not implemented yet; scripts are placeholders.

## What’s next (1 step)
- Begin Canonical v1 validation using real vendor specs, starting with HPE (define required fields and validation rules from HPE docs, then update canon:hpe to enforce them).

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
