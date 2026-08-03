# Aplicação da Fase 3

## 1. Pré-requisitos

Confirme que as Fases 1 e 2 já foram aplicadas. A migration verifica a existência de `events.interaction_group_id` e interrompe caso a memória curta ainda não exista.

## 2. Banco de dados

Execute:

```text
supabase/migrations/20260801193000_operational_sessions_v1.sql
```

A migration:

- cria as tabelas de sessões, capítulos, participantes, grupos e resultados;
- adiciona campos resumidos em `events` e `interaction_groups`;
- cria o processador determinístico;
- instala o gatilho acionado quando a Fase 2 define `interaction_group_id`;
- cria RPCs de pesquisa e Assistente;
- publica `operational_sessions` no Supabase Realtime;
- ativa a Fase 3 nas câmeras que já usam memória curta.

Não execute o rollback junto com a migration principal.

## 3. Código

Extraia o ZIP na raiz do repositório, preservando os caminhos. A pasta do pacote pode permanecer temporariamente dentro do projeto.

Validação sem escrita:

```bash
node MonitorIA-inteligencia-etapa-3/scripts/apply-fase-3.mjs \
  --repo . \
  --dry-run
```

Aplicação:

```bash
node MonitorIA-inteligencia-etapa-3/scripts/apply-fase-3.mjs \
  --repo .
```

O instalador cria um backup fora da raiz do repositório.

## 4. Verificação

```bash
npm run check
npm run build
```

Depois do deploy, confirme:

- item `Sessões` no menu;
- abertura de `/dashboard/sessions`;
- indicador `Ao vivo`;
- novos eventos com `sessionSignals` no payload;
- criação de `operational_sessions` após a memória curta vincular o evento;
- badges de sessão nos cards;
- consulta no Assistente: “Quais atendimentos ocorreram hoje?”.

## 5. Comportamento inicial

A classificação é determinística e usa, nesta ordem:

1. transições visuais de abertura ou fechamento;
2. sinais de sessão estruturados pelo modelo;
3. tipo do grupo criado pela Fase 2;
4. papéis e participantes temporários;
5. atividade em equipamento ou área restrita.

Sessões com saída visual clara são encerradas imediatamente. Sem saída visível, o encerramento ocorre por inatividade após 12 minutos. Esse valor pode ser ajustado por câmera.

## 6. Rollback

Código:

```bash
node MonitorIA-inteligencia-etapa-3/scripts/restore-fase-3.mjs \
  --backup ../MonitorIA-backup-operational-sessions-v1-AAAA-MM-DD...
```

Banco:

```text
supabase/migrations/rollback_operational_sessions_v1.sql
```

O rollback do banco restaura a função de pesquisa da Fase 2.
