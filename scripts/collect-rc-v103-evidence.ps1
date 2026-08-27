param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("247", "store")]
  [string]$Edition,

  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = Join-Path (Get-Location) "monitoria-rc-evidence-$Edition-$stamp"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

if ($Edition -eq "247") {
  $appDir = Join-Path $env:ProgramFiles "MonitorIA"
  $dataDir = Join-Path $env:ProgramData "MonitorIA"
  $expectedFiles = @(
    "monitoria-agent.exe",
    "monitoria-dpapi.exe",
    "monitoria-service.exe",
    "monitoria-tray.exe"
  )
} else {
  $appDir = Join-Path $env:LOCALAPPDATA "Programs\MonitorIA"
  $dataDir = Join-Path $env:LOCALAPPDATA "MonitorIA"
  $expectedFiles = @(
    "monitoria-agent.exe",
    "monitoria-dpapi.exe",
    "monitoria-desktop.exe"
  )
}

function Get-SafeSignatureInfo([string]$Path) {
  if (-not (Test-Path $Path)) {
    return [ordered]@{
      exists = $false
      path = $Path
    }
  }

  $item = Get-Item $Path
  $hash = Get-FileHash $Path -Algorithm SHA256
  $sig = Get-AuthenticodeSignature $Path

  return [ordered]@{
    exists = $true
    path = $Path
    sizeBytes = $item.Length
    sha256 = $hash.Hash.ToLower()
    signatureStatus = [string]$sig.Status
    signerSubject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
    signerThumbprint = if ($sig.SignerCertificate) { $sig.SignerCertificate.Thumbprint } else { $null }
    timestampSubject = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject } else { $null }
  }
}

$files = @()
foreach ($name in $expectedFiles) {
  $files += Get-SafeSignatureInfo (Join-Path $appDir $name)
}

$processNames = @("monitoria-agent", "monitoria-tray", "monitoria-desktop")
$processes = @()
foreach ($name in $processNames) {
  $found = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
  foreach ($process in $found) {
    $processes += [ordered]@{
      name = $process.ProcessName
      id = $process.Id
      startTime = try { $process.StartTime.ToUniversalTime().ToString("o") } catch { $null }
      path = try { $process.Path } catch { $null }
    }
  }
}

$serviceInfo = $null
if ($Edition -eq "247") {
  $service = Get-Service -Name "MonitorIAAgent" -ErrorAction SilentlyContinue
  if ($service) {
    $serviceInfo = [ordered]@{
      exists = $true
      status = [string]$service.Status
      startType = [string]$service.StartType
    }
  } else {
    $serviceInfo = [ordered]@{ exists = $false }
  }
}

$startup = [ordered]@{}
if ($Edition -eq "247") {
  $path = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
  $value = (Get-ItemProperty -Path $path -Name "MonitorIATray" -ErrorAction SilentlyContinue).MonitorIATray
  $startup.scope = "HKLM"
  $startup.name = "MonitorIATray"
  $startup.valuePresent = -not [string]::IsNullOrWhiteSpace([string]$value)
} else {
  $path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  $value = (Get-ItemProperty -Path $path -Name "MonitorIA" -ErrorAction SilentlyContinue).MonitorIA
  $startup.scope = "HKCU"
  $startup.name = "MonitorIA"
  $startup.valuePresent = -not [string]::IsNullOrWhiteSpace([string]$value)
}

$os = Get-CimInstance Win32_OperatingSystem
$result = [ordered]@{
  schema = "monitoria-rc-evidence-v1"
  capturedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  edition = $Edition
  computerName = $env:COMPUTERNAME
  userName = $env:USERNAME
  osCaption = $os.Caption
  osVersion = $os.Version
  lastBootUpTimeUtc = $os.LastBootUpTime.ToUniversalTime().ToString("o")
  appDir = $appDir
  appDirExists = Test-Path $appDir
  dataDir = $dataDir
  dataDirExists = Test-Path $dataDir
  files = $files
  processes = $processes
  service = $serviceInfo
  startup = $startup
}

$jsonPath = Join-Path $OutputDir "evidence.json"
$result | ConvertTo-Json -Depth 8 | Out-File -Encoding utf8 $jsonPath

$summaryPath = Join-Path $OutputDir "SUMMARY.txt"
@(
  "MonitorIA 1.0.3 RC evidence",
  "Edition: $Edition",
  "Captured UTC: $($result.capturedAtUtc)",
  "App dir exists: $($result.appDirExists)",
  "Data dir exists: $($result.dataDirExists)",
  "Files checked: $($files.Count)",
  "Processes found: $($processes.Count)",
  "Service: $(if ($serviceInfo) { $serviceInfo | ConvertTo-Json -Compress } else { 'n/a' })",
  "Startup entry present: $($startup.valuePresent)",
  "",
  "Este coletor não altera serviço, registro, arquivos instalados ou pareamento."
) | Out-File -Encoding utf8 $summaryPath

Write-Host "Evidência salva em: $OutputDir"
Write-Host "JSON: $jsonPath"
Write-Host "Resumo: $summaryPath"
