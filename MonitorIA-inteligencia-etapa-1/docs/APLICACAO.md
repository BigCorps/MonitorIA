# Aplicação — Motor de Estados Visuais v1

## Objetivo desta entrega

Esta etapa adiciona ao MonitorIA uma camada genérica para registrar e consolidar estados visuais de:

- barreiras de acesso e portas;
- caixas, gavetas, armários e compartimentos;
- objetos de referência;
- equipamentos;
- áreas de atividade;
- iluminação.

A taxonomia atual de eventos permanece intacta. Os novos dados são adicionados em `stateObservations` e persistidos em tabelas próprias.

## Ordem de aplicação

### 1. Banco de dados

No Supabase SQL Editor, execute integralmente:

`supabase/migrations/20260731223000_visual_state_engine_v1.sql`

A migration:

- adiciona a feature flag `cameras.visual_state_enabled`;
- adiciona contexto operacional aos eventos;
- cria as tabelas de entidades, observações, estados atuais, transições, sessões e revisões;
- cria o processamento automático após a inserção de cada evento;
- cria RPCs para o Assistente;
- configura a cortina principal da câmera `Entrada da Loja`;
- ativa a funcionalidade somente nessa câmera.

Não execute o arquivo de rollback durante a instalação.

### 2. Código

Extraia o ZIP em uma pasta separada. A estrutura interna preserva os caminhos reais do repositório, mas o instalador faz as cópias para evitar substituições sem backup.

No Codespaces, caso a pasta extraída `MonitorIA-inteligencia-etapa-1` esteja dentro da raiz do repositório, execute primeiro:

```bash
node MonitorIA-inteligencia-etapa-1/scripts/apply-etapa-1.mjs --repo . --dry-run
```

O dry-run valida todos os blocos e mostra os arquivos que serão alterados, sem escrever nada.

Depois aplique:

```bash
node MonitorIA-inteligencia-etapa-1/scripts/apply-etapa-1.mjs --repo .
```

O instalador:

- copia os arquivos completos para seus caminhos originais;
- faz alterações pontuais na rota de eventos e nos arquivos do Assistente;
- carrega entidades visuais apenas quando a feature flag da câmera está ativa;
- envia ao modelo somente as entidades do perfil ativo;
- preserva somente IDs e estados configurados;
- eleva `prompt_version` de `2` para `3` e grava o hash SHA-256 do prompt/perfil;
- adiciona as intenções `operating_hours` e `visual_state`;
- conecta o Assistente às RPCs da migration;
- impede que uma observação simples seja apresentada como horário exato.

Antes de qualquer escrita, o instalador salva os arquivos atuais em uma pasta irmã do repositório, com nome semelhante a:

```text
MonitorIA-backup-visual-state-v1-2026-07-31T...
```

O script é idempotente. Uma segunda execução não duplica alterações. Se algum bloco do repositório tiver mudado, o dry-run interrompe com uma mensagem em vez de editar o local errado.

### 3. Verificação de compilação

Esta entrega não adiciona nem exige uma suíte funcional de testes. Antes do deploy, execute apenas a verificação de compilação:

```bash
npm run check
npm run build
```

### 4. Deploy

Faça o deploy normal da aplicação e do Agent já existente. Nesta etapa, o Agent não foi alterado.

## Comportamento no plano Básico

O plano Básico continua enviando um único quadro nos eventos comuns.

Com um quadro, o modelo pode registrar uma fotografia clara do estado atual. O servidor só troca um estado já conhecido quando ocorrer uma destas condições:

- a transição estiver visível;
- a persistência estiver visível;
- a entidade tiver confiabilidade alta e a fotografia única tiver confiança visual mínima de 0,90.

Isso permite começar com a câmera atual sem aumentar imediatamente o custo de todos os eventos.

Quando uma abertura não for capturada durante a transição:

- `first_open_observed_at` registra quando o local apareceu aberto pela primeira vez;
- `opened_at` permanece nulo;
- `opening_precision` recebe `observed_only`.

O Assistente deve dizer “já aparecia aberto às…” e não “abriu exatamente às…”.

## Consultas rápidas após o deploy

### Entidade configurada

```sql
select
  id,
  name,
  entity_type,
  primary_operational_marker,
  min_confidence,
  reliability,
  enabled
from public.camera_visual_entities
order by created_at desc;
```

### Estado atual

```sql
select
  entity.name,
  entity.entity_type,
  state.current_state,
  state.since_at,
  state.last_observed_at,
  state.confidence
from public.visual_entity_current_states state
join public.camera_visual_entities entity
  on entity.id = state.entity_id
order by state.updated_at desc;
```

### Aberturas e fechamentos

```sql
select
  status,
  opened_at,
  first_open_observed_at,
  closed_at,
  opening_precision,
  closing_precision
from public.site_operating_sessions
order by first_open_observed_at desc;
```

### Movimentos fora do horário ou depois do fechamento

```sql
select
  started_at,
  headline,
  primary_event_type,
  outside_declared_hours,
  after_confirmed_closing
from public.events
where outside_declared_hours
   or after_confirmed_closing
order by started_at desc
limit 100;
```

## Ajuste da área da cortina

A entidade inicial reutiliza o polígono da zona que contém “portão” ou “cortina”. Se o recorte estiver amplo demais, ajuste `polygon` em `camera_visual_entities`.

Formato:

```json
[
  { "x": 0.00, "y": 0.00 },
  { "x": 1.00, "y": 0.00 },
  { "x": 1.00, "y": 0.42 },
  { "x": 0.00, "y": 0.42 }
]
```

As coordenadas variam de `0` a `1`.

## Desativação imediata

Para parar a análise e a consolidação da nova inteligência nessa câmera, sem remover tabelas:

```sql
update public.cameras
set visual_state_enabled = false
where name = 'Entrada da Loja';
```

O restante do MonitorIA continua funcionando normalmente.

## Rollback do código

Use o caminho de backup informado pelo instalador:

```bash
node MonitorIA-inteligencia-etapa-1/scripts/restore-etapa-1.mjs \
  --repo . \
  --backup /caminho/MonitorIA-backup-visual-state-v1-DATA
```

O restaurador devolve os arquivos existentes à versão anterior e remove apenas os arquivos novos criados pelo pacote.

## Rollback do banco

Execute:

`supabase/migrations/rollback_visual_state_engine_v1.sql`

O rollback do banco restaura o perfil ativo salvo no backup da entidade inicial e remove os dados coletados por essa camada. Prefira primeiro desativar a feature flag.
