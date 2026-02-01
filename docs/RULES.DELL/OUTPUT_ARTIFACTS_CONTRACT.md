DOC_TYPE: NORMATIVE
DOC_SCOPE: DELL
DOC_STATUS: ACTIVE
DOC_ROLE: Consultant-window, Project-window, Codex-context

# Dell output artifacts contract (out/ vs diag/)

> **Authoritative context:** Dell behavior is frozen by [Dell Design Freeze v1](DELL_DESIGN_FREEZE_v1.md). This document only records the current contract and does not change any behavior.

## Purpose
This contract exists so consumers and humans can rely on a deterministic list of Dell pipeline artifacts (names + locations) for the current implementation. It is strictly documentation of **existing** behavior. Any change to the output contract must be proposed as a docs-only design update first, followed by a separate implementation PR.

## How to interpret directories
- **`out/`**: Default output directory for Dell artifacts produced by the adapter and diagnostics scripts (canonical/items/summary, segmentation, materialized segments, cleaned spec). During batch runs, `out/` is overwritten per input and ends with the last processed input.
- **`diag/`**: Diagnostics/batch-run folders. For Dell batch runs, each input gets a `diag/run_<YYYY-MM-DD>_<HHMMSS>__<input_basename>/` snapshot of the `out/` artifacts. Outside of batch runs, it is not written to.

## Artifact contract (by file)

| Artifact (name/pattern) | Directory | Producer step (script/command) | Meaning (minimal) | Classification | Relationships |
| --- | --- | --- | --- | --- | --- |
| `canonical.jsonl` | `out/` | Dell adapter: `node adapters/dell/index.js <input.xlsx> --out <outDir>` | Canonicalized rows from the input workbook. | REQUIRED | Source layer for downstream items and segmentation. |
| `items.jsonl` | `out/` | Dell adapter: `node adapters/dell/index.js <input.xlsx> --out <outDir>` | Normalized item rows (line items) derived from the input workbook. | REQUIRED | Input for Dell segmentation (`segments.dell.json`). |
| `summary.json` | `out/` | Dell adapter: `node adapters/dell/index.js <input.xlsx> --out <outDir>` | Summary counts/metadata for the adapter run. | REQUIRED | Reports counts for the same run as `canonical.jsonl` / `items.jsonl`. |
| `segments.dell.json` | `out/` | Dell segmentation: `node scripts/diagnostics/dell-segments.js --items <out/items.jsonl> --out <out/segments.dell.json>` | Segmentation payload containing segment IDs and row references derived from `items.jsonl`. | REQUIRED | Consumed by Dell materialization (`dell_segment_<segment_id>.json`). |
| `dell_segment_<segment_id>.json` | `out/` | Dell materialization: `node scripts/diag/dell/materialize.mjs` | Per-segment payload containing the anchor and item rows for a segment. | REQUIRED | Input for cleaned spec generation (`cleaned_spec.dell.segment_<segment_id>.xlsx`). |
| `cleaned_spec.dell.segment_<segment_id>.xlsx` | `out/` | Dell cleaned spec generator: `node scripts/dell-cleaned-spec.js <out/dell_segment_<segment_id>.json>` (or no-arg to discover `out/dell_segment_*.json`) | Human-readable cleaned spec workbook for one segment. | REQUIRED | Derived from `dell_segment_<segment_id>.json`. |
| `cleaned_spec.dell.segment_<segment_id>.xlsx` | `diag/run_<YYYY-MM-DD>_<HHMMSS>__<input_basename>/` | Dell batch runner: `node scripts/diagnostics/dell-batch.js` (copies `out/` artifacts into per-input diag folder) | Diagnostic copy of the cleaned spec for each batch input. | OPTIONAL/DIAGNOSTIC | Copy of the `out/` artifact for batch inspection. |
| `out1.txt` (observed) | `out/` | **Not produced by current Dell scripts**; present in the referenced run bundle as an input workbook saved with a `.txt` extension. | The provided reference notes this is actually an Excel workbook despite the `.txt` extension. | OPTIONAL/DIAGNOSTIC | Not part of the Dell pipeline output contract; treat as run-specific input residue. |

## Scenario: referenced run (observed outputs)
The provided `out.rar` bundle for a Dell run contains these artifacts in `out/`:
- `canonical.jsonl`
- `items.jsonl`
- `segments.dell.json`
- `dell_segment_dell_dl1_s001.json`
- `summary.json`
- `cleaned_spec.dell.segment_dell_dl1_s001.xlsx`
- `out1.txt` (Excel workbook with `.txt` extension)

In this referenced run, **`out/` is used** and **`diag/` is not present**.

## Non-goals / stability notes
- This document **does not** change any Dell pipeline behavior; it only records the current output contract.
- Any change to outputs, naming, or locations must be proposed as a **docs-only design update first**, then implemented in a separate PR that updates code.

## Cleaned spec semantics pointer
The Dell cleaned spec is intended to reflect **physical supply** and intentionally omits configurator “state/mode” lines. For full context, see [docs/RULES.DELL/CLEANED_SPEC_PRINCIPLE_Dell.txt](CLEANED_SPEC_PRINCIPLE_Dell.txt).
