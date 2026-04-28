# Windows PowerShell launcher for start.mjs.
# Usage: .\start.ps1 [all|backend|frontend|label-tool] [...]

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$Start = Join-Path $Repo 'start.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js 20+ not found. Install from https://nodejs.org/ and add it to PATH."
  exit 1
}

& node $Start @args
exit $LASTEXITCODE
