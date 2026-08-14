<#
.SYNOPSIS
    Valida o MonitorIA-Store-Setup.exe contra os requisitos da Microsoft Store.

.DESCRIPTION
    Executa, em ordem, as verificações que a certificação da Microsoft aplica
    ao caminho MSI/EXE (Win32):

      1. assinatura Authenticode válida, com carimbo de tempo;
      2. editor da assinatura igual ao publisher do Partner Center;
      3. certificado com validade folgada;
      4. instalação silenciosa com exit code 0 e sem nenhuma janela;
      5. serviço MonitorIAAgent registrado e em execução;
      6. todos os PE instalados assinados;
      7. desinstalação silenciosa e limpa.

    Rode em uma VM Windows 10/11 x64 LIMPA, com snapshot tirado antes. Os
    passos 4 a 7 instalam e desinstalam software de verdade na máquina.

.PARAMETER Instalador
    Caminho do MonitorIA-Store-Setup.exe baixado da release.

.PARAMETER Editor
    Razão social esperada dentro do certificado. Padrão: BIGCORPS TECNOLOGIA LTA.

.PARAMETER SomenteAssinatura
    Só executa as verificações 1 a 3. Não instala nada. Use na sua máquina de
    trabalho antes de levar o arquivo para a VM.

.EXAMPLE
    .\validar-instalador-store.ps1 -Instalador .\MonitorIA-Store-Setup.exe -SomenteAssinatura

.EXAMPLE
    .\validar-instalador-store.ps1 -Instalador .\MonitorIA-Store-Setup.exe
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Instalador,

    [string]$Editor = "BIGCORPS TECNOLOGIA LTA",

    [switch]$SomenteAssinatura
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:Falhas = @()
$script:Avisos = @()

function Etapa([string]$Texto) {
    Write-Host ""
    Write-Host "=== $Texto ===" -ForegroundColor Cyan
}

function Ok([string]$Texto) {
    Write-Host "  [OK]    $Texto" -ForegroundColor Green
}

function Falha([string]$Texto) {
    Write-Host "  [FALHA] $Texto" -ForegroundColor Red
    $script:Falhas += $Texto
}

function Aviso([string]$Texto) {
    Write-Host "  [AVISO] $Texto" -ForegroundColor Yellow
    $script:Avisos += $Texto
}

# ---------------------------------------------------------------------------
# 1 a 3 — assinatura
# ---------------------------------------------------------------------------

Etapa "Arquivo"

if (-not (Test-Path $Instalador)) {
    throw "Instalador nao encontrado: $Instalador"
}

$arquivo = Get-Item $Instalador
$mb = [math]::Round($arquivo.Length / 1MB, 1)
$hash = (Get-FileHash $arquivo.FullName -Algorithm SHA256).Hash.ToLower()

Write-Host "  Nome   : $($arquivo.Name)"
Write-Host "  Tamanho: $mb MB"
Write-Host "  SHA256 : $hash"
Write-Host ""
Write-Host "  Guarde esse SHA256. Depois de publicar a URL, baixe o arquivo" -ForegroundColor DarkGray
Write-Host "  de fora da sua rede e confirme que o hash e identico." -ForegroundColor DarkGray

if ($arquivo.Name -ne "MonitorIA-Store-Setup.exe") {
    Aviso "O nome esperado e MonitorIA-Store-Setup.exe. O build retail (MonitorIA-Setup.exe) NAO serve para a Store."
}

Etapa "Assinatura Authenticode"

$assinatura = Get-AuthenticodeSignature $arquivo.FullName

if ($assinatura.Status -eq 'Valid') {
    Ok "Status: Valid"
} else {
    Falha "Status: $($assinatura.Status)"
}

if ($assinatura.TimeStamperCertificate) {
    Ok "Carimbo de tempo presente ($($assinatura.TimeStamperCertificate.Subject))"
} else {
    Falha "Assinatura sem carimbo de tempo. Ela morre quando o certificado expirar."
}

if ($assinatura.SignerCertificate) {
    $subject = $assinatura.SignerCertificate.Subject
    Write-Host "  Subject: $subject"

    if ($subject -match [regex]::Escape($Editor)) {
        Ok "Editor confere com '$Editor'"
    } else {
        Falha "Editor da assinatura nao contem '$Editor'. O Partner Center vai recusar."
    }

    $expira = $assinatura.SignerCertificate.NotAfter
    $dias = [int]($expira - (Get-Date)).TotalDays
    if ($dias -lt 30) {
        Falha "Certificado expira em $dias dia(s) ($($expira.ToString('yyyy-MM-dd')))."
    } elseif ($dias -lt 90) {
        Aviso "Certificado expira em $dias dia(s). Renove antes da proxima submissao."
    } else {
        Ok "Certificado valido por mais $dias dia(s)"
    }

    Etapa "Cadeia de certificacao"
    $cadeia = New-Object System.Security.Cryptography.X509Certificates.X509Chain
    $cadeia.ChainPolicy.RevocationMode = 'Online'
    if ($cadeia.Build($assinatura.SignerCertificate)) {
        Ok "Cadeia valida ate a raiz"
        foreach ($elo in $cadeia.ChainElements) {
            Write-Host "    - $($elo.Certificate.Subject)"
        }
    } else {
        Falha "Cadeia de certificacao invalida. A raiz precisa estar no Microsoft Trusted Root Program."
        foreach ($st in $cadeia.ChainStatus) {
            Write-Host "    - $($st.Status): $($st.StatusInformation)"
        }
    }
} else {
    Falha "Arquivo sem assinatura."
}

if ($SomenteAssinatura) {
    Etapa "Resultado parcial"
    if ($script:Falhas.Count -eq 0) {
        Write-Host "  Assinatura aprovada. Leve o arquivo para a VM e rode sem -SomenteAssinatura." -ForegroundColor Green
        exit 0
    }
    Write-Host "  $($script:Falhas.Count) falha(s). Nao prossiga." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 4 a 7 — instalacao real
# ---------------------------------------------------------------------------

Etapa "Ambiente"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Rode este script como Administrador."
}

if (Get-Service MonitorIAAgent -ErrorAction SilentlyContinue) {
    throw "O servico MonitorIAAgent ja existe. Use uma VM limpa ou restaure o snapshot."
}

if (Test-Path "C:\Program Files\MonitorIA") {
    throw "C:\Program Files\MonitorIA ja existe. Use uma VM limpa ou restaure o snapshot."
}

Ok "Maquina limpa"

Etapa "Instalacao silenciosa"

# Estes sao exatamente os parametros informados ao Partner Center.
$parametros = "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-"
Write-Host "  Parametros: $parametros"

$janelasAntes = (Get-Process | Where-Object { $_.MainWindowTitle }).Count
$inicio = Get-Date

$processo = Start-Process $arquivo.FullName -ArgumentList $parametros -Wait -PassThru
$duracao = [int]((Get-Date) - $inicio).TotalSeconds

Write-Host "  Duracao : $duracao s"
Write-Host "  ExitCode: $($processo.ExitCode)"

if ($processo.ExitCode -eq 0) {
    Ok "Exit code 0"
} else {
    Falha "Exit code $($processo.ExitCode). A Store espera 0."
}

$janelasDepois = (Get-Process | Where-Object { $_.MainWindowTitle }).Count
if ($janelasDepois -gt $janelasAntes) {
    Aviso "Surgiram janelas durante a instalacao. Confirme visualmente que nenhuma era do instalador."
} else {
    Ok "Nenhuma janela nova detectada"
}

Etapa "Servico MonitorIAAgent"

$servico = Get-Service MonitorIAAgent -ErrorAction SilentlyContinue
if (-not $servico) {
    Falha "Servico MonitorIAAgent nao foi registrado."
} else {
    Ok "Servico registrado"

    # O instalador tenta iniciar o servico ate 6 vezes, com 5 s entre elas.
    # Antivirus na VM pode segurar o binario recem-gravado; damos a mesma folga.
    for ($i = 1; $i -le 12; $i++) {
        $servico.Refresh()
        if ($servico.Status -eq 'Running') { break }
        Start-Sleep -Seconds 5
    }

    if ($servico.Status -eq 'Running') {
        Ok "Servico em execucao"
    } else {
        Falha "Servico em estado '$($servico.Status)' apos 60 s."
    }

    $wmi = Get-CimInstance Win32_Service -Filter "Name='MonitorIAAgent'"
    Write-Host "  StartMode: $($wmi.StartMode)"
    if ($wmi.StartMode -ne 'Auto') {
        Aviso "StartMode e '$($wmi.StartMode)'. O esperado e Auto, para subir junto com o Windows."
    }
}

Etapa "Arquivos instalados"

$destino = "C:\Program Files\MonitorIA"
if (-not (Test-Path $destino)) {
    Falha "Pasta $destino nao existe."
} else {
    Ok "Pasta $destino criada"

    $obrigatorios = @(
        "monitoria-agent.exe",
        "monitoria-dpapi.exe",
        "monitoria-service.exe",
        "monitoria-service.xml",
        "ffmpeg\ffmpeg.exe",
        "ffmpeg\ffprobe.exe",
        "ffmpeg\LICENSE.txt",
        "ffmpeg\FFMPEG-ORIGEM.txt"
    )

    foreach ($rel in $obrigatorios) {
        if (Test-Path (Join-Path $destino $rel)) {
            Ok $rel
        } else {
            Falha "Faltando: $rel"
        }
    }
}

Etapa "Assinatura de todos os PE instalados"

if (Test-Path $destino) {
    $naoAssinados = Get-ChildItem $destino -Recurse -Include *.exe, *.dll |
        ForEach-Object {
            [PSCustomObject]@{
                Arquivo = $_.FullName
                Status  = (Get-AuthenticodeSignature $_.FullName).Status
            }
        } | Where-Object { $_.Status -ne 'Valid' }

    if ($naoAssinados) {
        foreach ($item in $naoAssinados) {
            Falha "$($item.Arquivo) -> $($item.Status)"
        }
    } else {
        Ok "Todos os .exe e .dll com assinatura Valid"
    }
}

Etapa "Entrada em Programas e Recursos"

$chaves = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
$registro = Get-ItemProperty $chaves -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like "*MonitorIA*" } | Select-Object -First 1

if (-not $registro) {
    Falha "Nenhuma entrada de desinstalacao registrada."
} else {
    Ok "DisplayName : $($registro.DisplayName)"
    Write-Host "  Publisher   : $($registro.Publisher)"
    Write-Host "  Versao      : $($registro.DisplayVersion)"

    if ($registro.Publisher -ne $Editor) {
        Falha "Publisher no registro e '$($registro.Publisher)', esperado '$Editor'."
    }
}

Etapa "Desinstalacao silenciosa"

$desinstalador = Get-ChildItem $destino -Filter "unins*.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1

if (-not $desinstalador) {
    Falha "Desinstalador nao encontrado em $destino."
} else {
    $assinaturaUnins = Get-AuthenticodeSignature $desinstalador.FullName
    if ($assinaturaUnins.Status -eq 'Valid') {
        Ok "Desinstalador assinado (SignedUninstaller=yes)"
    } else {
        Falha "Desinstalador com assinatura '$($assinaturaUnins.Status)'."
    }

    $p = Start-Process $desinstalador.FullName `
        -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART" -Wait -PassThru

    Write-Host "  ExitCode: $($p.ExitCode)"
    if ($p.ExitCode -eq 0) {
        Ok "Desinstalacao retornou 0"
    } else {
        Falha "Desinstalacao retornou $($p.ExitCode)."
    }

    Start-Sleep -Seconds 5

    if (Get-Service MonitorIAAgent -ErrorAction SilentlyContinue) {
        Falha "Servico MonitorIAAgent ainda registrado apos desinstalar."
    } else {
        Ok "Servico removido"
    }

    if (Test-Path $destino) {
        $restos = Get-ChildItem $destino -Recurse -ErrorAction SilentlyContinue
        Falha "Pasta $destino ainda existe com $($restos.Count) item(ns)."
    } else {
        Ok "Pasta de instalacao removida"
    }

    $dados = Join-Path $env:ProgramData "MonitorIA"
    if (Test-Path $dados) {
        Falha "$dados ainda existe. O estado local deveria ser removido."
    } else {
        Ok "ProgramData\MonitorIA removido"
    }
}

# ---------------------------------------------------------------------------

Etapa "Resultado"

if ($script:Avisos.Count -gt 0) {
    Write-Host "  Avisos ($($script:Avisos.Count)):" -ForegroundColor Yellow
    $script:Avisos | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
}

if ($script:Falhas.Count -eq 0) {
    Write-Host ""
    Write-Host "  Instalador aprovado para submissao." -ForegroundColor Green
    Write-Host "  SHA256: $hash" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "  $($script:Falhas.Count) falha(s):" -ForegroundColor Red
$script:Falhas | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
Write-Host ""
Write-Host "  NAO submeta. Corrija, gere nova tag e repita." -ForegroundColor Red
exit 1
