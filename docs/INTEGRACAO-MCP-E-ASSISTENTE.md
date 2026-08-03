# Integração com Assistente e MCP

## Assistente

Nova intenção:

```text
processes_actions
```

Perguntas previstas:

- Quais etapas do atendimento foram observadas?
- Houve algum processo incompleto hoje?
- Qual etapa ainda está pendente?
- Houve ações fora da sequência?
- Quais entregas tiveram transferência de objeto confirmada?
- O fechamento teve a etapa final visualmente confirmada?

A RPC usada é:

```text
assistant_operational_process_summary_v1
```

## MCP

Nenhuma ferramenta pública é adicionada.

A capacidade `processes` passa para `available`, e os dados entram em:

```text
get_monitoria_capabilities
get_camera_overview
get_operational_summary
compare_periods
search_insights
ask_monitoria
```

O toolset público continua `1.0.0` e somente leitura.
