param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$benchRoot = Split-Path -Parent $PSScriptRoot
$benchUrl = 'http://127.0.0.1:8080/'

function Get-BenchPage {
    try {
        return Invoke-WebRequest -Uri $benchUrl -UseBasicParsing -TimeoutSec 10
    } catch {
        return $null
    }
}

try {
    $benchPage = Get-BenchPage
    if ($null -ne $benchPage -and $benchPage.Content -notmatch 'DSA Research Bench') {
        throw 'Port 8080 is already used by another application. Close that application and try again.'
    }
    if ($null -eq $benchPage) {
        $nodeCommand = (Get-Command node -ErrorAction Stop).Source
        $benchLogs = Join-Path $benchRoot 'node_modules/.cache/dsa-local'
        New-Item -ItemType Directory -Path $benchLogs -Force | Out-Null
        $benchOutLog = Join-Path $benchLogs 'server.log'
        $benchErrorLog = Join-Path $benchLogs 'server-error.log'
        $benchProcess = Start-Process -FilePath $nodeCommand `
            -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '8080', '--strictPort') `
            -WorkingDirectory $benchRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $benchOutLog -RedirectStandardError $benchErrorLog
        Write-Host 'Starting DSA Research Bench...'
        $benchDeadline = (Get-Date).AddSeconds(45)
        do {
            $benchPage = Get-BenchPage
            if ($null -ne $benchPage -and $benchPage.Content -match 'DSA Research Bench') { break }
            if ($benchProcess.HasExited) {
                throw "The app did not start. See $benchErrorLog"
            }
            Start-Sleep -Milliseconds 500
        } while ((Get-Date) -lt $benchDeadline)
        if ($null -eq $benchPage -or $benchPage.Content -notmatch 'DSA Research Bench') {
            throw "The app is taking longer than expected. See $benchErrorLog"
        }
    }
    Write-Host "DSA Research Bench is ready at $benchUrl"
    if (-not $NoBrowser) { Start-Process $benchUrl }
} catch {
    Write-Host "Unable to open DSA Research Bench: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
