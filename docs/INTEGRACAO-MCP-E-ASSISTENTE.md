# Assistente e MCP

A INT-7 adiciona a intenção interna `camera_health` ao Assistente.

Exemplos:

- “Alguma câmera está com a imagem ruim?”
- “A câmera do estoque mudou de posição?”
- “Há câmeras sem observação recente?”
- “Por que o MonitorIA considera a imagem desfocada?”

O MCP público mantém as 14 ferramentas congeladas. `camera_health` entra como include opcional em `get_camera_overview` e `get_operational_summary`, e os incidentes aparecem em `search_insights` e `ask_monitoria`.

A capacidade `camera_health` muda de `planned` para `available`.
