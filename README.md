# JarVis.Core

JarVis.Core is a spec-processing backbone that normalizes incoming document adapters into a canonical stream, feeds core processing, and emits structured outputs.

## Layers

1. **Adapters**: Source-specific ingest (files/APIs) that emit canonical lines.
2. **Canonical**: Contract for normalized lines (raw text + coordinates + optional parsed fields).
3. **Core**: Processing pipeline over canonical data (no business logic yet).
4. **Outputs**: Exporters for downstream consumers.

## Placeholder commands

```bash
npm run lint
npm run test
npm run canon:hpe
```

The `canon:hpe` command expects a folder of `.xlsx` files and writes placeholder output to `out/`.
