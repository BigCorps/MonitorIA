param(
  [string]$RepoRoot = (Get-Location).Path,
  [string]$ProjectRef = "xwejfayeackbrilipgrj",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
$migrations = Join-Path $RepoRoot "supabase/migrations"

if (-not (Test-Path $migrations)) {
  throw "Pasta supabase/migrations não encontrada em $RepoRoot"
}

$renameMap = [ordered]@{
  "20260801165000_enable_events_realtime.sql" = "20260801165002_enable_events_realtime.sql"
  "20260802013000_assistant_commercial_catalog_and_schema.sql" = "20260802012720_assistant_commercial_catalog_and_schema.sql"
  "20260802013100_assistant_balance_reservation_functions.sql" = "20260802012846_assistant_balance_reservation_functions.sql"
  "20260802013200_assistant_message_quota_triggers.sql" = "20260802012925_assistant_message_quota_triggers.sql"
  "20260802013300_assistant_credit_invoice_creation.sql" = "20260802013002_assistant_credit_invoice_creation.sql"
  "20260802013400_assistant_credit_pix_confirmation.sql" = "20260802013111_assistant_credit_pix_confirmation.sql"
  "20260802013500_assistant_balance_internal_snapshot.sql" = "20260802013327_assistant_balance_internal_snapshot.sql"
  "20260802013600_assistant_quota_trigger_consolidation.sql" = "20260802013438_assistant_quota_trigger_consolidation.sql"
  "20260802013700_assistant_service_contracts.sql" = "20260802013631_assistant_service_contracts.sql"
  "20260802013800_assistant_commercial_index_hardening.sql" = "20260802014428_assistant_commercial_index_hardening.sql"
  "20260802013900_assistant_completion_expiry_safety.sql" = "20260802014709_assistant_completion_expiry_safety.sql"
  "20260802014000_assistant_entitlement_gate.sql" = "20260802014857_assistant_entitlement_gate.sql"
}

$repairVersions = @(
  "20260731223000",
  "20260801131500",
  "20260801193000",
  "20260801223000",
  "20260801230000",
  "20260802190000",
  "20260802200000",
  "20260802213000",
  "20260802230000"
)

Write-Host "MonitorIA — reconciliação de migrations" -ForegroundColor Cyan
Write-Host "Projeto esperado: $ProjectRef"
Write-Host "Modo: $(if ($Apply) { 'APLICAR' } else { 'SIMULAÇÃO' })"

foreach ($entry in $renameMap.GetEnumerator()) {
  $source = Join-Path $migrations $entry.Key
  $target = Join-Path $migrations $entry.Value

  if ((Test-Path $source) -and (Test-Path $target)) {
    $sourceHash = (Get-FileHash $source -Algorithm SHA256).Hash
    $targetHash = (Get-FileHash $target -Algorithm SHA256).Hash
    if ($sourceHash -ne $targetHash) {
      throw "Conflito: $($entry.Key) e $($entry.Value) existem com conteúdos diferentes."
    }

    Write-Host "Duplicado idêntico: remover $($entry.Key)"
    if ($Apply) { Remove-Item $source }
    continue
  }

  if (Test-Path $source) {
    Write-Host "Renomear $($entry.Key) -> $($entry.Value)"
    if ($Apply) {
      Push-Location $RepoRoot
      try {
        if ((Test-Path (Join-Path $RepoRoot ".git")) -and (Get-Command git -ErrorAction SilentlyContinue)) {
          & git mv -- "supabase/migrations/$($entry.Key)" "supabase/migrations/$($entry.Value)"
          if ($LASTEXITCODE -ne 0) { throw "git mv falhou para $($entry.Key)" }
        } else {
          Move-Item $source $target
        }
      } finally {
        Pop-Location
      }
    }
  } elseif (Test-Path $target) {
    Write-Host "Já reconciliado: $($entry.Value)" -ForegroundColor DarkGreen
  } else {
    Write-Warning "Arquivo não encontrado: $($entry.Key)"
  }
}

Write-Host ""
Write-Host "Versões executadas diretamente no banco que precisam ser marcadas como applied:"
$repairVersions | ForEach-Object { Write-Host "  $_" }

if (-not $Apply) {
  Write-Host ""
  Write-Host "Nada foi alterado. Execute novamente com -Apply após revisar." -ForegroundColor Yellow
  exit 0
}

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI não encontrado. Instale/configure antes de reparar o histórico."
}

Push-Location $RepoRoot
try {
  $linkedRefFile = Join-Path $RepoRoot "supabase/.temp/project-ref"
  if (-not (Test-Path $linkedRefFile)) {
    throw "Projeto não está linkado. Execute: supabase link --project-ref $ProjectRef"
  }

  $linkedRef = (Get-Content $linkedRefFile -Raw).Trim()
  if ($linkedRef -ne $ProjectRef) {
    throw "Projeto linkado é $linkedRef, mas o esperado é $ProjectRef."
  }

  foreach ($version in $repairVersions) {
    Write-Host "Marcando $version como applied..."
    & supabase migration repair $version --status applied --linked
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao reparar a migration $version"
    }
  }

  Write-Host ""
  & supabase migration list --linked
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao listar migrations após a reconciliação."
  }
} finally {
  Pop-Location
}

Write-Host "Reconciliação concluída." -ForegroundColor Green
