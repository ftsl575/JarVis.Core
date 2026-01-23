$ErrorActionPreference = "Stop"

$logDir = "./logs/baseline"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $logDir "baseline-verify-$timestamp.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

"=== JarVis.Core baseline verification ===" | Tee-Object -FilePath $logFile -Append

"`n== Versions ==" | Tee-Object -FilePath $logFile -Append
"Node: $(node --version)" | Tee-Object -FilePath $logFile -Append
"npm: $(npm --version)" | Tee-Object -FilePath $logFile -Append

"`n== Git ==" | Tee-Object -FilePath $logFile -Append
"Commit: $(git rev-parse HEAD)" | Tee-Object -FilePath $logFile -Append
"Branch: $(git rev-parse --abbrev-ref HEAD)" | Tee-Object -FilePath $logFile -Append

function Invoke-Logged {
  param(
    [string]$Label,
    [string[]]$Command
  )

  "`n== $Label ==" | Tee-Object -FilePath $logFile -Append
  $output = & $Command 2>&1
  $output | Tee-Object -FilePath $logFile -Append
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $($Command -join ' ')"
  }
}

Invoke-Logged -Label "npm ci (lockfile sync)" -Command @("npm", "ci", "--no-audit", "--no-fund")
Invoke-Logged -Label "npm run lint" -Command @("npm", "run", "lint")
Invoke-Logged -Label "npm test" -Command @("npm", "test")

"`nBaseline verification complete. Log: $logFile" | Tee-Object -FilePath $logFile -Append
