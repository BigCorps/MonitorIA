# Relatório de comparação — Etapa 2

## Antes

Cada evento era tratado de forma independente. Um atendimento contínuo podia gerar vários cards, e cada card voltava a registrar as pessoas visíveis naquele intervalo.

Exemplo observado em produção:

```text
11:59 — Atendimento no balcão com cliente conversando
12:01 — Atendimento no balcão com cliente em frente
12:03 — Atendimento no balcão — cliente conversa com atendente
12:03 — Atendimento no balcão — cliente entrega/consulta
```

Os dados existentes já descreviam sinais úteis, como roupa vinho/roxa, calça clara, óculos pendurados no peito e posição do atendente. Porém, as cores eram livres e inconsistentes: `maroon`, `wine`, `dark/purple`, `roxo/escuro`, `marrom/roxo escuro`. Isso impedia uma comparação determinística confiável.

## Depois

O modelo passa a devolver uma aparência padronizada:

```json
{
  "upperClothingColor": "burgundy",
  "lowerClothingColor": "blue",
  "upperClothingType": "polo",
  "lowerClothingType": "pants",
  "hairColor": "white",
  "hairLength": "short",
  "facialHair": "none",
  "eyewear": "none",
  "bodyBuild": "robust",
  "headwear": "none",
  "distinctiveVisibleFeatures": [
    "glasses_hanging",
    "shoulder_strap"
  ],
  "visibility": "clear",
  "confidence": 0.88
}
```

O servidor compara essa estrutura com instâncias recentes da mesma câmera. A decisão não depende apenas da autoconfiança do modelo.

## Critérios de continuidade

A pontuação combina:

- roupa superior: peso 24%;
- roupa inferior: 14%;
- cor e comprimento de cabelo: 15% combinados;
- barba: 8%;
- óculos: 8%;
- silhueta ampla: 7%;
- tipos de roupa: 11% combinados;
- cobertura da cabeça: 5%;
- características visíveis distintas: 8%;
- proximidade temporal: bônus complementar;
- compatibilidade de papel e zona: filtro obrigatório em situações de funcionário.

A correspondência normal exige similaridade mínima de 0,72. Informação visual insuficiente produz uma nova instância em vez de forçar uma ligação.

## Resultado armazenado

Cada pessoa observada pode receber um vínculo temporário:

```text
person_memory_instance
appearance_similarity
continuity_score
link_kind
staff_profile_id opcional
```

Cada evento pode receber:

```text
interaction_group_id
continuation_of_event_id
is_continuation
interaction_event_count
probable_people_count
probable_customer_count
probable_staff_count
continuity_confidence
```

## Funcionários

A classificação deixa de depender apenas da zona. O prompt recebe perfis operacionais aprovados e considera:

- posição habitual;
- operação do terminal;
- permanência atrás do balcão;
- descritores visuais não biométricos;
- compatibilidade com o perfil cadastrado.

Uma roupa isolada nunca é prova de vínculo empregatício.

## Limitações assumidas

- duas pessoas com roupas muito parecidas podem ser agrupadas incorretamente;
- mudança de casaco ou uniforme pode dividir uma mesma visita;
- infravermelho reduz a qualidade das cores;
- pessoas ocluídas podem receber `unknown` e não ser ligadas;
- clientes não são reconhecidos de um dia para outro;
- funcionários são categorias operacionais, não identidades civis verificadas.

## Benefício esperado

A tela continua mostrando cada capítulo, mas passa a demonstrar raciocínio temporal:

> Um mesmo cliente provável permaneceu em atendimento entre 11h59 e 12h03, gerando quatro capítulos relacionados.

Isso melhora relatórios, Assistente, duração de atendimentos e estimativa de pessoas distintas sem introduzir reconhecimento facial.
