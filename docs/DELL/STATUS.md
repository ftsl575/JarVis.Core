# Dell status
ACTIVE (Dell)

## Closed / Verified
- Dell Stage 1 — CLOSED (canonical + items baseline stable).
- Dell Stage 2 — CLOSED (deterministic segmentation with stable segment_id).
- Dell Stage 3 — CLOSED (per-segment materialization verified).
- CLI diagnostics (`scripts/diagnostics/dell-segments.js`) generates `segment_id` values in the format `dell_<basename>_sNNN` (basename examples: `dl1`, `dl2`).
- Unit tests covering `segment_id` format, uniqueness, and stability are PASS.
- Unit tests: 59/59 PASS.
- PR #99 — Dell Stage 3 materialization.
- PR #100 — Dell Stage 3 wiring fix.

## References
- PR #96
- PR #97
- [Dell cleaned spec semantic model v2 (documentation)](CLEANED_SPEC_SEMANTIC_MODEL_v2.md)

## How to verify locally (PowerShell; absolute paths)
```powershell
Set-Location -Path "C:\Users\G\Desktop\JarVis\JarVis.Core"

git fetch --all --prune
git checkout main
git pull --ff-only

npm ci
npm test

npm run diag:dell:segments
```

Notes:
- `diag:dell:segments` should read `dl2.xlsx` (and/or `dl1.xlsx`) from `C:\Users\G\Desktop\JarVis\JarVis.Core\diag\_batch_inputs` according to existing repo behavior.
- In produced segments output, `segment_id` values should start with `dell_dl2_s…` and/or `dell_dl1_s…`.
