# scripts/start_services.ps1
# Automates the startup of Bellary Motors Day Sheet, PID tracking, and browser launch

$ErrorActionPreference = "SilentlyContinue"
$appDir = Resolve-Path "$PSScriptRoot\.."
$dataDir = "$appDir\data"
$pidFile = "$dataDir\bellary_motors.pid"

if (!(Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

function Check-Port($port) {
    try {
        $socket = New-Object System.Net.Sockets.TcpClient
        $async = $socket.BeginConnect("127.0.0.1", $port, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne(800, $false)
        if ($ok -and $socket.Connected) {
            $socket.EndConnect($async)
            $socket.Close()
            return $true
        }
        $socket.Close()
        return $false
    } catch {
        return $false
    }
}

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " Bellary Motors Day Sheet - Local Startup" -ForegroundColor White
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Check if application is already running on port 5173
if (Check-Port 5173) {
    Write-Host "[INFO] Bellary Motors Day Sheet is ALREADY running!" -ForegroundColor Yellow
    Write-Host "[INFO] Opening in your default browser: http://localhost:5173" -ForegroundColor Green
    Start-Process "http://localhost:5173"
    Start-Sleep -Seconds 1
    exit 0
}

# 2. Check Node.js
try {
    $nodeVer = & node -v
    Write-Host "[OK] Detected Node.js: $nodeVer" -ForegroundColor Gray
} catch {
    Write-Host "[ERROR] Node.js is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js (v18+) from https://nodejs.org" -ForegroundColor Yellow
    pause
    exit 1
}

# 3. Start npm run dev in background window
Write-Host "[INFO] Launching Backend & Frontend services..." -ForegroundColor Cyan

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "cmd.exe"
$startInfo.Arguments = "/c title Bellary Motors Day Sheet Engine && npm run dev"
$startInfo.WorkingDirectory = $appDir
$startInfo.UseShellExecute = $true
$startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized

$process = [System.Diagnostics.Process]::Start($startInfo)
$parentPid = $process.Id
Set-Content -Path $pidFile -Value "$parentPid"

Write-Host "[INFO] Waiting for server and client to initialize..." -ForegroundColor Cyan

# 4. Poll until port 5173 is responsive (timeout: 45 seconds)
$ready = $false
$maxAttempts = 45
for ($i = 1; $i -le $maxAttempts; $i++) {
    Start-Sleep -Seconds 1
    if (Check-Port 5173) {
        $ready = $true
        break
    }
    Write-Host -NoNewline "."
}
Write-Host ""

if ($ready) {
    # Store active PIDs for targeted clean shutdown
    $activePids = @($parentPid)
    $conns = Get-NetTCPConnection -LocalPort 5000, 5173 -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($c in $conns) {
            if ($c.OwningProcess -and $activePids -notcontains $c.OwningProcess) {
                $activePids += $c.OwningProcess
            }
        }
    }
    Set-Content -Path $pidFile -Value ($activePids -join "`n")

    Write-Host "=======================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Bellary Motors Day Sheet is running!" -ForegroundColor White
    Write-Host " Frontend: http://localhost:5173" -ForegroundColor Green
    Write-Host " Backend:  http://localhost:5000" -ForegroundColor Green
    Write-Host " Database: $dataDir\daysheet.db" -ForegroundColor Gray
    Write-Host "=======================================================" -ForegroundColor Green

    # Automatically open default browser
    Start-Process "http://localhost:5173"
} else {
    Write-Host "=======================================================" -ForegroundColor Red
    Write-Host " [WARNING] The services took longer than 45 seconds to start." -ForegroundColor Yellow
    Write-Host " Check the minimized 'Bellary Motors Day Sheet Engine' window for details." -ForegroundColor Yellow
    Write-Host "=======================================================" -ForegroundColor Red
}
