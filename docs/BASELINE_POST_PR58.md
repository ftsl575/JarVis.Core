# JarVis.Core baseline snapshot (post PR #58)

> **Scope:** Documentation-only snapshot of the current JarVis.Core behavior **after PR #58**. This document freezes the existing pipeline, inputs/outputs, diagnostics behavior, and Windows-specific expectations as implemented today.

## 1) High-level architecture (frozen behavior)

### Pipeline overview
1. **Adapters parse vendor inputs.** Only the **HPE adapter** is implemented.
2. **Canonicalization produces JSONL + summary outputs** in `out/`:
   - `out/canonical.jsonl`
   - `out/items.jsonl` (**source of truth** for downstream docs)
   - `out/summary.json`
3. **Document generators read only from `out/*`.** For invoices, the generator consumes `out/items.jsonl` when present.
4. **Diagnostics are observational only.** They copy artifacts and log metadata **without changing** classification or production outputs.

### Canonical outputs (authoritative)
- `out/items.jsonl` is the **single source of truth** for downstream document generation.
- Diagnostics must **not** mutate any pipeline outputs.

## 2) Inputs

### Batch diagnostics input directory (HPE)
- **Primary input root:** `C:\Users\G\Desktop\JarVis\JarVis.Core\diag\_batch_inputs`
- **All** `.xlsx` files in this directory are processed during batch diagnostics.
- `samples/` may exist for demos/tests, but batch diagnostics **ignore existing samples** and instead stage each batch input into `samples/hpe/input.xlsx` for the `canon:hpe` run. Pre-existing samples are not used as inputs.

## 3) Core commands (current behavior)

### `npm run canon:hpe`
- Reads HPE specs (all `.xlsx` files in the input folder).
- Writes:
  - `out/canonical.jsonl`
  - `out/items.jsonl`
  - `out/summary.json`

### `npm run docs:hpe:invoice`
- Reads `out/items.jsonl` (if present) to build invoice items.
- Generates `out/hpe_invoice.xlsx` (default).
- **Factory Integrated** lines are **excluded by design** from the invoice.

### `npm run diag:hpe:batch`
- Processes **all** `.xlsx` files inside `diag/_batch_inputs`.
- Creates **exactly one** run folder per input:
  - `diag/run_<timestamp>__<input-name-sanitized>/`
- Ensures **no** `run_*__cleaned` folders remain after completion.

## 4) Batch diagnostics run folder structure

For each input `X.xlsx`, the run folder follows this structure:

```
diag/run_<ts>__X/
  input.xlsx              (exact copy)
  input_path.txt          (UTF-8, absolute path)
  run_meta.json           (diagnostics metadata)
  out/
    canonical.jsonl
    items.jsonl
    summary.json
    hpe_invoice.xlsx
  hpe_invoice.xlsx        (convenience copy)
  derived/
    cleaned.xlsx          (if produced)
    cleaned_meta.json     (if produced)
```

**Invariants**
- **Number of `run_*` folders == number of input files.**
- `input.xlsx` hashes differ when inputs differ.
- `input_path.txt` points to the **absolute path** of the input under `diag/_batch_inputs`.
- **No** `run_*__cleaned` folders remain after batch completion.

## 5) Windows-specific behavior

- Diagnostics invoke nested npm commands via:
  - `cmd.exe /c npm.cmd ...`
- This is **required** for Windows reliability and explicitly validated by tests.
- When diagnostics run in `%TEMP%`, messages like:
  - `fatal: not a git repository`
  may appear because `git rev-parse` runs outside a repo. These are **non-fatal** (git SHA is recorded as `unknown`).

## 6) Diagnostics principles (strict)

Diagnostics are **observational only**:
- They **may** copy artifacts and log metadata.
- They **must not**:
  - change classification
  - change generators
  - change pipeline outputs

`out/items.jsonl` remains the **single source of truth**.

## 7) Environment variables / options

### Environment variables
- `JARVIS_SKIP_DIAGNOSTICS`
  - **Diagnostic-only:** when set, skips diagnostics snapshot creation.
  - Used by `docs:hpe:invoice` and explicitly set during `diag:hpe:batch`.
- `JARVIS_TEMPLATE_INVOICE`
  - Optional override for the invoice template path.

### Command-line options (docs-only behavior)
- `docs:hpe:invoice`
  - `--spec <cleaned.xlsx>`: cleaned spec input (used if no `items.jsonl` exists).
  - `--out <out.xlsx>`: invoice output path (default `out/hpe_invoice.xlsx`).
  - `--template <template.xlsx>`: template override (or use `JARVIS_TEMPLATE_INVOICE`).
  - `--device-dict <device_dict.xlsx>`: device type dictionary input.

## 8) Test coverage status

- **`npm test` is green on Windows** as the baseline expectation.
- Tests cover:
  - batch input discovery
  - Windows npm invocation (`cmd.exe /c npm.cmd`)
  - UTF-8 path handling for `input_path.txt`
  - diagnostics snapshot integrity (run folder contents and invariants)
  - invoice generation invariants

## 9) Known limitations (explicit TODO)

- **Only HPE adapter is implemented.**
- **No packing list generator** exists yet.
- Diagnostics history accumulation is **basic** (append-only `history.jsonl`).
- **No parallel batch execution.**
- **No CLI flags** for batch selection/filtering.

## 10) Roadmap / Next steps (non-binding)

- Packing list generator.
- Rules quality A-class improvements.
- Diagnostics history viewer.
- Multi-vendor adapters.
- Formal CLI interface (flags for batch selection and output paths).
