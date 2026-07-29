# Aplicação — MonitorIA v0.7.3

## 1. Extração

Extraia este ZIP na raiz do repositório, preservando as pastas.

## 2. Instalação e validação local

```bash
cd /workspaces/MonitorIA
npm install --include=dev
npm run check
npm test
npm run build
```

A migration ainda não deve ser aplicada antes de essas três validações passarem.

## 3. Variáveis da Vercel

Cadastre ou confirme:

```env
VISION_MODEL_ECONOMIC=gpt-5-nano
VISION_MODEL_BALANCED=gpt-5-nano
VISION_MODEL_DETAILED=gpt-5-mini
VISION_MODEL_ESCALATION=gpt-5-mini

VISION_DETAIL_ECONOMIC=low
VISION_DETAIL_BALANCED=low
VISION_DETAIL_DETAILED=low

VISION_MAX_OUTPUT_ECONOMIC=1600
VISION_MAX_OUTPUT_BALANCED=2400
VISION_MAX_OUTPUT_DETAILED=3200

VISION_BALANCED_ESCALATION_CONFIDENCE=0.75

VISION_NANO_INPUT_USD_PER_1M=0.05
VISION_NANO_CACHED_INPUT_USD_PER_1M=0.005
VISION_NANO_OUTPUT_USD_PER_1M=0.40

VISION_MINI_INPUT_USD_PER_1M=0.25
VISION_MINI_CACHED_INPUT_USD_PER_1M=0.025
VISION_MINI_OUTPUT_USD_PER_1M=2
```

Durante o primeiro teste A/B:

```env
VISION_AB_TEST_ENABLED=true
VISION_AB_TEST_SAMPLE_PERCENT=100
VISION_AB_TEST_MAX_PER_CAMERA=50
```

Depois de coletar e avaliar a amostra:

```env
VISION_AB_TEST_ENABLED=false
```

## 4. Commit

```bash
git add .
git commit -m "feat: adiciona calibração e modos visuais v0.7.3"
git push origin main
```

## 5. Migration

Depois do build passar, aplique:

```text
supabase/migrations/20260729160000_motion_cost_plan_validation.sql
```

Ela adiciona:

- parâmetros adaptativos da câmera;
- telemetria de cache e raciocínio;
- tabela segura de comparação nano × mini;
- consolidação horária de saúde do Agent;
- retenção de 7 dias para heartbeat bruto.

## 6. Agent Windows

Aguarde o GitHub Actions e baixe:

```text
monitoria-agent-windows-x64-baseline-v0.7.3
```

Feche o Agent antigo e substitua somente o executável.

Não execute `reset`.

```powershell
Unblock-File "$env:USERPROFILE\Downloads\monitoria-agent.exe"

& "$env:USERPROFILE\Downloads\monitoria-agent.exe" self-test
& "$env:USERPROFILE\Downloads\monitoria-agent.exe" status
& "$env:USERPROFILE\Downloads\monitoria-agent.exe"
```

Resultado esperado do autoteste:

```text
Autoteste do DPAPI, máscara e calibração de movimento concluído com sucesso.
```

## 7. Validação

Na página da câmera:

- selecione Econômico, Equilibrado ou Detalhado;
- mantenha calibração adaptativa ligada;
- use “detectar automaticamente” para o relógio;
- mantenha “sempre monitorar” no primeiro teste.

Nos logs, aguarde:

```text
Calibração de "Entrada da Loja" concluída
ruído p95
início efetivo
continuação efetiva
células automáticas ignoradas
```

Avalie o A/B em:

```text
/dashboard/vision-tests
```

Consulte também:

```text
docs/VALIDATION-v0.7.3.md
docs/ROADMAP-MONITORIA-V1.md
```
