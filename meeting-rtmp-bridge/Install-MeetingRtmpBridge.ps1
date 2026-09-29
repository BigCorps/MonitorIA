#requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Version = "1.21.1"
$ArchiveName = "mediamtx_v${Version}_windows_amd64.zip"
$ReleaseBase = "https://github.com/bluenviron/mediamtx/releases/download/v${Version}"
$ArchiveUrl = "$ReleaseBase/$ArchiveName"
$ChecksumUrl = "$ReleaseBase/checksums.sha256"

$InstallDir = Join-Path $env:ProgramData "MonitorIA\MeetingRTMP"
$TaskName = "MonitorIA Meeting RTMP Bridge"
$PackageDir = Split-Path -Parent $MyInvocation.MyCommand.Path

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

function Protect-MachineString {
    param([string]$Value)
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    $protected = [Security.Cryptography.ProtectedData]::Protect(
        $bytes,
        $null,
        [Security.Cryptography.DataProtectionScope]::LocalMachine
    )
    return [Convert]::ToBase64String($protected)
}

Write-Host ""
Write-Host "MonitorIA / Meeting RTMP Bridge" -ForegroundColor Cyan
Write-Host "A URL precisa ser de REPRODUÇÃO RTMP/RTMPS." -ForegroundColor Yellow
Write-Host "Ela não será salva em texto puro." -ForegroundColor DarkGray
Write-Host ""

$secure = Read-Host "URL RTMP/RTMPS" -AsSecureString
$source = ConvertFrom-SecureStringPlain $secure

if ($source -notmatch '^rtmps?://') {
    throw "A URL precisa começar com rtmp:// ou rtmps://"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$tmp = Join-Path $env:TEMP "MonitorIA-MeetingRTMP-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
    $archive = Join-Path $tmp $ArchiveName
    $checksums = Join-Path $tmp "checksums.sha256"

    Write-Host "Baixando MediaMTX v$Version..."
    Invoke-WebRequest -UseBasicParsing -Uri $ArchiveUrl -OutFile $archive
    Invoke-WebRequest -UseBasicParsing -Uri $ChecksumUrl -OutFile $checksums

    $line = Get-Content $checksums |
        Where-Object { $_ -match [regex]::Escape($ArchiveName) } |
        Select-Object -First 1

    if (-not $line) {
        throw "Checksum oficial do arquivo $ArchiveName não encontrado."
    }

    $expected = ($line -split '\s+')[0].Trim().ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 -Path $archive).Hash.ToLowerInvariant()

    if ($expected -ne $actual) {
        throw "SHA-256 do MediaMTX não confere. Instalação interrompida."
    }

    Write-Host "SHA-256 conferido." -ForegroundColor Green

    $extract = Join-Path $tmp "extract"
    Expand-Archive -Path $archive -DestinationPath $extract -Force

    Copy-Item (Join-Path $extract "mediamtx.exe") (Join-Path $InstallDir "mediamtx.exe") -Force
    if (Test-Path (Join-Path $extract "LICENSE")) {
        Copy-Item (Join-Path $extract "LICENSE") (Join-Path $InstallDir "LICENSE-MediaMTX") -Force
    }

    Copy-Item (Join-Path $PackageDir "mediamtx.yml") (Join-Path $InstallDir "mediamtx.yml") -Force
    Copy-Item (Join-Path $PackageDir "Start-MeetingRtmpBridge.ps1") (Join-Path $InstallDir "Start-MeetingRtmpBridge.ps1") -Force

    $protectedSource = Protect-MachineString $source
    [IO.File]::WriteAllText(
        (Join-Path $InstallDir "source.dpapi"),
        $protectedSource,
        [Text.Encoding]::ASCII
    )

    # Restringe a pasta a SYSTEM e Administradores usando SIDs conhecidos.
    $adminSid = New-Object Security.Principal.SecurityIdentifier("S-1-5-32-544")
    $systemSid = New-Object Security.Principal.SecurityIdentifier("S-1-5-18")
    $adminName = $adminSid.Translate([Security.Principal.NTAccount]).Value
    $systemName = $systemSid.Translate([Security.Principal.NTAccount]).Value

    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)

    $inherit = [Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
    $prop = [Security.AccessControl.PropagationFlags]::None
    $allow = [Security.AccessControl.AccessControlType]::Allow

    $acl.AddAccessRule(
        (New-Object Security.AccessControl.FileSystemAccessRule(
            $adminName, "FullControl", $inherit, $prop, $allow
        ))
    )
    $acl.AddAccessRule(
        (New-Object Security.AccessControl.FileSystemAccessRule(
            $systemName, "FullControl", $inherit, $prop, $allow
        ))
    )
    Set-Acl -Path $InstallDir -AclObject $acl

    # Valida o YAML e o override por ambiente sem expor a URL na linha de comando.
    $env:MTX_PATHS_MEETING_SOURCE = $source
    try {
        & (Join-Path $InstallDir "mediamtx.exe") "--validate-conf=$(Join-Path $InstallDir 'mediamtx.yml')"
        if ($LASTEXITCODE -ne 0) {
            throw "MediaMTX recusou a configuração."
        }
    }
    finally {
        Remove-Item Env:\MTX_PATHS_MEETING_SOURCE -ErrorAction SilentlyContinue
    }

    # Tarefa de boot como SYSTEM. Nenhum segredo entra nos argumentos.
    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\Start-MeetingRtmpBridge.ps1`""

    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest

    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -MultipleInstances IgnoreNew

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Force | Out-Null

    Start-ScheduledTask -TaskName $TaskName

    Write-Host ""
    Write-Host "Bridge instalado." -ForegroundColor Green
    Write-Host "RTSP local para o MonitorIA:"
    Write-Host "  rtsp://127.0.0.1:8554/meeting" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Agora rode Test-MeetingRtmpBridge.ps1."
}
finally {
    $source = $null
    if (Test-Path $tmp) {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
