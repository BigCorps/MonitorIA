param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$FilePath
)

$ErrorActionPreference = "Stop"

function Require-EnvironmentValue([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Variavel obrigatoria ausente para assinatura Inno: $Name"
  }
  return $value
}

function Assert-PeImage([string]$Path) {
  $stream = [System.IO.File]::Open(
    $Path,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::ReadWrite
  )

  try {
    $header = New-Object byte[] 2
    $read = $stream.Read($header, 0, 2)
    if ($read -ne 2 -or $header[0] -ne 0x4D -or $header[1] -ne 0x5A) {
      throw "O arquivo enviado pelo Inno nao e um executavel PE valido: $Path"
    }
  }
  finally {
    $stream.Dispose()
  }
}

$username = Require-EnvironmentValue "ESIGNER_USERNAME"
$password = Require-EnvironmentValue "ESIGNER_PASSWORD"
$credentialId = Require-EnvironmentValue "ESIGNER_CREDENTIAL_ID"
$totpSecret = Require-EnvironmentValue "ESIGNER_TOTP_SECRET"
$context = Require-EnvironmentValue "MONITORIA_SIGN_CONTEXT"

$codeSignToolRoot = $env:CODE_SIGN_TOOL_PATH
if ([string]::IsNullOrWhiteSpace($codeSignToolRoot)) {
  $codeSignToolRoot = $env:CODESIGNTOOL_PATH
}
if ([string]::IsNullOrWhiteSpace($codeSignToolRoot)) {
  throw "CodeSignTool da SSL.com nao foi inicializado pelo workflow."
}

$codeSignTool = Join-Path $codeSignToolRoot "CodeSignTool.bat"
if (-not (Test-Path -LiteralPath $codeSignTool)) {
  throw "CodeSignTool.bat nao encontrado em $codeSignToolRoot"
}

$resolvedPath = (Resolve-Path -LiteralPath $FilePath).Path
$fileName = [IO.Path]::GetFileName($resolvedPath)
$originalExtension = [IO.Path]::GetExtension($resolvedPath)

# O Inno Setup assina o uninstaller ainda como uninst.e32.tmp.
# A SSL.com/eSigner rejeita a extensao .tmp mesmo quando o conteudo e PE/EXE.
# Por isso assinamos uma copia byte-a-byte com extensao .exe e devolvemos o
# PE ja assinado para o caminho temporario original que o Inno espera.
Assert-PeImage $resolvedPath

$operationId = [guid]::NewGuid().ToString("N")
$inputDir = Join-Path $env:RUNNER_TEMP ("monitoria-inno-input-" + $operationId)
$outputDir = Join-Path $env:RUNNER_TEMP ("monitoria-inno-output-" + $operationId)
$stagedFileName = "monitoria-inno-sign.exe"
$stagedInput = Join-Path $inputDir $stagedFileName
$signLog = Join-Path $env:RUNNER_TEMP "monitoria-inno-signatures.jsonl"

New-Item -ItemType Directory -Force -Path $inputDir | Out-Null
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Copy-Item -LiteralPath $resolvedPath -Destination $stagedInput -Force

try {
  & $codeSignTool sign `
    "-username=$username" `
    "-password=$password" `
    "-credential_id=$credentialId" `
    "-totp_secret=$totpSecret" `
    "-input_file_path=$stagedInput" `
    "-output_dir_path=$outputDir" `
    "-malware_block=true"

  $toolExitCode = $LASTEXITCODE

  $signedFile = Join-Path $outputDir $stagedFileName
  if (-not (Test-Path -LiteralPath $signedFile)) {
    $signedCandidate = Get-ChildItem -LiteralPath $outputDir -Recurse -File |
      Where-Object { $_.Name -eq $stagedFileName } |
      Select-Object -First 1

    if ($signedCandidate) {
      $signedFile = $signedCandidate.FullName
    }
  }

  if ($toolExitCode -ne 0 -or -not (Test-Path -LiteralPath $signedFile)) {
    Start-Sleep -Seconds 5
    throw "SSL.com/eSigner nao produziu o arquivo assinado para $fileName (exit $toolExitCode)."
  }

  $signedSignature = Get-AuthenticodeSignature -LiteralPath $signedFile
  if ($signedSignature.Status -ne "Valid") {
    throw "Assinatura Authenticode invalida no staging de $fileName ($($signedSignature.Status))."
  }
  if (-not $signedSignature.TimeStamperCertificate) {
    throw "Arquivo assinado sem carimbo de tempo: $fileName"
  }

  $signedHash = (Get-FileHash -LiteralPath $signedFile -Algorithm SHA256).Hash.ToLower()

  Copy-Item -LiteralPath $signedFile -Destination $resolvedPath -Force

  $finalHash = (Get-FileHash -LiteralPath $resolvedPath -Algorithm SHA256).Hash.ToLower()
  if ($finalHash -ne $signedHash) {
    throw "Os bytes assinados nao foram repostos integralmente no arquivo do Inno: $fileName"
  }

  # Para arquivos .exe normais, validamos novamente no caminho final.
  # Para o temporario .tmp do Inno, alguns verificadores escolhem o SIP pela
  # extensao. A assinatura ja foi validada na copia .exe e os hashes garantem
  # que os mesmos bytes voltaram ao .tmp.
  if ($originalExtension -ieq ".exe") {
    $finalSignature = Get-AuthenticodeSignature -LiteralPath $resolvedPath
    if ($finalSignature.Status -ne "Valid") {
      throw "Assinatura Authenticode invalida apos a reposicao: $fileName ($($finalSignature.Status))."
    }
    if (-not $finalSignature.TimeStamperCertificate) {
      throw "Arquivo reposto sem carimbo de tempo: $fileName"
    }
  }

  $record = [ordered]@{
    context = $context
    fileName = $fileName
    filePath = $resolvedPath
    originalExtension = $originalExtension
    signerInputFileName = $stagedFileName
    status = $signedSignature.Status.ToString()
    hasTimestamp = [bool]$signedSignature.TimeStamperCertificate
    signerSubject = $signedSignature.SignerCertificate.Subject
    sha256 = $finalHash
    signedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Compress

  Add-Content -LiteralPath $signLog -Value $record -Encoding utf8
  Write-Host "Authenticode Inno confirmado: $context / $fileName via $stagedFileName"
}
finally {
  Remove-Item -LiteralPath $inputDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $outputDir -Recurse -Force -ErrorAction SilentlyContinue
}
