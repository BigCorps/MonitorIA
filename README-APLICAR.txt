MONITORIA — INTELIGÊNCIAS + CUSTO + ESTADOS EXPLICATIVOS

O QUE JÁ FOI FEITO NO SUPABASE
A migration "included_monitoring_intelligence_by_plan" já foi aplicada.
Não execute SQL manualmente no projeto atual.

MATRIZ DECIDIDA
Essencial, Atenta e Detalhada recebem:
- Períodos
- Rotinas
- Processos
- Padrões da operação
- Funcionamento
- Alertas operacionais
- Entre câmeras (quando houver pelo menos 2 câmeras)
- estado visual / memória curta necessários para essas funções

Motivo: essas inteligências são derivadas dos eventos já analisados, SQL/cron ou
métricas calculadas localmente. Elas não aumentam maximum_analysis_frames, não
mudam o percentual de escalonamento/verificação e não ligam clipes em planos que
não os possuem. Assim preservamos os principais controles de COGS.

ARQUIVOS FRONTEND
Substitua:
- app/dashboard/dashboard-section-tabs.tsx
- app/dashboard/dashboard-section-tabs.module.css

Isso adiciona explicações específicas em cada seção, evitando que "0" pareça erro.

MIGRATION PARA O REPOSITÓRIO
Adicione:
- supabase/migrations/20260813162000_included_monitoring_intelligence_by_plan.sql

Ela já está aplicada no banco; o arquivo serve para manter o repositório alinhado.

FUNCIONAMENTO / AGENT
A seção Funcionamento depende de uma amostra visual que o Agent 0.15.0 ainda não
estava enviando. A correção está no patch:
- monitoria-agent-health.patch

No Codespace, depois de colocar este pacote na raiz, rode:
python3 aplicar-agent-health.py

O script primeiro usa "git apply --check". Se houver qualquer divergência, ele
para SEM ALTERAR arquivos.

Depois:
npm run check
npm run build

Como o Agent mudou, será necessário gerar um novo instalador. Recomendo subir a
versão para 0.15.1 somente depois de o build web passar e o patch do Agent passar
no TypeScript.

IMPORTANTE
Não alterei:
- número de frames por plano
- roteamento/escalonamento do LLM
- verificação seletiva
- clipes
- retenção
- preço dos planos
- workflow de assinatura
