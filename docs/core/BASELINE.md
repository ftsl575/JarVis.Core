DOC_TYPE: NORMATIVE
DOC_SCOPE: CORE
DOC_STATUS: FROZEN
DOC_ROLE: Consultant-window, Project-window, Codex-context
DOC_ORIGIN: HPE-derived baseline

# HPE Baseline v1 (Official)

## Baseline identifier
- **Tag:** `hpe-baseline-v1`
- **Purpose:** this document defines the official HPE baseline v1 for JarVis.Core.

### Tag reference
```bash
git tag -a hpe-baseline-v1 HEAD -m "JarVis.Core HPE baseline v1"
git push origin hpe-baseline-v1
```

## Baseline metadata (recorded)
- **Merge commit SHA:** recorded by the annotated tag `hpe-baseline-v1`.
- **PR URL:** documentation-only baseline finalization (this change).
- **Date:** tag date for `hpe-baseline-v1`.
- **Branch:** `origin/main`.
- **Notes:** CI verified with `npm test` passing.

## What is frozen
**Included**
- Repository source code, scripts, and documentation at the merge commit.
- Tooling expectations captured by verification scripts.

**Excluded**
- Local environment state (OS, shell, user-specific settings).
- Generated outputs and logs (including `logs/baseline/`).
- Dependency install artifacts (e.g., `node_modules/`).

## Authoritative baseline behavior (HPE v1)

### Segmentation (source of truth)
- Target Model summary: configurations are created **only** by primary CTO anchors; secondary anchors never create configurations. Placement markers (B##) and Factory Integrated lines are metadata within the active configuration. Lines outside configurations may exist (ZIP/spares). The count of configurations equals the count of primary anchors. See `docs/core/SEGMENTATION.md` for the formal rules. Do **not** change the Target Model in this baseline.
- Adjacent CTO anchors rule: if multiple CTO anchors appear consecutively with no component rows between them, the **first** anchor is primary and starts the configuration, and all subsequent anchors are secondary and do **not** create new configurations.
- Segmentation is the source of truth for all consumer generators (cleaned spec, invoice, diagnostics); consumer outputs must follow the segmentation model rather than invent new splitting rules.

### Levels of truth (artifacts)
- `out/items.jsonl` is the source of truth for canonicalized line-items data produced by canonicalization.
- Segmentation is the source of truth for structure/grouping used by consumer outputs (cleaned spec, invoice).
- `cleaned_spec.xlsx` is a derived, human-readable export for traceability; it is not a source of truth.

### cleaned_spec.xlsx (human-readable, traceable export)
- Purpose: a human-readable representation of the parsed HPE configuration items, intended for review and traceability across the pipeline.
- Ordering is fixed and deterministic: physical items first, then non-physical items.
- Traceability fields are mandatory and must be preserved end-to-end: **Source File**, **Source Sheet**, **Source Row**, and **Source Item ID**. These guarantee provenance and enable audits back to the original input.
- Naming note: `cleaned_spec.xlsx` is the normative artifact name; `cleaned.xlsx` may appear in older snapshots as a historical alias for the same cleaned spec output (no separate artifact).

### hpe_invoice.xlsx (configuration-based invoice)
- Configuration grouping is based on segmentation: output is split into CFG blocks using the segments produced by the segmentation model.
- Physical-only inclusion: only physically delivered items are included on the invoice.
- License inclusion rule: licenses/software appear **only** when a physical carrier is present in the same configuration.
- Explicit exclusions: services, subscriptions, and installations are excluded from the invoice.
- No Part Number (PN)-based logic is permitted for inclusion, grouping, or filtering.

### Batch / pipeline stability
- Standard flow: input XLSX → canonical/items JSONL → segmentation (segments.json); consumer outputs (cleaned_spec.xlsx, hpe_invoice.xlsx) are derived from items plus segmentation.
- Guarantee: no data loss across stages (input ↔ items ↔ cleaned_spec ↔ invoice), with traceability preserved throughout.
- Current status: batch pipeline (`diag:hpe:batch:pack`) is stable; real inputs (ex2, DL360, DL380, gleb1) pass without errors; `npm test` is green.

### Artifact paths (out/ vs diag/)
- **Source of truth:** `docs/RULES.DELL/OUTPUT_ARTIFACTS_CONTRACT.md` defines the authoritative contract for artifact paths and roles.
- **`out/`** is a last-run, overwritable view only; it contains artifacts from the most recent run and is not a historical store.
- **`diag/`** is the per-input/per-run diagnostics and historical layer; it snapshots artifacts for each run and may include copies of `out/`.
- **Separation:** `out/` and `diag/` are not interchangeable and serve distinct purposes.

### Guardrails (mandatory for future work)
- Do not alter the segmentation Target Model, cleaned_spec ordering, or invoice inclusion rules without a prior docs-only design PR that updates this baseline explicitly.
- Consumer generators must not “fix symptoms” by inventing new segmentation or filtering rules; they must follow the segmentation model as the source of truth.
- New models or rule changes must be documented and frozen **before** implementation in code or generators.

## Stable device_type set (v1)
The HPE baseline is stable after PR #62.
The following `device_type` values are considered correct and stable at HPE baseline v1:
Network Adapter, PSU, Power Cord, Software, RAID Controller, NVMe, SSD, HDD, CPU, Memory, Backplane, Battery, Blade Chassis, Cable, Cooling Module, Disk Enclosure, Drive Cage, Fabric Interconnect, Fan, Firewall, GPU, HBA, License, Network Interface Card, Network Switch, PDU, RAM, Rail Kit, Riser Kit, Router, Server, Tape Library, Transceiver, UPS, Configuration, Hardware (Accessory), Unclear.

**Operational classification notes**
- **Configuration** is a service type and is stable at v1.
- **Configuration** and **Factory Integrated** are tracking/constraint markers and must not be treated as deliverable supply items in downstream documents.
- **Riser Kit** is part of the approved type-system at this baseline.
- Classification rules are description-based only.
- No Part Number (PN)-based classification logic is used.

## Verification procedure
Use the baseline verification scripts for a read-only health check and log capture.
CI is green at this baseline with `npm test` passing.

- macOS/Linux/Git-Bash:
  ```bash
  ./scripts/baseline-verify.sh
  ```
- Windows PowerShell:
  ```powershell
  ./scripts/baseline-verify.ps1
  ```

Logs are written to `./logs/baseline/` with timestamped filenames.

## Out of scope / Next phase
- Generator cleanup (packing list / cleaned spec logic) is the next phase and is out of scope for this baseline.

## How to compare later
```bash
git diff hpe-baseline-v1..HEAD
git log --oneline hpe-baseline-v1..HEAD
```
