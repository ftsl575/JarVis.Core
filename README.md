# JarVis.Core

JarVis.Core is a spec-processing backbone that normalizes incoming document adapters into a canonical stream, feeds core processing, and emits structured outputs.

## Layers

1. **Adapters**: Source-specific ingest (files/APIs) that emit canonical lines.
2. **Canonical**: Contract for normalized lines (raw text + coordinates + optional parsed fields).
3. **Core**: Processing pipeline over canonical data (no business logic yet).
4. **Outputs**: Exporters for downstream consumers.

## Placeholder commands

```bash
npm run handoff
npm run lint
npm run test
npm run canon:hpe
npm run diag:hpe:segments
```

The `canon:hpe` command expects a folder of `.xlsx` files and writes exports to `out/`:

- `out/canonical.jsonl`
- `out/items.jsonl`
- `out/summary.json`

## HPE segmentation diagnostics (post-items)

Run the diagnostic segmenter on the current `out/items.jsonl`:

```bash
npm run diag:hpe:segments -- --mode permissive
```

Output:

- `out/segments.json`

## HPE invoice generation

Prerequisites:

- `npm ci`

Cleaned spec input format (headers must match exactly, in order):

- `#`
- `Part Number`
- `Description`
- `Device Type`
- `Тип устройства (RU)`
- `Qty Components`
- `Qty Servers`

Notes:

- `Qty Components` is used as the line quantity.
- `Qty Servers` is ignored by the parser.

Run the command:

```bash
npm run docs:hpe:invoice
```

Output:

- `out/hpe_invoice.xlsx`

Troubleshooting:

- If the file is not generated, run `npm test` first and confirm the cleaned spec headers match exactly.
- The invoice template is local-only and is not committed to git (binary `.xlsx` files are intentionally excluded).
- Place the template at `assets/templates/Шаблон инвойса.xlsx` for the default run.
- Override the template path (flag > env > default):
  - `node scripts/docs-hpe-invoice.js --template "C:\path\Шаблон инвойса.xlsx"`
  - `setx JARVIS_TEMPLATE_INVOICE "C:\path\Шаблон инвойса.xlsx"`

## HPE cleaned spec batch generation

Run the command:

```bash
npm run docs:hpe:clean
```

Behavior:

- Inputs are read from `samples/hpe/` (non-recursive).
- Outputs are written to `out/hpe_cleaned/` as `NAME_cleaned.xlsx`.
- Excludes:
  - files ending with `_cleaned.xlsx`
  - files ending with `_invoice.xlsx`
  - temporary Excel files like `~$*.xlsx`

## Repo hygiene / folder policy

- `samples/hpe/`: raw vendor HPE input specs (`.xlsx`) only.
- `samples/hpe_docs/`: reference outputs, examples, or docs (`.xlsx/.pdf/.png`).
- `out/` and `logs/` are runtime outputs and are ignored by git.
- Keep `git status` clean by writing generated artifacts to `out/` (or other ignored paths) during normal runs.

## Handoff / Switching Chat Windows

Use the handoff docs to pick up work quickly in a new chat window:

- [docs/HANDOFF.md](docs/HANDOFF.md)
- [docs/STATUS.md](docs/STATUS.md)
- Status freeze snapshots live in [docs/status/](docs/status/).

Run `npm run handoff` to print the current handoff notes.
