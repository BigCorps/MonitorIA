# MonitorIA 1.0.3 — Entrega 05B7: Store Final UX / Certification

## Objetivo

Fechar o risco de UX/certificação em que a edição Microsoft Store ativava início automático no Windows apenas por ter sido instalada. A Store passa a tratar autostart como **preferência explícita do usuário**, sem alterar o Core 1.0.3, o pareamento, a fila, a descoberta ou a edição 24/7.

## Mudanças

### Launcher Store de consentimento

Novo `monitoria-store-launcher.exe`, compilado a partir de `agent/native/store-startup-consent.c` e assinado pelo mesmo pipeline dos outros PEs.

Primeira abertura manual:

1. pergunta se o usuário deseja iniciar o MonitorIA automaticamente ao entrar no Windows;
2. opção começa desligada;
3. `Não` é o botão padrão;
4. `Sim` cria somente `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\MonitorIA`;
5. a escolha é salva por usuário;
6. depois abre o Desktop Host normal.

O Menu Iniciar oferece também `MonitorIA — Inicialização automática`, que executa `--startup-settings` para permitir ativar/desativar a preferência depois.

### Upgrade de RC antigo

O instalador remove a entrada Run legada criada automaticamente por RCs anteriores. Ele **não** cria uma nova entrada.

Se já existir uma escolha registrada pela arquitetura 05B7, o launcher reaplica exatamente essa escolha após um upgrade. Assim um update não desliga permanentemente o opt-in anterior e também não inventa consentimento novo.

### Instalação silenciosa

O workflow RC agora instala de verdade o Setup Store com:

`/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`

A etapa falha se:

- o instalador retornar erro;
- algum PE obrigatório não estiver presente/assinado/timestamped;
- a instalação criar Run sem consentimento;
- qualquer processo MonitorIA iniciar sozinho;
- o launcher instalado falhar no self-test;
- a desinstalação silenciosa deixar arquivos ou autostart.

## Invariantes preservados

- `PrivilegesRequired=lowest`.
- `%LOCALAPPDATA%\\Programs\\MonitorIA`.
- Store não instala/gerencia Windows Service.
- Desktop Host continua matando somente seu Core filho por Job Object.
- Desinstalação Store não finaliza a edição 24/7 por nome.
- Pareamento e dados em `%LOCALAPPDATA%\\MonitorIA` permanecem no mesmo Core.
- Setup/uninstaller assinados.
- UTF-8/mojibake guard permanece e passa a cobrir também o launcher.
- RC continua manual, sem tag/release/publicação.

## Arquivos desta entrega

- `.github/workflows/build-release-candidate-v103.yml`
- `.github/workflows/validate-release-candidate-v103.yml`
- `agent/native/store-startup-consent.c`
- `agent/native/store-startup-consent.manifest`
- `agent/native/store-startup-consent.rc`
- `installer/monitoria-store-v103.iss`
- `test/agent-0103-release-candidate-contract.test.ts`
- `test/agent-0103-store-install-experience.test.ts`
- `docs/MONITORIA-1.0.3-MICROSOFT-STORE-CERTIFICATION.md`
- `docs/MONITORIA-1.0.3-ENTREGA-05B7-STORE-CERTIFICATION-UX.md`

## Próxima prova

1. subir estes arquivos no `main`;
2. aguardar `Validate MonitorIA 1.0.3 Release Candidate Contract`;
3. se verde, gerar novo RC manual;
4. conferir o job Windows, incluindo a nova etapa de silent install;
5. instalar o novo Store RC em máquina de teste e validar consentimento Não/Sim + login;
6. seguir para política de privacidade/listing e submissão apenas depois das provas.
