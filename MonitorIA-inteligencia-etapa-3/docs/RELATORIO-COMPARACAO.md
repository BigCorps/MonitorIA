# Comparação — antes e depois da Fase 3

## Antes

A Fase 2 identifica que vários eventos provavelmente pertencem à mesma visita ou atendimento, mas o grupo ainda não possui uma história operacional completa.

Exemplo:

```text
11:59 — cliente no balcão
12:01 — atendimento continua
12:03 — uso do terminal
12:04 — objeto entregue
12:06 — cliente sai
```

O sistema sabe que os capítulos estão relacionados, mas não possui tipo final, resultado, participantes consolidados e encerramento estruturado.

## Depois

```text
Sessão: Atendimento no balcão
Início: 11:59
Fim: 12:06
Duração: 7 minutos
Capítulos: 5
Cliente provável: 1
Funcionário provável: 1
Resultado visual: atendimento encerrado com saída
```

## Tipos iniciais

- atendimento ao cliente;
- entrega ou retirada;
- permanência de visitante;
- atividade de funcionário;
- operação de equipamento;
- acesso a área restrita;
- procedimento de abertura;
- procedimento de fechamento;
- outra atividade.

## Sinais visuais

O evento passa a informar somente ações observáveis:

- chegada;
- espera;
- início ou continuação de atendimento;
- uso de terminal;
- objeto passado ao funcionário;
- objeto passado ao cliente;
- saída;
- etapa de abertura ou fechamento;
- atividade de equipamento;
- acesso restrito;
- mudança de estado.

Esses sinais não confirmam venda, pagamento, identidade ou intenção.

## Interface

A nova seção `Sessões` mostra uma linha do tempo consolidada. Cada sessão possui página própria com:

- resumo;
- duração;
- estado;
- participantes prováveis;
- resultados visuais;
- capítulos em ordem;
- links para as evidências individuais.

## Assistente

Nova intenção: `interaction_sessions`.

Perguntas suportadas:

- Quantos atendimentos ocorreram hoje?
- Quais duraram mais?
- Houve entregas ou retiradas?
- Qual foi o resultado visual?
- Quais sessões terminaram por inatividade?
- Mostre os capítulos de um atendimento.

## Limitações

- uma sessão pode ser dividida se a câmera perder o cliente por tempo superior à janela;
- pessoas com roupas muito parecidas podem gerar agrupamento incorreto;
- encerramento por inatividade é inferência temporal, não saída visual;
- uso de terminal não confirma venda ou pagamento;
- entrega de objeto não determina conteúdo, propriedade ou intenção.
