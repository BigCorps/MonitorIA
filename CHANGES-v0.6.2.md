# MonitorIA v0.6.2

Corrige a geração do perfil que terminava com:

```text
Status: incomplete
```

## Causa

O limite de 1.600 tokens incluía o JSON visível e os tokens internos de
raciocínio do GPT-5 mini. O modelo atingia o limite antes de concluir a saída
estruturada.

## Correções

- usa no mínimo 5.000 tokens para o perfil, mesmo se a Vercel ainda estiver com
  o valor antigo de 1.600;
- configura `reasoning.effort` como `minimal`;
- repete uma única vez com no mínimo 10.000 tokens quando o motivo for
  `max_output_tokens`;
- soma o uso das duas chamadas para não subestimar custo;
- inclui o motivo de respostas incompletas nos logs;
- mantém `VISION_STORE_RESPONSES=false`.

Não há alteração no banco ou no Agent.
