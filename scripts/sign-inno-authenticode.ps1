param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$FilePath
)

$ErrorActionPreference = "Stop"

function Require-EnvironmentValue([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Variável obrigatória ausente para assinatura Inno: $Name"
  }
  return $value
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
  throw "CodeSignTool da SSL.com não foi inicializado pelo workflow."
}

$codeSignTool = Join-Path $codeSignToolRoot "CodeSignTool.bat"
if (-not (Test-Path -LiteralPath $codeSignTool)) {
  throw "CodeSignTool.bat não encontrado em $codeSignToolRoot"
}

$resolvedPath = (Resolve-Path -LiteralPath $FilePath).Path
$fileName = [IO.Path]::GetFileName($resolvedPath)
$outputDir = Join-Path $env:RUNNER_TEMP ("monitoria-inno-sign-" + [guid]::NewGuid().ToString("N"))
$signLog = Join-Path $env:RUNNER_TEMP "monitoria-inno-signatures.jsonl"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

try {
  & $codeSignTool sign `
    "-username=$username" `
    "-password=$password" `
    "-credential_id=$credentialId" `
    "-totp_secret=$totpSecret" `
    "-input_file_path=$resolvedPath" `
    "-output_dir_path=$outputDir" `
    "-malware_block=true"

  $toolExitCode = $LASTEXITCODE
  $signedFile = Join-Path $outputDir $fileName
  if (-not (Test-Path -LiteralPath $signedFile)) {
    $signedCandidate = Get-ChildItem -LiteralPath $outputDir -Recurse -File |
      Where-Object { $_.Name -eq $fileName } |
      Select-Object -First 1
    if ($signedCandidate) {
      $signedFile = $signedCandidate.FullName
    }
  }

  if ($toolExitCode -ne 0 -or -not (Test-Path -LiteralPath $signedFile)) {
    Start-Sleep -Seconds 5
    throw "SSL.com/eSigner não produziu o arquivo assinado: $fileName (exit $toolExitCode)."
  }

  $signedSignature = Get-AuthenticodeSignature -LiteralPath $signedFile
  if ($signedSignature.Status -ne "Valid") {
    throw "Assinatura Authenticode inválida antes da reposição: $fileName ($($signedSignature.Status))."
  }
  if (-not $signedSignature.TimeStamperCertificate) {
    throw "Arquivo assinado sem carimbo de tempo: $fileName"
  }

  Copy-Item -LiteralPath $signedFile -Destination $resolvedPath -Force

  $finalSignature = Get-AuthenticodeSignature -LiteralPath $resolvedPath
  if ($finalSignature.Status -ne "Valid") {
    throw "Assinatura Authenticode inválida após a reposição: $fileName ($($finalSignature.Status))."
  }
  if (-not $finalSignature.TimeStamperCertificate) {
    throw "Arquivo reposto sem carimbo de tempo: $fileName"
  }

  $record = [ordered]@{
    context = $context
    fileName = $fileName
    filePath = $resolvedPath
    status = $finalSignature.Status.ToString()
    hasTimestamp = [bool]$finalSignature.TimeStamperCertificate
    signerSubject = $finalSignature.SignerCertificate.Subject
    sha256 = (Get-FileHash -LiteralPath $resolvedPath -Algorithm SHA256).Hash.ToLower()
    signedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Compress

  Add-Content -LiteralPath $signLog -Value $record -Encoding utf8
  Write-Host "Authenticode Inno confirmado: $context / $fileName"
}
finally {
  Remove-Item -LiteralPath $outputDir -Recurse -Force -ErrorAction SilentlyContinue
}
