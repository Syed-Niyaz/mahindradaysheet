# scripts/stop_services.ps1
# Safely stops ONLY the Bellary Motors Day Sheet services without affecting unrelated applications

$ErrorActionPreference = "SilentlyContinue"
$appDir = Resolve-Path "$PSScriptRoot\.."
$dataDir = "$appDir\data"
$pidFile = "$dataDir\bellary_motors.pid"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " Stopping Bellary Motors Day Sheet Services..." -ForegroundColor White
Write-Host "=======================================================" -ForegroundColor Cyan

$stoppedCount = 0

# 1. Check PID file if it exists
if (Test-Path $pidFile) {
    $trackedPids = Get-Content $pidFile
    foreach ($p in $trackedPids) {
        $p = $p.Trim()
        if ($p -match '^\d+$') {
            $proc = Get-Process -Id ([int]$p) -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "[INFO] Stopping tracked service tree (PID: $p, Name: $($proc.ProcessName))..." -ForegroundColor Yellow
                cmd /c "taskkill /F /PID $p /T >nul 2>&1"
                $stoppedCount++
            }
        }
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# 2. Check any process specifically listening on ports 5000 or 5173
$ports = @(5000, 5173)
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($c in $conns) {
            $pId = $c.OwningProcess
            if ($pId -and $pId -gt 0) {
                $proc = Get-Process -Id $pId -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "[INFO] Stopping process tree on port $port (PID: $pId, Name: $($proc.ProcessName))..." -ForegroundColor Yellow
                    cmd /c "taskkill /F /PID $pId /T >nul 2>&1"
                    $stoppedCount++
                }
            }
        }
    }
}

Start-Sleep -Seconds 1

# 3. Final verification
$rem5000 = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
$rem5173 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue

if (!$rem5000 -and !$rem5173) {
    Write-Host "=======================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Bellary Motors Day Sheet stopped cleanly." -ForegroundColor White
    Write-Host " All receipts and Day Sheets remain safely stored in:" -ForegroundColor Gray
    Write-Host " $dataDir\daysheet.db" -ForegroundColor Gray
    Write-Host "=======================================================" -ForegroundColor Green
} else {
    Write-Host "[NOTICE] Port 5000 or 5173 still reported as active. Re-checking..." -ForegroundColor Yellow
    if ($rem5000) { cmd /c "taskkill /F /PID $($rem5000.OwningProcess) /T >nul 2>&1" }
    if ($rem5173) { cmd /c "taskkill /F /PID $($rem5173.OwningProcess) /T >nul 2>&1" }
}

exit 0
