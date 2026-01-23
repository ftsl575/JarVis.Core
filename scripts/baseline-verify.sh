#!/usr/bin/env bash
set -euo pipefail

log_dir="./logs/baseline"
timestamp="$(date +"%Y%m%d-%H%M%S")"
log_file="${log_dir}/baseline-verify-${timestamp}.log"

mkdir -p "${log_dir}"

echo "=== JarVis.Core baseline verification ===" | tee -a "${log_file}"

echo "\n== Versions ==" | tee -a "${log_file}"
{
  echo "Node: $(node --version)"
  echo "npm: $(npm --version)"
} | tee -a "${log_file}"

echo "\n== Git ==" | tee -a "${log_file}"
{
  echo "Commit: $(git rev-parse HEAD)"
  echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
} | tee -a "${log_file}"

run_cmd() {
  local label="$1"
  shift
  echo "\n== ${label} ==" | tee -a "${log_file}"
  "$@" 2>&1 | tee -a "${log_file}"
}

run_cmd "npm ci (lockfile sync)" npm ci --no-audit --no-fund
run_cmd "npm run lint" npm run lint
run_cmd "npm test" npm test

echo "\nBaseline verification complete. Log: ${log_file}" | tee -a "${log_file}"
