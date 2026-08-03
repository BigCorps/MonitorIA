# Relatório de comparação — antes e depois

## Antes

O MonitorIA analisava eventos isolados com a taxonomia principal:

- pessoas;
- veículos;
- objetos;
- zonas;
- atividade incomum;
- mudança de cena.

O horário semanal da câmera controlava o comportamento do Agent, mas não representava prova visual de que o estabelecimento estava aberto ou fechado.

As mudanças da cortina podiam aparecer em títulos ou resumos, porém permaneciam misturadas com tipos genéricos como `person_entered`, `person_exited` ou `scene_change`.

Não existia estado persistente para responder com segurança:

- qual é o estado atual;
- quando o estado mudou;
- quanto tempo permaneceu assim;
- se o evento ocorreu depois de um fechamento visual confirmado.

## Depois desta etapa

Cada evento novo pode conter `stateObservations`, sem alterar `primaryEventType`.

O modelo observa apenas entidades configuradas e usa somente os estados permitidos para cada entidade.

O banco consolida:

- observação bruta;
- estado atual;
- transições;
- horário declarado versus horário observado;
- eventos depois do fechamento confirmado;
- sessões operacionais;
- precisão da abertura e do fechamento;
- evidência associada.

## Compatibilidade

Eventos antigos com `schemaVersion=1.1` continuam aceitos pelo contrato interno e são normalizados para `1.2` com `stateObservations=[]`.

As tabelas e relatórios antigos continuam funcionando.

A funcionalidade é controlada por câmera através de `visual_state_enabled`. Cada análise nova registra `prompt_version=3` e o hash SHA-256 das instruções e do perfil usado.

## Segurança semântica

A implementação não afirma:

- crime;
- furto;
- identidade;
- intenção;
- conteúdo de caixa ou armário;
- reconhecimento da mesma pessoa entre eventos.

O horário cadastrado continua sendo contexto, não prova visual.

Uma fotografia única pode confirmar um estado forte, mas não é apresentada como transição visível. A precisão fica registrada como `strong_snapshot` ou `observed_only`.

## Primeira entidade real

A migration procura dinamicamente, no perfil ativo da câmera `Entrada da Loja`, a zona relacionada a cortina ou portão e cria:

- nome: `Cortina principal`;
- tipo: `access_barrier`;
- marcador operacional principal: `true`;
- confiabilidade: `high`;
- confiança mínima: `0.82`.

Estados permitidos:

- `closed`;
- `partially_open`;
- `opening`;
- `open`;
- `closing`.

## Assistente

Foram incluídas duas intenções:

- `operating_hours`;
- `visual_state`.

As respostas passam a distinguir:

- abertura visualmente capturada;
- primeira observação de que já estava aberto;
- fechamento visível;
- fotografia forte de estado;
- movimento fora do horário cadastrado;
- movimento depois do fechamento confirmado.

## Limite desta primeira entrega

A estrutura genérica já aceita barreiras, compartimentos, objetos, equipamentos, áreas e iluminação. A migration configura automaticamente apenas a `Cortina principal` da câmera `Entrada da Loja`. Caixas, armários e outros elementos precisam receber seus próprios polígonos e descrições antes de começarem a produzir estados.

O Agent permanece inalterado nesta etapa. No plano Básico, fotografias únicas podem consolidar estados fortes, mas somente sequências com antes e depois recebem `transitionVisible=true`.
