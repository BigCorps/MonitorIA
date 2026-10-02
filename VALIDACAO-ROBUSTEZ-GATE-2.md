# Validação — Robustez Gate 2/3

## Base analisada

- Repositório: `BigCorps/MonitorIA`
- Branch: `main`
- Base: `593eaf36ebccf6a88f24e31870d92711726f8e6c`
- Vercel da base: `success`
- Supabase MonitorIA: consultado somente em leitura
- migrations: conferidas antes da implementação
- migration nova neste Gate: **nenhuma**
- `agent/**`: **não alterado**

## Frontend analisado

- `DiscoveryPanel` e UX da busca;
- página de descoberta por Local/Agent;
- fluxo compartilhado usado por onboarding;
- resultado atual por aparelho;
- experiência VIP/padrão compartilhada.

## Backend analisado

- `startDiscoveryAction` / `getDiscoveryStatusAction`;
- `discovery_runs`;
- `/api/agent/discovery/complete`;
- `/api/agent/cameras/discovered`;
- `cameras`;
- `agent_cameras`;
- `agents`;
- `sites`;
- fluxo histórico de troca/reparo de computador.

## Validações locais executadas

- parser TypeScript/TSX dos arquivos do overlay: **OK**;
- `tsc --strict` do motor puro `discovery-review.ts`: **OK**;
- testes puros do Gate 2: **OK**;
- cenário `paired` + Agent antigo `disabled`: **ID antigo reaproveitado**;
- câmeras do mesmo fabricante/modelo sem nome inequívoco: **não geram match forte**;
- classificação de nova/já cadastrada/outro Local/indisponível: **OK**;
- scan `gpt-5-mini`: **0 ocorrências**;
- scan de secrets literais: **0 ocorrências**;
- registro web de descoberta: **sem `rtspUrl`, `cameraHost` ou `password`**;
- arquivos em `agent/**` no overlay: **0**.

## Contratos antigos atualizados

O overlay também corrige dois testes que ainda cobravam comportamento anterior embora a implementação atual esteja correta:

- `test/team-invitations.test.ts`: passa a validar **Abrir convite + código próprio de 6 dígitos**, em vez de exigir o texto antigo “Aceitar convite”;
- `test/trial-camera-ux.test.ts`: passa a validar o estado real de `StandardCameraHealth`/`monitorActive`, em vez da copy antiga “Monitoramento iniciado”;
- `test/vip-landing-premium.test.ts`: preserva o contrato de animação SVG sem exigir que toda cena use especificamente `styles.sWipe`.

O teste histórico de troca/reparo também foi atualizado para aceitar o novo contrato: o endpoint continua compatível com `pairing/unpaired`, mas agora tolera também `paired` órfão e vínculo obsoleto de Agent `disabled`.

## O que ainda precisa ser validado após upload

O ambiente desta montagem não contém um checkout completo com `node_modules`; portanto não afirmo que o `npm run check`, `npm test` e `npm run build` completos passaram localmente.

Depois que o overlay estiver no GitHub, conferir no mesmo SHA:

1. `npm run check`;
2. suíte completa `npm test`;
3. Next build;
4. GitHub Actions verde;
5. Vercel `READY`/success;
6. smoke de descoberta em um Local com câmera já cadastrada;
7. smoke de nova câmera;
8. smoke de conflito/possível duplicata;
9. confirmar que nenhum registro real foi apagado.

Não é necessário executar migration nem alterar o Agent para este Gate.
