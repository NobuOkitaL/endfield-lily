# Windows PowerShell launcher — mirrors start.sh behavior.
# Usage (PowerShell):  .\start.ps1
# First run may require:  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Repo

# ---------- pick a working Python command ----------
$PyCmd = $null
foreach ($c in @('py', 'python', 'python3')) {
  try {
    $v = & $c --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $v -match 'Python 3\.(1[1-9]|[2-9][0-9])') {
      $PyCmd = $c
      break
    }
  } catch {}
}
if (-not $PyCmd) {
  Write-Error "Python 3.11+ not found. Install from https://www.python.org/ (check 'Add to PATH' during install)."
  exit 1
}
Write-Host "[start.ps1] Using Python: $PyCmd"

# ---------- backend ----------
Set-Location (Join-Path $Repo 'backend')
$VenvPython = Join-Path $Repo 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $VenvPython)) {
  Write-Host "[start.ps1] Creating backend venv..."
  & $PyCmd -m venv .venv
  & $VenvPython -m pip install --upgrade pip
  & $VenvPython -m pip install -r requirements.txt
}

# Launch uvicorn in a new PowerShell window (easier to inspect logs on Windows than backgrounding inside the same shell)
$BackendProc = Start-Process -FilePath $VenvPython `
  -ArgumentList @('-m','uvicorn','app.main:app','--port','8000','--reload') `
  -WorkingDirectory (Join-Path $Repo 'backend') `
  -PassThru -WindowStyle Minimized
Write-Host "[start.ps1] backend pid=$($BackendProc.Id)"

# ---------- frontend ----------
Set-Location (Join-Path $Repo 'frontend')
if (-not (Test-Path (Join-Path $Repo 'frontend\node_modules'))) {
  Write-Host "[start.ps1] Installing frontend deps (pnpm install)..."
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Error "pnpm not found. Install via: npm install -g pnpm  (or: corepack enable)"
    Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
    exit 1
  }
  pnpm install
}

$FrontendProc = Start-Process -FilePath 'pnpm' `
  -ArgumentList @('dev') `
  -WorkingDirectory (Join-Path $Repo 'frontend') `
  -PassThru -WindowStyle Minimized
Write-Host "[start.ps1] frontend pid=$($FrontendProc.Id)"

Write-Host ""
Write-Host "[start.ps1] Ready:"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  Backend:  http://localhost:8000/docs"
Write-Host ""
Write-Host "Press Ctrl+C to stop (frontend & backend will be killed)."

# ---------- cleanup on Ctrl+C / exit ----------
try {
  Wait-Process -Id $BackendProc.Id, $FrontendProc.Id -ErrorAction Stop
} finally {
  Write-Host "[start.ps1] Stopping services..."
  Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $FrontendProc.Id -Force -ErrorAction SilentlyContinue
}
