param(
  [string]$RepoRoot = (Get-Location).Path,
  [string]$ProjectRef = "xwejfayeackbrilipgrj",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path

Write-Host "MonitorIA — aplicação pós-auditoria" -ForegroundColor Cyan
Write-Host "Modo: $(if ($Apply) { 'APLICAR' } else { 'SIMULAÇÃO' })"
Write-Host ""
Write-Host "Etapas:"
Write-Host "  1. Reconciliar nomes/histórico das migrations"
Write-Host "  2. Executar npm run check e npm run build"
Write-Host "  3. Aplicar a nova migration com supabase db push"
Write-Host "  4. Publicar monitoria-process-billing"

$reconcile = Join-Path $RepoRoot "scripts/reconcile-migration-history.ps1"
if (-not (Test-Path $reconcile)) {
  throw "Script de reconciliação não encontrado: $reconcile"
}

& $reconcile -RepoRoot $RepoRoot -ProjectRef $ProjectRef -Apply:$Apply
if (-not $Apply) {
  Write-Host ""
  Write-Host "Simulação concluída. Nenhum comando de build/deploy foi executado." -ForegroundColor Yellow
  exit 0
}

Push-Location $RepoRoot
try {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm não encontrado."
  }
  if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    throw "Supabase CLI não encontrado."
  }

  & npm run check
  if ($LASTEXITCODE -ne 0) { throw "npm run check falhou" }

  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build falhou" }

  & supabase db push --linked
  if ($LASTEXITCODE -ne 0) { throw "supabase db push falhou" }

  & supabase functions deploy monitoria-process-billing --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { throw "deploy da Edge Function falhou" }
} finally {
  Pop-Location
}

Write-Host "Correções aplicadas. Faça commit/push para a Vercel publicar os crons e o Node 22.x." -ForegroundColor Green
