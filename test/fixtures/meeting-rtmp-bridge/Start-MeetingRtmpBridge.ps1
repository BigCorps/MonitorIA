$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:ProgramData "MonitorIA\MeetingRTMP"
$Exe = Join-Path $InstallDir "mediamtx.exe"
$Config = Join-Path $InstallDir "mediamtx.yml"
$SecretFile = Join-Path $InstallDir "source.dpapi"

if (-not (Test-Path $Exe)) {
    throw "MediaMTX não encontrado em $Exe"
}
if (-not (Test-Path $Config)) {
    throw "Configuração não encontrada em $Config"
}
if (-not (Test-Path $SecretFile)) {
    throw "Fonte RTMP protegida não encontrada em $SecretFile"
}

$encrypted = [Convert]::FromBase64String(
    [IO.File]::ReadAllText($SecretFile).Trim()
)
$plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    $encrypted,
    $null,
    [Security.Cryptography.DataProtectionScope]::LocalMachine
)
$source = [Text.Encoding]::UTF8.GetString($plainBytes)

if ($source -notmatch '^rtmps?://') {
    throw "Fonte protegida inválida: apenas rtmp:// ou rtmps://"
}

# A URL não é gravada em YAML nem passada na linha de comando.
$env:MTX_PATHS_MEETING_SOURCE = $source

Set-Location $InstallDir
try {
    & $Exe $Config
    exit $LASTEXITCODE
}
finally {
    Remove-Item Env:\MTX_PATHS_MEETING_SOURCE -ErrorAction SilentlyContinue
    $source = $null
    $plainBytes = $null
}
