param(
  [string]$RepoRoot = (Get-Location).Path,
  [string]$BaseUrl = "https://www.monitoria.cam",
  [string]$CronSecret = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path

$package = Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
if ($package.engines.node -ne "22.x") {
  throw "package.json ainda não fixa Node em 22.x"
}

$vercel = Get-Content (Join-Path $RepoRoot "vercel.json") -Raw | ConvertFrom-Json
$paths = @($vercel.crons | ForEach-Object { $_.path })
$required = @(
  "/api/cron/billing",
  "/api/cron/trials",
  "/api/cron/camera-health",
  "/api/cron/processes",
  "/api/cron/staff-profiles",
  "/api/cron/routines",
  "/api/cron/ai-usage",
  "/api/cron/assistant-credits",
  "/api/cron/retention"
)
foreach ($path in $required) {
  if ($paths -notcontains $path) { throw "Cron ausente: $path" }
}

$edge = Get-Content (Join-Path $RepoRoot "supabase/functions/monitoria-process-billing/index.ts") -Raw
if ($edge -notmatch 'role === "service_role"') {
  throw "A Edge Function ainda não valida o papel service_role"
}
if ($edge -notmatch 'verify_jwt=true') {
  Write-Warning "verify_jwt é configuração de deploy e não aparece no código. Confirme que continua true no Supabase."
}

$migration = Join-Path $RepoRoot "supabase/migrations/20260803204000_post_audit_security_performance.sql"
if (-not (Test-Path $migration)) {
  throw "Migration pós-auditoria ausente."
}

Write-Host "Arquivos locais validados." -ForegroundColor Green

try {
  $health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method Get -TimeoutSec 20
  if (-not $health.ok) { throw "Health respondeu sem ok=true" }
  Write-Host "Produção /api/health: OK" -ForegroundColor Green
} catch {
  Write-Warning "Não foi possível validar /api/health: $($_.Exception.Message)"
}

if ($CronSecret) {
  $headers = @{ Authorization = "Bearer $CronSecret" }
  foreach ($cronPath in @("/api/cron/camera-health", "/api/cron/billing")) {
    try {
      $result = Invoke-RestMethod -Uri "$BaseUrl$cronPath" -Headers $headers -Method Get -TimeoutSec 60
      Write-Host "$cronPath: OK" -ForegroundColor Green
    } catch {
      Write-Warning "$cronPath falhou: $($_.Exception.Message)"
    }
  }
} else {
  Write-Host "CRON_SECRET não informado; endpoints protegidos não foram chamados."
}
