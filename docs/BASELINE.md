# Baseline Snapshot (Pre-change Freeze)

## Baseline identifier
- **Suggested tag:** `baseline-2026-01-23`
- **Purpose:** baseline before equipment type detection work.

### Tag after merge
```bash
git tag -a baseline-2026-01-23 <merge_commit_sha> -m "JarVis.Core baseline before equipment type detection work"
git push origin baseline-2026-01-23
```

## Baseline metadata (fill after merge)
- **Merge commit SHA:** `<merge_commit_sha>`
- **PR URL:** `<pr_url>`
- **Date:** `<yyyy-mm-dd>`
- **Branch:** `<branch_name>`
- **Notes:** `<short_notes>`

## What is frozen
**Included**
- Repository source code, scripts, and documentation at the merge commit.
- Tooling expectations captured by verification scripts.

**Excluded**
- Local environment state (OS, shell, user-specific settings).
- Generated outputs and logs (including `logs/baseline/`).
- Dependency install artifacts (e.g., `node_modules/`).

## Verification procedure
Use the baseline verification scripts for a read-only health check and log capture.

- macOS/Linux/Git-Bash:
  ```bash
  ./scripts/baseline-verify.sh
  ```
- Windows PowerShell:
  ```powershell
  ./scripts/baseline-verify.ps1
  ```

Logs are written to `./logs/baseline/` with timestamped filenames.

## How to compare later
```bash
git diff baseline-2026-01-23..HEAD
git log --oneline baseline-2026-01-23..HEAD
```
