# Arquitetura de saúde e drift

```text
FFmpeg local captura 160×90 em tons de cinza
        ↓
Agent calcula métricas e grade 16×9
        ↓
API autentica Agent e câmera
        ↓
PostgreSQL compara com referência aprovada
        ↓
Incidente observando → aberto → resolvido
        ↓
Dashboard, Assistente, MCP e operational_insights
```

Não há chamada generativa adicional e a amostra periódica não é armazenada como imagem. O hash representa o quadro reduzido e serve apenas para continuidade técnica.

## Métricas

- média de luminosidade;
- desvio-padrão de contraste;
- densidade de bordas;
- variância do Laplaciano como sinal de nitidez;
- proporção de pixels escuros e claros;
- assinatura espacial de 144 células;
- distância normalizada da referência.

## Estados

`unknown`, `learning`, `healthy`, `degraded`, `critical`, `offline`.
