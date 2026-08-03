# Arquitetura de processos

## Fluxo

```text
Evento visual
  ↓
Grupo de continuidade
  ↓
Sessão operacional
  ↓
Capítulos ordenados
  ↓
Definição aplicável
  ↓
Etapas observadas, pendentes ou não confirmadas
  ↓
Instância do processo
  ↓
Insight e desvios
```

## Definição aplicável

A prioridade é:

```text
câmera → local → organização → template genérico
```

Isso permite adaptar o processo sem amarrar o motor a uma loja ou câmera específica.

## Matching

A INT-5 não pede para o modelo generativo inventar um processo. Ela compara deterministicamente:

- `session_type`;
- `chapter_type`;
- ordem dos capítulos;
- confiança;
- resultado da sessão;
- duração;
- baseline da INT-4.

## Estados

```text
open
completed
incomplete
uncertain
aborted
```

`incomplete` significa que uma ou mais etapas obrigatórias não foram confirmadas pelas evidências disponíveis. Não significa automaticamente falha operacional.

## Templates iniciais

- atendimento ao cliente;
- entrega ou retirada;
- permanência de visitante;
- abertura;
- fechamento;
- operação de equipamento;
- acesso restrito;
- atividade de funcionário.

Outros processos podem ser cadastrados no mesmo schema por organização, local ou câmera.

## Configuração personalizada

Owner e admin podem criar uma nova versão por organização, local ou câmera usando:

```text
save_operational_process_definition_v1
```

A função valida escopo, etapas e tipos de capítulo, arquiva a versão anterior e enfileira as sessões afetadas para reconstrução. Ela não é concedida ao papel MCP.
