# Integração com Assistente e MCP

## Assistente

A intenção `operational_profiles` responde perguntas como:

- quais perfis operacionais estão ativos nesta câmera;
- em quais zonas um perfil costuma aparecer;
- quais faixas de horário foram observadas;
- existem candidatos ou correspondências pendentes;
- por que uma aparição foi associada a um perfil.

As respostas devem dizer “perfil provável”, “compatível” ou “correspondência visual”, nunca “identidade confirmada”.

## MCP

Nenhuma ferramenta pública é adicionada. A capacidade `operational_profiles` passa a `available` e os dados entram em:

```text
get_monitoria_capabilities
get_camera_overview
get_operational_summary
search_insights
ask_monitoria
```

O MCP recebe apenas resumos operacionais. Aparência bruta, candidatos completos e decisões internas não são expostos pelo papel somente leitura.
