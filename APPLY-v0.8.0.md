# Aplicação — MonitorIA v0.8.0

## Backend

O backend desta versão já foi aplicado no Supabase via MCP.

Não execute manualmente a migration em produção. O arquivo SQL acompanha
o patch apenas para manter o histórico do repositório.

## Repositório

Extraia este ZIP na raiz do projeto e execute:

```bash
cd /workspaces/MonitorIA

npm install --include=dev
npm run check
npm test
npm run build
```

Depois:

```bash
git add .
git commit -m "feat: adiciona eventos e pesquisa v0.8.0"
git push origin main
```

## Validação visual

1. Abra `/dashboard/cameras` e confirme que o card mostra o frame
   real da câmera.
2. Abra `/dashboard/events`.
3. Abra um evento e confira os quadros.
4. Salve uma avaliação humana.
5. Pesquise `balcão` em `/dashboard/search`.
6. Copie o resultado em Markdown e JSON.
7. Compare dois períodos.

## Assistente IA

Permanece fora desta versão. Será iniciado somente depois da
validação completa da fase 7.
