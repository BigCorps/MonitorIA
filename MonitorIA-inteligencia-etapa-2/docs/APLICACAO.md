# Aplicação — Etapa 2

## 1. Pré-requisito

Esta entrega é incremental. Antes dela, a Etapa 1 deve estar aplicada:

- coluna `cameras.visual_state_enabled` existente;
- contrato `src/contracts/visual-state.ts` presente;
- prompt visual na versão 3;
- migration do Motor de Estados Visuais executada.

O instalador interrompe a aplicação caso não encontre a estrutura de código da Etapa 1. A migration também interrompe se a coluna de banco da Etapa 1 não existir.

## 2. Banco de dados

Execute no SQL Editor do Supabase:

```text
supabase/migrations/20260801131500_short_memory_continuity_v1.sql
```

A migration:

- adiciona as configurações de memória curta às câmeras;
- adiciona `appearance` a `event_people`;
- cria perfis operacionais de funcionários;
- cria instâncias temporárias de pessoas;
- cria vínculos probabilísticos entre aparições;
- cria grupos de interação e capítulos;
- adiciona indicadores de continuidade aos eventos;
- atualiza `search_monitoria_events`;
- cria `assistant_continuity_summary`;
- habilita a função na câmera `Entrada da Loja`;
- cria os perfis `Funcionário provável A` e `Funcionário provável B`.

Nenhuma imagem facial, vetor biométrico ou embedding é armazenado.

## 3. Código

Extraia a pasta `MonitorIA-inteligencia-etapa-2` na raiz do repositório e execute:

```bash
node MonitorIA-inteligencia-etapa-2/scripts/apply-etapa-2.mjs \
  --repo . \
  --dry-run
```

O resultado esperado é a indicação de 15 arquivos planejados, podendo variar caso algum arquivo já tenha sido aplicado.

Depois:

```bash
node MonitorIA-inteligencia-etapa-2/scripts/apply-etapa-2.mjs \
  --repo .
```

O instalador cria um backup fora da pasta do repositório antes de alterar qualquer arquivo.

## 4. Verificação de build

```bash
npm run check
npm run build
```

Não foram adicionados testes funcionais ou dataset offline, conforme a decisão de acompanhar o comportamento diretamente em produção. O pacote foi submetido a:

- transpilição sintática dos arquivos TypeScript entregues;
- verificação sintática dos scripts Node;
- dry-run do instalador;
- aplicação idempotente em repositório simulado;
- restauração do backup em repositório simulado;
- verificação lexical de delimitadores e blocos SQL.

## 5. Ordem de deploy

Use esta ordem:

1. SQL da Etapa 1;
2. código da Etapa 1;
3. SQL da Etapa 2;
4. código da Etapa 2;
5. `npm run check`;
6. `npm run build`;
7. deploy Vercel;
8. reinício ou atualização normal do Agent, sem alteração de binário nesta etapa.

## 6. Primeiro comportamento esperado

Nos eventos semelhantes aos enviados — um mesmo cliente com camisa vinho/roxa clara ou escura, calça clara e óculos pendurados no peito — os capítulos próximos poderão ficar assim:

```text
11:59 — primeiro capítulo
12:01 — continuação provável
12:03 — continuação provável

Grupo: 1 atendimento provável
Cliente provável: 1
Funcionário provável: 1
Capítulos: 3
```

A conclusão depende dos novos descritores estruturados produzidos depois do deploy. Eventos históricos não recebem backfill automático porque ainda não possuem a nova assinatura padronizada.

## 7. Perfis iniciais de funcionários

A migration cria:

### Funcionário provável A

- porte visual: `slim`;
- óculos: `glasses`;
- confirmação adicional: posição em zona de funcionário e atividade atrás do balcão.

### Funcionário provável B

- porte visual: `robust`;
- cabelo: `white`;
- barba: `beard`;
- confirmação adicional: posição em zona de funcionário e atividade operacional.

O sistema não usa tom de pele, rosto, geometria facial, nome, idade ou gênero para essas correspondências.

## 8. Configuração inicial

A câmera `Entrada da Loja` recebe:

```text
short_memory_enabled = true
short_memory_window_minutes = 15
customer_memory_hours = 12
staff_memory_hours = 18
interaction_gap_minutes = 10
continuity_min_similarity = 0.720
staff_match_min_similarity = 0.740
```

A roupa superior tem peso maior no cálculo. Roupa inferior, cabelo, barba, óculos, silhueta ampla, cobertura da cabeça e características visíveis complementam a decisão.

## 9. Cards de eventos

Além dos indicadores atuais, os cards podem mostrar:

```text
≈ 1 cliente provável
↻ 4 capítulos
```

Os eventos continuam individuais e acessíveis. A camada nova apenas informa que eles provavelmente pertencem à mesma interação.

## 10. Assistente MonitorIA

Exemplos de perguntas após existirem novos dados:

- Quantos clientes diferentes provavelmente apareceram hoje?
- Quantos atendimentos ocorreram hoje?
- Esses eventos eram do mesmo cliente?
- Quanto tempo durou o atendimento mais longo?
- Quantos capítulos o atendimento das 12h gerou?
- Qual funcionário provável estava presente?

O Assistente deverá usar expressões como `cliente provável`, `pessoa distinta provável` e `capítulo`, nunca identidade ou contagem exata.

## 11. Retenção e privacidade

- clientes: instâncias temporárias, normalmente válidas por até 12 horas;
- funcionários: instância da jornada por até 18 horas, ligada a perfil operacional aprovado;
- instâncias de clientes expiradas: elegíveis para exclusão após dois dias;
- rosto e biometria: não armazenados;
- correspondência entre dias para clientes: não realizada;
- mesma roupa em pessoas diferentes: pode gerar falso agrupamento, razão pela qual papel, zona e tempo também são considerados.

## 12. Rollback

### Código

Use o caminho do backup informado pelo instalador:

```bash
node MonitorIA-inteligencia-etapa-2/scripts/restore-etapa-2.mjs \
  --backup ../MonitorIA-backup-short-memory-v1-DATA
```

### Banco

Execute:

```text
supabase/migrations/rollback_short_memory_continuity_v1.sql
```

O rollback remove somente a camada da Etapa 2 e restaura a assinatura anterior de `search_monitoria_events`.
