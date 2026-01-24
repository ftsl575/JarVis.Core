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

## Stable device_type set (v1)
The following `device_type` values are considered correct and stable at HPE baseline v1:
Network Adapter, PSU, Power Cord, Software, RAID Controller, NVMe, SSD, HDD, CPU, Memory, Backplane, Battery, Blade Chassis, Cable, Cooling Module, Disk Enclosure, Drive Cage, Fabric Interconnect, Fan, Firewall, GPU, HBA, License, Network Interface Card, Network Switch, PDU, RAM, Rail Kit, Router, Server, Tape Library, Transceiver, UPS, Configuration, Unclear.

**Operational classification notes**
- **Configuration** is a service type and is stable at v1.
- **Configuration** and **Factory Integrated** are tracking/constraint markers and must not be treated as deliverable supply items in downstream documents.

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
