#requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:ProgramData "MonitorIA\MeetingRTMP"
$TaskName = "MonitorIA Meeting RTMP Bridge"
$SecretFile = Join-Path $InstallDir "source.dpapi"

function ConvertFrom-SecureStringPlain {
    param([Security.SecureString]$Secure)
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

$secure = Read-Host "Nova URL de reprodução RTMP/RTMPS" -AsSecureString
$source = ConvertFrom-SecureStringPlain $secure

if ($source -notmatch '^rtmps?://') {
    throw "A URL precisa começar com rtmp:// ou rtmps://"
}

$bytes = [Text.Encoding]::UTF8.GetBytes($source)
$protected = [Security.Cryptography.ProtectedData]::Protect(
    $bytes,
    $null,
    [Security.Cryptography.DataProtectionScope]::LocalMachine
)
[IO.File]::WriteAllText(
    $SecretFile,
    [Convert]::ToBase64String($protected),
    [Text.Encoding]::ASCII
)

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName $TaskName

$source = $null
Write-Host "Origem atualizada e bridge reiniciado." -ForegroundColor Green
