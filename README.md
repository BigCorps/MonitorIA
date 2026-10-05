# MonitorIA.cam

**Sua câmera vê, o MonitorIA lembra!**

O MonitorIA transforma câmeras já instaladas em uma memória visual pesquisável. A gravação contínua permanece no ambiente do cliente; o sistema organiza acontecimentos, horários e evidências para que seja possível encontrar o que importa sem rebobinar horas de vídeo.

## Estado atual

- Web/produto: 1.0.3.
- Agent local: Core 1.0.3.
- Standard: produção comercial.
- VIP: venda assistida, piloto de 60 minutos e acompanhamento pelo vendedor.
- IA Standard: GPT-5 nano.
- IA VIP: piloto com GPT-6 Luna.

Para continuidade de trabalho, leia nesta ordem:

1. [`AGENTS.md`](./AGENTS.md)
2. [`README-CONTINUIDADE.md`](./README-CONTINUIDADE.md)
3. [`docs/PRODUCT-CONTRACT.md`](./docs/PRODUCT-CONTRACT.md)

## O que o MonitorIA faz

- organiza acontecimentos captados por câmeras;
- preserva horário, descrição e evidências selecionadas;
- permite busca por texto, filtros e Pesquisa IA;
- acompanha saúde e estado operacional das câmeras;
- suporta múltiplos usuários e locais;
- preserva vídeo do acontecimento quando o contrato técnico permite;
- mantém a gravação contínua no DVR/NVR/equipamento local.

O MonitorIA não substitui DVR/NVR, alarmes, vigilância humana ou procedimentos profissionais de segurança.

## Standard e VIP

O Standard usa os planos técnicos Essencial, Atenta e Detalhada.

O VIP usa Projetos e pacotes comerciais próprios, mas todas as câmeras VIP recebem tecnicamente o plano `intensive`. O VIP é apresentado por vendedores a leads selecionados e possui fluxo assistido de implantação, piloto, resultado e proposta.

Os valores, retenções e limites vigentes estão em [`docs/PRODUCT-CONTRACT.md`](./docs/PRODUCT-CONTRACT.md).

## Arquitetura

### Web/backend

- Next.js 16.3.8;
- React 19;
- TypeScript;
- Node 22.x;
- Supabase Postgres/Auth/Storage/RLS;
- Vercel;
- jobs/cron e telemetria.

### Agent local

O Agent roda na rede do cliente, conversa com as câmeras e mantém credenciais localmente. O Core 1.0.3 é usado nas distribuições atuais. Alterações futuras do runtime local estão congeladas para uma atualização 1.0.4 consolidada.

### Inteligência artificial

A Pesquisa IA tenta resolver perguntas deterministicamente. OpenAI é usada quando necessário para visão/perfil/fallback. A política de modelos está centralizada em `src/ai/model-policy.ts`.

## Desenvolvimento

Use Node 22.x.

```bash
npm ci
npm run check
npm test
npm run build
```

Variáveis de ambiente estão documentadas em `.env.example`.

Um build local pode depender de variáveis que só existem no ambiente Vercel. O deploy de produção deve sempre ser conferido no mesmo SHA aprovado pelos testes.

## Banco

Migrations ficam em `supabase/migrations/` e são histórico executável. Não apagar, reordenar ou reescrever migration já aplicada.

Mudanças de banco ou configuração de produção exigem pedido explícito.

## Privacidade

- vídeo contínuo permanece local;
- não há reconhecimento facial para identidade civil;
- continuidade visual é probabilística e não biométrica;
- credenciais de câmera não devem chegar ao backend;
- evidências privadas usam acesso controlado;
- Clarity não deve carregar em telas privadas com dados/evidências do cliente.

Documentos públicos e contratos de privacidade permanecem em `app/` e `docs/legal/`.

## Release do Agent

Contrato consolidado da release atual:

[`docs/releases/MONITORIA-1.0.3-CONTRACT.md`](./docs/releases/MONITORIA-1.0.3-CONTRACT.md)

Backlog da próxima atualização local:

[`docs/MONITORIA-AGENT-1.0.4-BACKLOG.md`](./docs/MONITORIA-AGENT-1.0.4-BACKLOG.md)

---

Desenvolvido pela **BigCorps Tecnologia**.
