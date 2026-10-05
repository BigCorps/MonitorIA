# AGENTS.md — regras obrigatórias do MonitorIA

Este arquivo é a primeira leitura obrigatória para qualquer agente, pessoa ou automação que altere o repositório.

## 1. Ordem das fontes de verdade

Quando houver conflito, use esta ordem:

1. código, testes e migrations atualmente no `main`;
2. `AGENTS.md`;
3. `README-CONTINUIDADE.md`;
4. `docs/PRODUCT-CONTRACT.md`;
5. `README.md`;
6. documentação operacional específica ainda mantida em `docs/`;
7. histórico do Git.

Documentos removidos ou commits antigos explicam como chegamos até aqui, mas não definem o estado atual.

## 2. Produto atual

- Produto: MonitorIA.cam.
- Domínio padrão: `https://monitoria.cam`.
- VIP: `https://vip.monitoria.cam`.
- Stack web: Next.js 16.3.8, React 19, TypeScript, Node 22.x, Supabase e Vercel.
- Slogan: importar de `src/lib/app-config.ts`; nunca duplicar texto.
- O produto é masculino: **o MonitorIA**.

## 3. Agent congelado

O Core atual é **MonitorIA Agent 1.0.3**.

**Não alterar `agent/**`, installers, hosts nativos, FFmpeg local ou workflows de release do Agent** em Gates web/backend/comerciais. Melhorias de runtime local ficam em `docs/MONITORIA-AGENT-1.0.4-BACKLOG.md` e só entram numa atualização 1.0.4 consolidada.

Atenção: `agent/package.json` ainda contém superfícies legadas 1.0.2. Não “corrigir” isso isoladamente. O contrato 1.0.3 usa `agent/src/index-v103.ts` e os workflows específicos de 1.0.3.

## 4. Standard e VIP compartilham o core

- Standard e VIP devem reaproveitar motores, componentes e contratos comuns sempre que possível.
- VIP não é um segundo produto técnico; comercialmente usa Projetos/pacotes próprios, mas todas as câmeras VIP usam o plano técnico `intensive`.
- “Online” nunca significa automaticamente “Monitorando”.
- Ausência de acontecimentos não prova falha.
- Continuidade entre câmeras/pessoas é correspondência provável e não biometria.

## 5. Política de IA durante o piloto Luna

Fonte técnica: `src/ai/model-policy.ts`.

- Standard: `gpt-5-nano`.
- VIP: `gpt-6-luna` em piloto.
- Um cliente Standard no plano Detalhada/`intensive` continua em nano.
- O vínculo com Projeto VIP, e não o plano `intensive`, seleciona Luna.
- Vision com Luna usa reasoning `low`; nano mantém `minimal`.
- Não promover Luna ao Standard sem aprovação explícita após os testes VIP.
- Pesquisa IA continua determinística sempre que possível; OpenAI é fallback quando necessário.

## 6. Supabase e Vercel

Acesso de inspeção pode ser usado para diagnóstico.

Sem pedido explícito do responsável:
- não aplicar migration;
- não executar `update`, `delete` ou alteração de configuração em produção;
- não mudar variáveis de ambiente;
- não disparar deploy manual;
- não alterar domínio ou billing.

Migrations já aplicadas são histórico executável: **nunca apagar ou reescrever migrations antigas**.

Projeto Supabase MonitorIA: `xwejfayeackbrilipgrj`.
Projeto Vercel MonitorIA: `prj_5YEoHm2nwgMhcQZooDGSYm4okdvk`.

## 7. Privacidade e segurança

- Credenciais de câmera permanecem locais e nunca devem aparecer no servidor, logs ou UI.
- Não implementar reconhecimento facial ou identificação civil.
- Não prometer leitura de placas.
- Nunca mostrar RTSP, senha, IP privado ou erro técnico cru ao cliente.
- Clarity pode acompanhar a landing pública VIP, mas **não deve carregar em dashboard, onboarding privado ou telas com evidências de câmera**.
- Buckets/evidências privadas usam acesso controlado/URL assinada conforme o fluxo existente.

## 8. Linguagem para o cliente

Evitar na UI comum: `ONVIF`, `RTSP`, `snapshot`, `frame`, `payload`, `token`, `endpoint`, `RLS`, `SMTP`, `polling`, `x64`, `Agent`.

DVR e NVR podem aparecer. Mensagem de erro deve explicar o que o cliente pode fazer.

## 9. Entrega e validação

Fluxo habitual:
1. preparar arquivos completos ou pacote para Codespace;
2. responsável aplica e faz commit/push;
3. confirmar SHA no GitHub;
4. confirmar Actions;
5. confirmar deploy Vercel no mesmo SHA;
6. verificar erros de runtime.

Antes de considerar um Gate concluído:

```bash
npm run check
npm test
npm run build
```

Build local pode exigir variáveis de ambiente que só existem no Vercel. Nesse caso, TypeScript/testes verdes + build Vercel READY no mesmo SHA são a validação de produção.

Não fazer push direto no GitHub sem pedido explícito.
