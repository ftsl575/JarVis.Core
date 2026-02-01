DOC_TYPE: NORMATIVE
DOC_SCOPE: CORE
DOC_STATUS: ACTIVE
DOC_ROLE: Consultant-window, Project-window, Codex-context

# Handoff

## Goal
Establish Canonical v1 validation starting with HPE inputs, then expand to other vendors once rules are proven.

## Last touched
Updated handoff/status docs and kept `npm run handoff` as the primary entry point for chat resumption.

## Context
- Repo is a scaffold: adapters/, core/, docs/, scripts/, samples/.
- Handoff system exists to reduce chat context bloat.
- No real parsing/validation logic is implemented yet; scripts are placeholders.
- Canonical spec docs live under docs/.

## What changed recently
- Added/updated handoff docs (STATUS/HANDOFF/DECISIONS/ROADMAP/CHAT_RULES) and the `handoff` npm script (scripts/handoff.js).

## Next steps
1. Collect real HPE configurator samples + expected outputs.
2. Derive Canonical v1 field requirements and validation rules from HPE specs.
3. Implement validation in `canon:hpe` and document the expected output format.

## Commands
```bash
npm install
npm run handoff
npm run canon:hpe
```

## Risks / gotchas
- Without real vendor samples, Canonical v1 rules may be speculative.
- Keep STATUS/HANDOFF updated to avoid stale handoff notes.
