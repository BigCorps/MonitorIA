# Aplicação — MonitorIA v0.8.2

## Backend

O backend já foi aplicado no Supabase via MCP.

Não execute manualmente as migrations em produção. Os arquivos SQL acompanham o ZIP
apenas para manter o histórico do repositório.

## Variáveis da Vercel

Confirme:

```env
ASSISTANT_MODEL=gpt-5-nano
AGENT_RECOMMENDED_VERSION=0.8.1
```

Quando o executável comercial estiver hospedado em uma URL HTTPS:

```env
AGENT_WINDOWS_DOWNLOAD_URL=https://seu-endereco/monitoria-agent.exe
```

Sem essa última variável, a página Instalador mostra que o download
comercial ainda não foi publicado.

## Repositório

Extraia o ZIP na raiz do projeto:

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
git commit -m "feat: adiciona Pesquisa conversacional e Instalador v0.8.2"
git push origin main
```

## Validação

### Eventos

1. escolha um período;
2. aplique os filtros;
3. copie o Markdown;
4. baixe o JSON;
5. confirme que o arquivo contém todos os resultados, não apenas a página.

### Pesquisa

Pergunte:

```text
Quantas aparições de clientes tivemos hoje?
Houve entregas pela manhã?
Mostre situações com pacotes no balcão.
Quantos eventos tiveram sinais de atendimento?
Compare hoje com ontem.
```

Confirme que eventos aparecem somente como evidências da resposta.

### Instalador

Confira:

- status online;
- versão do Agent;
- heartbeat;
- CPU, memória, disco e fila;
- comportamento do botão de download.
