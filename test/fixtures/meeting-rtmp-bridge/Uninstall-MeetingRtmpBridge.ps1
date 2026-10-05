#requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

$TaskName = "MonitorIA Meeting RTMP Bridge"
$InstallDir = Join-Path $env:ProgramData "MonitorIA\MeetingRTMP"

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Get-Process mediamtx -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$InstallDir*" } |
    Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
}

Write-Host "Bridge Meeting RTMP removido. O Agent MonitorIA não foi alterado." -ForegroundColor Green
