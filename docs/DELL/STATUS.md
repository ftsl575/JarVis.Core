# Dell status

## Closed / Verified
- CLI diagnostics (`scripts/diagnostics/dell-segments.js`) generates `segment_id` values in the format `dell_<basename>_sNNN` (basename examples: `dl1`, `dl2`).
- Unit tests covering `segment_id` format, uniqueness, and stability are PASS.

## References
- PR #96
- PR #97

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
