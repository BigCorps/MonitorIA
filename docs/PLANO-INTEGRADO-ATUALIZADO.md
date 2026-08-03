# MonitorIA.cam — Plano de inteligência integrado ao Plano completo de produção v1.0

**Documento de coordenação entre agentes**  
**Data de consolidação:** 1º de agosto de 2026  
**Produto-base:** MonitorIA.cam v0.8.2  
**Meta comercial:** MonitorIA.cam v1.0.0  
**Responsável pelo produto:** BigCorps Tecnologia  
**Escopo deste documento:** inteligência visual, memória operacional, Assistente e MCP

---

## 1. Objetivo

Este documento complementa o **MonitorIA.cam — Plano completo de produção v1.0**. Ele não substitui nem altera as decisões comerciais, preços, trial, Pix, retenção, franquias, direitos, instalação, clipes ou critérios de lançamento.

Sua função é registrar:

1. o que já foi preparado na trilha de inteligência;
2. o que ainda será desenvolvido;
3. como cada entrega se encaixa nas fases oficiais de produção;
4. o que pertence a outros agentes;
5. quais arquivos, tabelas e contratos exigem coordenação;
6. como evitar implementações duplicadas ou incompatíveis.

---

## 2. Fontes de verdade

### 2.1 Produto, comercial e lançamento

Fonte principal:

```text
MonitorIA.cam — Plano completo de produção v1.0
```

Governa:

- planos e preços;
- desconto progressivo;
- trial;
- Pix;
- assinatura;
- retenção contratada;
- franquia do Assistente;
- Agent comercial;
- clipes;
- LGPD;
- homologação;
- lançamento.

### 2.2 Inteligência visual e operacional

Fonte principal:

```text
docs/PLANO-INTELIGENCIA-INTEGRADO-AO-PLANO-PRODUCAO.md
```

Governa:

- interpretação visual;
- schemas da análise;
- estados;
- continuidade;
- pessoas e veículos prováveis;
- sessões;
- rotinas;
- desvios;
- processos;
- saúde da câmera;
- roteamento de modelos;
- Assistente operacional;
- MCP;
- alertas inteligentes.

### 2.3 Implementação de cada pacote

Em caso de dúvida técnica, consultar nesta ordem:

1. `MANIFEST.json`;
2. documentação do pacote;
3. migration SQL;
4. contratos TypeScript;
5. código aplicado;
6. migration registrada no Supabase.

### 2.4 Regra de conflito

- O Plano de Produção vence em questões comerciais.
- Este documento vence em semântica de inteligência.
- Pacote entregue não significa pacote aplicado.
- Nenhuma fase deve ser marcada como concluída sem confirmar banco, código, build e deploy.

---

# 3. Dois roadmaps diferentes

## 3.1 Fases oficiais de produção

```text
PROD-0  Documentação e decisões
PROD-1  Fundação comercial
PROD-2  Pix
PROD-3  Trial
PROD-4  Retenção
PROD-5  Controle de IA e margem
PROD-6  Assistente e franquia
PROD-7  Agent Windows
PROD-8  Clipes
PROD-9  Onboarding e dashboard
PROD-10 Segurança, LGPD e jurídico
PROD-11 Operação e suporte
PROD-12 Homologação e lançamento
```

## 3.2 Fases internas da inteligência

```text
INT-1    Estados visuais
INT-2    Memória curta e continuidade
INT-2.5  Eventos em tempo real
INT-3    Sessões e capítulos operacionais
INT-3.5  Cenas complexas, veículos e roteamento
INT-3.8  MCP Público v1
INT-4    Rotinas e desvios
INT-5    Processos e ações
INT-6    Perfis operacionais
INT-7    Saúde e drift da câmera
INT-8    Captura inteligente no Agent
INT-9    Análise seletiva avançada
INT-10   Assistente operacional avançado
INT-11   Inteligência entre câmeras
INT-12   Alertas inteligentes
```

Os códigos `INT` não substituem nem reorganizam os códigos `PROD`.

---

# 4. Escopo da trilha de inteligência

## 4.1 Esta trilha é responsável por

- schemas de visão;
- prompts;
- interpretação de pessoas, veículos, objetos e ações;
- associação entre participante, ação e alvo;
- estados visuais;
- memória temporal;
- continuidade;
- sessões;
- rotinas;
- desvios;
- processos;
- saúde da câmera;
- score de complexidade;
- escolha do modelo;
- verificação seletiva;
- consultas do Assistente;
- contratos públicos do MCP;
- linguagem de incerteza;
- condições inteligentes de alerta.

## 4.2 Não pertence a esta trilha

- preços;
- billing;
- Pix;
- renovação;
- trial comercial;
- instalador Windows;
- serviço do Agent;
- ONVIF;
- fila persistente;
- atualização automática;
- buffer de vídeo;
- transcodificação;
- upload de clipes;
- checkout;
- landing;
- jurídico;
- status page;
- backups;
- campanhas.

## 4.3 Áreas compartilhadas

Exigem alinhamento:

```text
API de ingestão
Agent
localMetrics
seleção de frames
retenção de evidências
Assistente
dashboard de eventos
dashboard de sessões
alertas
OAuth do MCP
RLS
entitlement
telemetria de custo
```

---

# 5. Status atual

> “Preparado” significa pacote entregue, não necessariamente aplicado.

| Código | Entrega | Situação | Banco aplicado | Código aplicado |
|---|---|---|---|---|
| `INT-1` | Visual State Engine v1 | Preparado | Não confirmado | Não confirmado |
| `INT-2` | Short Memory Continuity v1 | Preparado | Não confirmado | Não confirmado |
| `INT-2.5` | Realtime da linha do tempo | Preparado | **Realtime de `events` habilitado via MCP** | Não confirmado |
| `INT-3` | Operational Sessions v1 | Preparado | Não | Não |
| `INT-3.5` | Multi-scene, routing e vehicle memory | Preparado | Não | Não |
| `INT-3.8` | MCP Público v1 | Preparado | Não | Não |
| `INT-4` | Rotinas e desvios operacionais | Preparado | Não | Não |
| `INT-5` | Processos e ações operacionais | Preparado | Não | Não |
| `INT-6` | Perfis operacionais de funcionários | Preparado | Não | Não |
| `INT-7` a `INT-12` | Evoluções futuras | Planejadas | Não | Não |

---

# 6. Entregas já preparadas

## 6.1 INT-1 — Estados visuais

Pacote:

```text
MonitorIA-inteligencia-etapa-1.zip
001-visual-state-engine-v1.sql
001-visual-state-engine-v1-rollback.sql
```

### Objetivo

Criar um motor genérico para acompanhar estados visuais de entidades em qualquer câmera.

### Entidades

```text
access_barrier
container
reference_object
equipment
activity_area
lighting_reference
```

### Estados operacionais

```text
unknown
closed
opening
open
closing
```

### Estruturas previstas

```text
camera_visual_entities
visual_state_observations
visual_state_transitions
visual_entity_current_states
site_operating_sessions
```

### Regra

A IA registra observações. O servidor determina transições de forma determinística.

---

## 6.2 INT-2 — Memória curta e continuidade

Pacote:

```text
MonitorIA-inteligencia-etapa-2.zip
002-short-memory-continuity-v1.sql
002-short-memory-continuity-v1-rollback.sql
```

### Objetivo

Agrupar capítulos próximos e estimar participantes prováveis sem reconhecimento facial.

### Capacidades

- continuidade entre eventos;
- grupos de interação;
- clientes distintos prováveis;
- perfis operacionais de funcionários;
- descritores temporários;
- linguagem explícita de probabilidade.

### Estruturas conhecidas

```text
camera_staff_profiles
person_memory_instances
interaction_groups
interaction_group_events
```

### Proibições

- reconhecimento facial;
- embedding de rosto;
- identidade civil;
- etnia;
- atributo protegido;
- rastreamento permanente;
- reidentificação irrestrita.

### Regra conservadora

É preferível duplicar uma pessoa provável do que unir duas pessoas diferentes.

---

## 6.3 INT-2.5 — Realtime da linha do tempo

Pacote:

```text
MonitorIA-etapa-2.5-realtime.zip
```

Arquivos principais:

```text
app/dashboard/events/page.tsx
app/dashboard/events/event-export-buttons.tsx
app/dashboard/events/events-realtime-refresh.tsx
app/dashboard/events/events-realtime-refresh.module.css
app/dashboard/events/mobile-disclosure.module.css
supabase/migrations/20260801165000_enable_events_realtime.sql
```

### Objetivo

Atualizar automaticamente a página quando houver `INSERT` ou `UPDATE` em eventos.

### Comportamento

- filtro por organização;
- debounce;
- `router.refresh()`;
- botão manual de fallback;
- filtros recolhidos no mobile;
- exportação recolhida no mobile;
- desktop preservado.

### Alteração já aplicada

```text
public.events → supabase_realtime
```

Essa foi a única alteração executada diretamente no Supabase por esta trilha.

---

## 6.4 INT-3 — Sessões e capítulos operacionais

Pacote:

```text
MonitorIA-inteligencia-etapa-3.zip
003-operational-sessions-v1.sql
003-operational-sessions-v1-rollback.sql
```

### Objetivo

Transformar vários eventos em uma história operacional.

### Tipos iniciais

```text
customer_service
delivery_or_pickup
visitor_presence
staff_activity
equipment_operation
restricted_access
opening_procedure
closing_procedure
other_activity
```

### Sinais

```text
arrival
waiting
service_started
service_continued
terminal_activity
object_handoff_to_staff
object_handoff_to_customer
departure
opening_step
closing_step
equipment_activity
restricted_access
state_change
```

### Regra

A IA descreve sinais. O banco determina início, capítulos, duração, participantes, resultado e encerramento.

### Interface prevista

```text
/dashboard/sessions
/dashboard/sessions/[sessionId]
```

---

## 6.5 INT-3.5 — Cenas complexas, veículos e roteamento

Pacote:

```text
MonitorIA-inteligencia-fase-3.5.zip
0035-multiscene-routing-vehicle-memory-v1.sql
0035-multiscene-routing-vehicle-memory-v1-rollback.sql
```

### Blocos

```text
3.5A  Cenas multi-entidade
3.5B  Memória temporária de veículos
3.5C  Modos de câmera
3.5D  Roteador de complexidade
3.5E  Gateway de inferência
```

### Modos de câmera

```text
auto
general
entrance
service_counter
checkout
parking
warehouse
corridor
production
restricted_area
crowd
```

### Rotas

```text
deterministic
economic
balanced
strong
verifier
```

### Estruturas conhecidas

```text
vehicle_memory_instances
event_vehicle_memory_links
analysis_routing_decisions
```

### Métricas compartilhadas com o Agent

```text
motionRegionCount
motionSpreadPercent
```

### Limite

Veículos visualmente idênticos podem permanecer indistinguíveis. A resposta deve ser provável ou `unknown`.

---

## 6.6 INT-3.8 — MCP Público v1

Pacote:

```text
MonitorIA-inteligencia-fase-3.8-mcp-publico-v1.zip
0038-mcp-public-v1.sql
0038-mcp-public-v1-rollback.sql
```

### Ferramentas públicas congeladas

```text
get_monitoria_capabilities
list_sites
list_cameras
get_camera_overview
search_events
get_event_details
search_operational_sessions
get_session_details
get_visual_state
get_operational_summary
compare_periods
get_evidence
search_insights
ask_monitoria
```

### Compatibilidade

Até a v1:

- não renomear ferramentas;
- não remover ferramentas;
- não adicionar parâmetros obrigatórios;
- não mudar tipos existentes;
- não mudar o envelope principal;
- adicionar apenas campos opcionais;
- manter experimentos fora do endpoint público.

### Base futura

```text
operational_insights
```

Tipos:

```text
routine
deviation
process
camera_health
alert
other
```

### Segurança

- somente leitura;
- OAuth;
- isolamento por organização;
- rate limit;
- auditoria;
- URLs assinadas;
- sem exclusão;
- sem revisão;
- sem alteração de câmera;
- sem controle remoto na v1.

---


## 6.7 INT-4 — Rotinas e desvios operacionais

Pacote:

```text
MonitorIA-inteligencia-fase-4.zip
004-routine-intelligence-v1.sql
004-routine-intelligence-v1-rollback.sql
```

Entregas:

- observações de rotina;
- baselines por câmera, dia e horário;
- expectativas aprendidas ou confirmadas;
- desvios com confiança e evidências;
- página `/dashboard/routines`;
- cron leve e reconstrução completa;
- intenção `routines_deviations`;
- enriquecimento do MCP sem novas ferramentas públicas.

---

## 6.8 INT-5 — Processos e ações operacionais

Pacote:

```text
MonitorIA-inteligencia-fase-5.zip
005-operational-process-intelligence-v1.sql
005-operational-process-intelligence-v1-rollback.sql
```

Entregas:

- definições genéricas e personalizáveis de processos;
- etapas obrigatórias, opcionais, repetíveis e terminais;
- instâncias ligadas às sessões operacionais;
- etapas observadas, pendentes, não confirmadas e fora da sequência;
- ações adicionais;
- comparação de duração com a INT-4;
- fila assíncrona e cron;
- página `/dashboard/processes`;
- intenção `processes_actions`;
- capacidade `processes` disponível no MCP congelado.

A ausência de uma etapa visual não prova que ela deixou de ocorrer.

---

# 7. Mapeamento para o Plano de Produção

## PROD-0 — Documentação e governança

**Responsável principal:** agente de documentação e arquitetura.

### Já preparado pela inteligência

- roadmap;
- relatórios;
- manifests;
- rollbacks;
- contratos versionados;
- regras de privacidade;
- toolset MCP congelado;
- fronteiras entre agentes.

### Ainda necessário

Adicionar ao repositório:

```text
docs/PLANO-INTELIGENCIA-INTEGRADO-AO-PLANO-PRODUCAO.md
docs/ROADMAP-INTELIGENCIA-MONITORIA.md
docs/decisions/ADR-INT-001-visual-state-engine.md
docs/decisions/ADR-INT-002-temporary-person-memory.md
docs/decisions/ADR-INT-003-operational-sessions.md
docs/decisions/ADR-INT-004-visual-complexity-routing.md
docs/decisions/ADR-INT-005-public-mcp-toolset-v1.md
docs/decisions/ADR-INT-006-no-facial-recognition-v1.md
```

### Regra

Não alterar contratos de inteligência apenas para facilitar uma tela ou migration local.

---

## PROD-1 — Fundação comercial

**Responsável principal:** agente de billing, catálogo e entitlement.

### A inteligência não define

- preço;
- desconto;
- fatura;
- Pix;
- renovação;
- trial comercial.

### A inteligência deve consumir

```text
resolve_camera_entitlement(p_camera_id uuid)
```

### O entitlement deve controlar

- ingestão;
- plano de análise;
- quantidade de frames;
- escalonamento;
- Storage;
- clipe;
- Assistente;
- MCP;
- retenção;
- expurgo.

### Regra

Não criar um segundo entitlement dentro do Agent, visão, Assistente ou MCP.

---

## PROD-2 — Pix

**Responsável principal:** agente de Pix, faturas e Banco Inter.

### Integração

Após confirmação atômica, o sistema comercial deve liberar:

- câmera;
- plano;
- ingestão;
- Assistant;
- MCP;
- retenção;
- clipe.

### Regra

O MCP público não gera cobrança, não confirma Pix e não altera assinatura.

---

## PROD-3 — Trial

**Responsável principal:** agente de trial e entitlement.

### A inteligência deve

- executar a pipeline real;
- produzir eventos reais;
- produzir estados;
- produzir continuidade;
- produzir sessões;
- respeitar o plano escolhido;
- parar após o prazo;
- limitar Assistant e MCP pela franquia.

### Dados esperados pelo Agent

```text
access_source
capture_starts_at
capture_ends_at
monitoring_allowed
plan_code
```

### Regra

Não criar uma inteligência simplificada ou falsa só para o trial.

---

## PROD-4 — Retenção

**Responsável principal:** agente de Storage e expurgo.

### A inteligência define

Quais frames possuem maior valor de evidência.

### O plano comercial define

Quantos permanecem.

```text
Essencial: peak
Atenta: start + peak
Detalhada: start + peak + end
```

### Regra

Não renomear:

```text
start
peak
end
extra
```

sem coordenação com Agent e visão.

---

## PROD-5 — Controle de IA e margem

**Responsabilidade compartilhada:** inteligência e custos.

### Entrega já preparada

A INT-3.5 cobre:

- score de complexidade;
- rotas;
- gateway;
- verificador;
- telemetria;
- motivo do roteamento;
- modos de câmera;
- cenas multi-entidade.

### Próximas fases relacionadas

```text
INT-8
INT-9
```

### O agente de custos pode alterar

- preços por token;
- dashboards;
- metas de COGS;
- alertas financeiros;
- limites comerciais.

### Não deve alterar sozinho

- score de complexidade;
- critérios de escalonamento;
- escolha de frames;
- verificador;
- schemas de visão.

### Regra

Nenhuma função visual deve chamar um modelo fora do gateway de inferência.

---

## PROD-6 — Assistente e franquia

**Responsabilidade compartilhada.**

### Inteligência governa

- intenções;
- consultas;
- evidências;
- linguagem de probabilidade;
- estados;
- continuidade;
- sessões;
- rotinas;
- desvios;
- processos;
- saúde;
- alertas.

### Comercial governa

- 90 interações;
- 21 no trial;
- créditos extras;
- débito;
- estorno;
- renovação;
- bloqueio.

### Regra

Interação só é consumida após resposta concluída com sucesso.

Filtros, gráficos, eventos e ferramentas estruturadas do MCP não devem consumir interação por si só.

---

## PROD-7 — Agent Windows

**Responsável principal:** agente do instalador, serviço e captura.

### Inteligência governa

- `LocalMotionEvent`;
- labels;
- métricas locais;
- divisão em capítulos;
- região de movimento;
- seleção de imagens;
- captura adicional;
- sinais do roteador.

### Agent governa

- instalador;
- serviço;
- FFmpeg;
- ONVIF;
- RTSP;
- fila;
- retry;
- update;
- watchdog;
- diagnóstico;
- logs;
- segurança local.

### Campos compartilhados

```text
eventId
cameraId
sessionId
startedAt
endedAt
frames
localMetrics
closeReason
dominantRegion
motionCentroidX
motionCentroidY
motionRegionCount
motionSpreadPercent
```

### Regra

Campos novos podem ser opcionais. Campos existentes não devem ser renomeados ou mudar de tipo sem compatibilidade.

---

## PROD-8 — Clipes

**Responsável principal:** agente de vídeo e Storage.

### Inteligência governa

- relevância;
- evento associado;
- sessão associada;
- janela provável;
- prioridade;
- motivo do clipe.

### Vídeo governa

- buffer;
- H.264/H.265;
- transcodificação;
- 15 segundos;
- upload;
- CPU;
- disco;
- retenção;
- player.

### Regra

Falha no clipe não invalida evento, estado, sessão, imagens, texto, Assistente ou MCP.

---

## PROD-9 — Onboarding e dashboard

**Responsável principal:** agente de frontend e jornada comercial.

### Inteligência já preparou

- eventos;
- cards;
- filtros;
- exportação;
- realtime;
- estados;
- continuidade;
- sessões;
- badges;
- capítulos;
- indicador ao vivo.

### Frontend pode alterar

- layout;
- design;
- responsividade;
- acessibilidade;
- onboarding;
- billing;
- trial;
- navegação.

### Não deve alterar sozinho

- significado dos campos;
- regras de continuidade;
- cálculo de sessão;
- confiança;
- linguagem de probabilidade;
- contratos MCP.

### Regra mobile já definida

- filtros recolhidos;
- exportação recolhida;
- desktop aberto;
- primeiro evento próximo do topo.

---

## PROD-10 — Segurança, LGPD e jurídico

**Responsável principal:** segurança e jurídico.

### Decisões congeladas

Não usar na v1:

- reconhecimento facial;
- embedding facial;
- identidade civil;
- etnia;
- atributos protegidos;
- rastreamento permanente;
- leitura avançada de placas.

### Permitido

- roupa;
- acessórios;
- objetos;
- zona;
- direção;
- silhueta ampla;
- família de cor;
- tipo de veículo;
- carroceria;
- característica externa visível.

### MCP

- somente leitura;
- OAuth;
- isolamento;
- evidência sob demanda;
- URL assinada;
- revogação;
- auditoria.

### Regra

Reconhecimento facial ou leitura avançada de placas exigem add-on, base legal, retenção própria, controles próprios e revisão jurídica.

---

## PROD-11 — Operação e suporte

**Responsável principal:** observabilidade e suporte.

### Inteligência futura

```text
INT-7
INT-12
```

### Inteligência produzirá

- câmera deslocada;
- lente obstruída;
- desfoque;
- baixa iluminação;
- reflexo;
- perfil desatualizado;
- abertura atrasada;
- ausência de fechamento;
- reabertura;
- objeto removido;
- atividade fora de horário;
- sessão longa;
- fila acima do limite.

### Operação produzirá

- canal;
- destinatário;
- prioridade;
- repetição;
- e-mail;
- push;
- WhatsApp;
- status page;
- runbook;
- escalonamento.

### Regra

A inteligência determina condição e evidência. A operação determina entrega e tratamento.

---

## PROD-12 — Homologação e lançamento

**Responsável principal:** todos os agentes.

### Cenários mínimos de inteligência

- entrada;
- balcão;
- estacionamento;
- corredor;
- estoque;
- área externa;
- baixo movimento;
- alto movimento;
- várias pessoas;
- várias ações;
- oclusão;
- veículos parecidos;
- iluminação variável;
- abertura;
- fechamento;
- evento depois do fechamento;
- sessão encerrada por saída;
- sessão encerrada por inatividade;
- continuidade correta;
- não união de pessoas diferentes;
- custo por rota;
- fallback;
- falha do modelo;
- MCP isolado;
- evidência assinada;
- revogação.

### Gate da inteligência

- schemas válidos;
- migrations reproduzíveis;
- rollbacks;
- prompts versionados;
- rotas registradas;
- custos medidos;
- sem reconhecimento facial;
- consultas determinísticas;
- toolset MCP congelado;
- incerteza explícita;
- RLS aprovado;
- retenção correta.

---

# 8. Próximas fases da inteligência

## INT-4 — Rotinas e desvios

### Entregas

- abertura habitual;
- fechamento habitual;
- primeiro atendimento;
- último atendimento;
- períodos ativos;
- duração típica;
- rotina por dia da semana;
- baseline por câmera/local;
- desvio com confiança;
- evidências.

### Saída

```text
operational_insights.kind = routine | deviation
```

---

## INT-5 — Processos e ações

### Entregas

- vocabulário normalizado;
- ação → participante;
- ação → objeto;
- estado anterior/posterior;
- resultado visível;
- processo incompleto;
- processo interrompido;
- sequência fora do padrão.

### Saída

```text
operational_insights.kind = process
```

---

## INT-6 — Perfis operacionais

**Situação:** pacote preparado; banco, repositório e deploy ainda não aplicados.

Pacote:

```text
MonitorIA-inteligencia-fase-6.zip
006-staff-operational-profiles-v1.sql
006-staff-operational-profiles-v1-rollback.sql
```

### Entregas

- perfis aprovados;
- zonas habituais;
- ações habituais;
- turnos;
- roupa/acessório recorrente;
- atualização controlada;
- confiança;
- motivo da correspondência;
- correção humana.

### Limites

Sem nome automático, identidade civil, rosto ou biometria.

---

## INT-7 — Saúde e drift

### Entregas

- enquadramento deslocado;
- imagem congelada;
- lente coberta;
- desfoque;
- baixa luz;
- excesso de luz;
- reflexo;
- obstrução;
- ruído;
- perda de marcador;
- mudança de cenário;
- necessidade de novo perfil.

### Saída

```text
operational_insights.kind = camera_health
```

---

## INT-8 — Captura inteligente

### Entregas

- frame mais nítido;
- antes/depois;
- frame adicional seletivo;
- mudança crítica;
- redução de duplicatas;
- captura por entidade;
- janela adaptativa;
- seleção para cenas densas.

### Dependência

Coordenação obrigatória com `PROD-7` e `PROD-8`.

---

## INT-9 — Análise seletiva avançada

### Entregas

- score calibrado;
- thresholds por câmera;
- limite de escalonamento;
- verificador seletivo;
- comparação de modelos;
- qualidade por cenário;
- custo por cenário;
- custo por evento;
- rota limitada pelo plano;
- feature flags;
- rollback.

---

## INT-10 — Assistente operacional avançado

### Entregas

- resumo diário;
- comparação com rotina;
- explicação de desvio;
- processos;
- saúde;
- alertas;
- evidências;
- limitações explícitas.

### MCP

Enriquecer as 14 ferramentas existentes; não criar novas por padrão.

---

## INT-11 — Inteligência entre câmeras

### Entregas

- sequência temporal;
- direção provável;
- janela de passagem;
- pessoa provável;
- veículo provável;
- hipóteses concorrentes;
- evidência por câmera.

### Limites

Sem rosto, sem certeza artificial e restrito à organização/local autorizado.

---

## INT-12 — Alertas inteligentes

### Exemplos

- atraso na abertura;
- ausência de fechamento;
- reabertura;
- acesso restrito;
- objeto removido;
- equipamento fora do horário;
- fila excessiva;
- sessão longa;
- câmera obstruída;
- drift;
- baixa qualidade;
- processo incompleto.

### Saída

```text
operational_insights.kind = alert
```

### Todo alerta deve incluir

- condição;
- confiança;
- evidência;
- horário;
- câmera;
- local;
- motivo;
- limite;
- recomendação de verificação.

---

# 9. Contratos sob governança da inteligência

## 9.1 Arquivos compartilhados

Alterações exigem coordenação:

```text
src/contracts/analyzed-event.ts
src/contracts/camera-profile.ts
src/contracts/camera-profile-draft.ts
src/contracts/person-memory.ts
src/vision/types.ts
src/vision/prompt.ts
src/vision/profile-prompt.ts
src/vision/plans.ts
src/vision/plan-runner.ts
src/vision/openai-provider.ts
src/lib/event-analysis.ts
src/lib/event-continuity.ts
src/lib/event-search-data.ts
src/assistant/contracts.ts
src/assistant/openai.ts
app/api/agent/cameras/[cameraId]/events/route.ts
app/api/assistant/query/route.ts
agent/src/types.ts
agent/src/motion.ts
agent/src/event-monitor.ts
```

Após INT-3.8:

```text
src/mcp/*
app/mcp/*
app/api/mcp/*
app/.well-known/*
```

## 9.2 Campos compartilhados

```text
schemaVersion
localTrackId
confidence
requiresReview
reviewReasons
observations
people
vehicles
objects
zoneIds
sessionSignals
interactionGroupId
continuationOfEventId
operationalSessionId
localMetrics
frames
promptVersion
analysisPlanCode
```

## 9.3 Versionamento

- mudanças aditivas;
- campos novos opcionais;
- versão explícita;
- parser compatível;
- migration idempotente;
- rollback;
- feature flag;
- sem remoção imediata;
- sem mudança incompatível em MCP.

---

# 10. Estruturas de banco

## 10.1 Inteligência

```text
camera_visual_entities
visual_state_observations
visual_state_transitions
visual_entity_current_states
site_operating_sessions
camera_staff_profiles
person_memory_instances
interaction_groups
interaction_group_events
vehicle_memory_instances
event_vehicle_memory_links
analysis_routing_decisions
operational_insights
```

Além das estruturas de sessões operacionais da INT-3.

## 10.2 Comercial

Pertencem a outros agentes:

```text
camera_plan_catalog
camera_plan_price_versions
volume_discount_tiers
billing_accounts
camera_subscriptions
camera_subscription_changes
camera_entitlements
billing_invoices
billing_invoice_items
billing_price_snapshots
billing_payment_events
billing_pix_payments
trial_runs
trial_device_fingerprints
assistant_allowances
assistant_usage_events
assistant_credit_purchases
assistant_credit_ledger
camera_usage_daily
camera_usage_monthly
organization_usage_monthly
```

## 10.3 Regra

Antes de criar tabelas como:

```text
routines
deviations
process_alerts
camera_anomalies
```

verificar se o dado deve entrar em:

```text
operational_insights
```

---

# 11. Regras específicas do MCP

## 11.1 Toolset público

As 14 ferramentas estão congeladas para submissão.

## 11.2 Futuras inteligências entram em

```text
get_monitoria_capabilities
get_camera_overview
get_operational_summary
compare_periods
search_insights
ask_monitoria
```

## 11.3 Permitido

- campos opcionais;
- novas capacidades;
- novos tipos internos de insight;
- novas evidências;
- melhor qualidade;
- melhor performance.

## 11.4 Proibido sem nova versão pública

- renomear ferramenta;
- remover ferramenta;
- novo parâmetro obrigatório;
- alterar tipo;
- remover campo base;
- adicionar escrita;
- ampliar escopo sem consentimento.

## 11.5 Experimentos

Usar endpoint interno ou feature flag fora do MCP público.

---

# 12. Regras para evitar conflitos

## 12.1 Antes de alterar arquivo compartilhado

Registrar:

```text
objetivo
arquivo
campo/função
motivo
compatibilidade
migration
rollback
agentes afetados
```

## 12.2 Antes de criar tabela

Verificar:

- já existe equivalente?
- é inteligência ou comercial?
- precisa de RLS?
- retention?
- MCP?
- Assistente?
- auditoria?
- Realtime?
- rollback?

## 12.3 Antes de alterar Agent

Verificar impacto em:

- ingestão;
- schema;
- plano;
- frames;
- custo;
- roteamento;
- continuidade;
- sessão;
- retenção;
- clipe.

## 12.4 Antes de alterar Assistente

Verificar:

- consulta determinística;
- evidência;
- saldo;
- isolamento;
- intenção;
- MCP;
- linguagem de incerteza.

## 12.5 Antes de alterar MCP

Não alterar toolset público. Corrigir apenas implementação interna ou adicionar campos opcionais.

---

# 13. Ordem de aplicação da inteligência

```text
INT-1
↓
INT-2
↓
INT-2.5
↓
INT-3
↓
INT-3.5
↓
INT-3.8
↓
INT-4
↓
INT-5
↓
INT-6
↓
INT-7
↓
INT-8
↓
INT-9
↓
INT-10
↓
INT-11
↓
INT-12
```

### Observação INT-2.5

Realtime do Supabase já foi habilitado. Ainda é necessário confirmar o frontend e o deploy.

### Observação INT-3.8

O MCP deve ser aplicado depois das estruturas consultadas. Módulos futuros podem aparecer como `planned`, mas não podem fabricar dados.

---

# 14. Sequência integrada resumida

```text
PROD-0
  registrar documentos e ADRs INT

PROD-1
  integrar entitlement à ingestão, Assistente e MCP

PROD-2
  Pix libera direitos; inteligência não implementa financeiro

PROD-3
  trial usa pipeline real

PROD-4
  retenção preserva evidências conforme plano

PROD-5
  aplicar INT-3.5 e evoluir INT-8/INT-9

PROD-6
  integrar Assistente e evoluir INT-10

PROD-7
  integrar métricas e captura do Agent

PROD-8
  usar relevância inteligente para clipes

PROD-9
  aplicar realtime, estados, sessões e insights

PROD-10
  revisar memória temporária, evidências e MCP

PROD-11
  aplicar INT-7 e INT-12

PROD-12
  homologar toda a matriz
```

---

# 15. Matriz de propriedade

| Área | Inteligência | Outros agentes |
|---|---|---|
| Eventos | Schema, prompt, significado | UI, deploy, retenção |
| Pessoas | Memória temporária | Exibição e correção |
| Veículos | Assinatura temporária | UI e filtros |
| Estados | Entidades e transições | Configuração e interface |
| Sessões | Agrupamento e resultado | Página e navegação |
| Rotinas | Baseline e desvio | Alertas e relatórios |
| Processos | Vocabulário e sequência | Configuração por negócio |
| Modelos | Roteamento e verificação | Custos e secrets |
| Agent | Métricas e frames | Serviço, RTSP, fila e update |
| Assistente | Intenções e evidências | Saldo e interface |
| MCP | Ferramentas e contratos | OAuth operacional e submissão |
| Clipes | Relevância e janela | Buffer, encode e Storage |
| Alertas | Condição inteligente | Canal e entrega |
| Billing | Consumo do entitlement | Regra comercial completa |

---

# 16. Checklist para outros agentes

## Banco

- [ ] A tabela já existe?
- [ ] A migration anterior foi aplicada?
- [ ] Existe rollback?
- [ ] É idempotente?
- [ ] RLS foi considerada?
- [ ] Afeta inteligência?
- [ ] Afeta MCP?

## Agent

- [ ] Mantém o payload?
- [ ] Mantém labels?
- [ ] Mantém métricas usadas?
- [ ] Não envia RTSP à nuvem?
- [ ] Não aumenta custo sem governança?

## Frontend

- [ ] Não recalcula regra no navegador?
- [ ] Não transforma probabilidade em certeza?
- [ ] Não remove confiança?
- [ ] Não altera MCP?
- [ ] Preserva mobile e acessibilidade?

## Assistente

- [ ] Usa consulta determinística?
- [ ] Mostra evidência?
- [ ] Informa incerteza?
- [ ] Não inventa identidade?
- [ ] Consome saldo somente com sucesso?

## MCP

- [ ] A ferramenta já existe?
- [ ] A mudança é interna?
- [ ] Campos novos são opcionais?
- [ ] Continua somente leitura?
- [ ] Continua isolado?

## Privacidade

- [ ] Não usa reconhecimento facial?
- [ ] Não cria identidade permanente?
- [ ] Não infere atributo protegido?
- [ ] Possui retenção?
- [ ] Possui finalidade?
- [ ] Possui exclusão?

---

# 17. Definição de pronto da inteligência para a v1

A trilha estará pronta quando:

1. eventos reais forem estruturados;
2. estados forem acompanhados;
3. eventos próximos forem agrupados;
4. sessões forem reconstruídas;
5. cenas simples e complexas usarem rotas adequadas;
6. custos forem mensuráveis;
7. pessoas e veículos forem apenas prováveis;
8. não houver reconhecimento facial;
9. Assistente responder com evidência;
10. MCP usar contratos estáveis;
11. Agent fornecer métricas suficientes;
12. incertezas forem explícitas;
13. RLS impedir acesso cruzado;
14. retention respeitar planos;
15. alertas reutilizarem a mesma base;
16. homologação for aprovada.

---

# 18. Próxima ação oficial

Antes de iniciar `INT-7`, confirmar:

```text
[ ] INT-1 aplicada no Supabase e no repositório
[ ] INT-2 aplicada no Supabase e no repositório
[ ] INT-2.5 frontend aplicado e deploy validado
[ ] INT-3 aplicada no Supabase e no repositório
[ ] INT-3.5 aplicada no Supabase e no repositório
[ ] INT-3.8 aplicada e MCP configurado
[ ] INT-4 aplicada, cron configurado e baselines gerados
[ ] INT-5 aplicada, fila processada e processos revisados
[ ] INT-6 aplicada, candidatos revisados e perfis homologados
[ ] build aprovado
[ ] migrations registradas
[ ] feature flags documentadas
```

Depois:

```text
INT-7 — Saúde e drift da câmera
```

---

# 19. Regra final

```text
Outros agentes:
capturam, transportam, autenticam, cobram, armazenam,
exibem, notificam, implantam e operam.

Trilha de inteligência:
observa, estrutura, relaciona, memoriza, compara,
explica, roteia modelos e produz evidências.
```

Toda nova funcionalidade deve reutilizar os contratos existentes antes de criar uma estrutura paralela.


## Atualização INT-7 — Saúde e drift da câmera

**Situação:** pacote preparado; banco, repositório e deploy não aplicados.

Entregas:

- observação periódica independente de eventos;
- métricas locais de qualidade sem upload periódico de imagem;
- referência visual aprovada por humano;
- incidentes de iluminação, desfoque, possível obstrução, mudança de enquadramento, drift e ausência de observação;
- integração com `operational_insights`, Assistente e MCP;
- página `/dashboard/camera-health`;
- coleta desativada por padrão em cada câmera;
- cron de staleness;
- migration e rollback.

Próxima fase da trilha: `INT-8 — Captura inteligente no Agent`.
