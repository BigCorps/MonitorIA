# Aplicação — MonitorIA v0.8.2 correção 2

## Backend

O backend já foi aplicado via MCP.

Não execute manualmente a migration de gráficos em produção. O arquivo SQL
acompanha o ZIP somente para manter o repositório reproduzível.

## Repositório

Extraia o ZIP na raiz do projeto:

```bash
cd /workspaces/MonitorIA

npm run check
npm test
npm run build
```

Depois:

```bash
git add .
git commit -m "fix: adiciona graficos e historico recolhivel ao assistente"
git push origin main
```

## Validação

Teste estas perguntas:

```text
Gere um gráfico de linhas do movimento por hora de ontem e hoje.

Mostre um gráfico de barras das aparições de clientes e funcionários hoje.

Na câmera Entrada da Loja, quais horários tiveram mais movimento ontem?

Mostre as entregas de ontem na câmera Entrada da Loja.
```

Confirme também:

1. o histórico começa fechado;
2. o botão Conversas abre o painel sem diminuir o chat;
3. tocar fora fecha o painel;
4. a barra de rolagem do chat aparece clara;
5. o gráfico possui legenda e pode ser baixado em SVG;
6. o Agent não precisa ser atualizado ou reiniciado.
