# MonitorIA 1.0.3 — Entrega 05A

## Release Candidate reproduzível, assinada e sem publicação

**Data:** 27/08/2026  
**Versão alvo:** 1.0.3  
**Fase:** 05 — Release Candidate  
**Etapa:** 05A  
**Status:** pipeline preparado; a execução da RC continua manual e não publica nada.

Esta entrega começa somente depois do fechamento da 04C. Ela não altera Core, backend, banco, download público ou Microsoft Store; organiza a geração dos candidatos finais a partir do mesmo commit.

## 1. O que entra nesta entrega

Novo workflow manual:

`.github/workflows/build-release-candidate-v103.yml`

Ele produz, no mesmo `github.sha`:

1. `MonitorIA-Setup.exe` — Windows 24/7 1.0.3;
2. `MonitorIA-Store-Setup.exe` — edição Microsoft Store 1.0.3;
3. `monitoria-agent-linux-x64.tar.gz`;
4. `monitoria-agent-linux-arm64.tar.gz`;
5. manifesto final com commit e SHA256.

O Core Windows é compilado uma única vez e reutilizado nos dois instaladores Windows. Isso evita qualquer divergência funcional entre Service Host e Desktop Host.

## 2. Assinatura Windows

A execução RC exige os mesmos segredos de eSigner já usados pelo pipeline de produção:

- `ESIGNER_USERNAME`;
- `ESIGNER_PASSWORD`;
- `ESIGNER_CREDENTIAL_ID`;
- `ESIGNER_TOTP_SECRET`.

Se qualquer um estiver ausente, o job Windows falha. Não existe RC Windows “verde” sem assinatura.

São validados assinatura Authenticode e carimbo de tempo do:

- Core;
- DPAPI;
- tray 24/7;
- Desktop Host Store;
- WinSW da edição 24/7;
- instalador 24/7;
- instalador Store.

O FFmpeg continua preso aos hashes oficiais já homologados e ao bundle LGPL sem GPL.

## 3. Separação dos hosts

A edição 24/7 usa obrigatoriamente:

`installer/monitoria-service-v103.iss`

Ela preserva Windows Service, WinSW, ProgramData e tray companion.

A edição Store usa obrigatoriamente:

`installer/monitoria-store-v103.iss`

O pipeline bloqueia referências a Service Control Manager, WinSW, `sc.exe`, `MonitorIAAgent` e arquivos do Service Host dentro da composição Store.

## 4. Linux

Os dois pacotes Linux usam `agent/src/index-v103.ts` e os mesmos bundles FFmpeg homologados da linha anterior.

Antes de criar o artifact, o workflow valida:

- `systemd-analyze verify`;
- serviço habilitado e ativo;
- `/var/lib/monitoria` com owner/permissão esperados;
- reinstalação preservando um arquivo-sentinela de estado;
- restart do serviço;
- `status` reportando `MonitorIA Agent v1.0.3`.

## 5. O que esta entrega deliberadamente NÃO faz

- não cria a tag `agent-v1.0.3`;
- não cria GitHub Release;
- não altera o release `latest`;
- não troca `AGENT_RECOMMENDED_VERSION`;
- não configura `MONITORIA_STORE_PUBLIC_URL`;
- não faz deploy na Vercel;
- não executa migration ou alteração no Supabase;
- não envia nada à Microsoft;
- não instala automaticamente a RC numa máquina real.

Os artifacts ficam temporários no GitHub Actions por 14 dias.

## 6. Ordem após subir este pacote

1. Aguardar `Validate MonitorIA 1.0.3 Release Candidate Contract` ficar verde.
2. Confirmar que os validadores anteriores 1.0.3 continuam verdes.
3. Em **Actions**, executar manualmente `Build MonitorIA 1.0.3 Release Candidate` com `candidate=rc1`.
4. O run só é aceito como RC se os jobs `contract`, `windows`, `Linux x64 RC`, `Linux arm64 RC` e `Release Candidate Manifest` ficarem verdes.
5. Baixar os artifacts da mesma execução e usar exclusivamente esses arquivos na matriz real descrita em `docs/MONITORIA-1.0.3-MATRIZ-RC.md`.
6. Se a matriz real encontrar bug, corrigir o bug, gerar `rc2` a partir do novo commit e repetir. Não criar 04D.
7. Somente depois da matriz 100% aprovada será preparada a publicação final/tag e o pacote de certificação Microsoft.

## 7. Observação de assinatura do instalador

Os executáveis internos são assinados antes da composição dos instaladores. Os dois `.exe` de instalação também recebem assinatura Authenticode e timestamp depois de compilados.

Antes da publicação definitiva, a auditoria da RC deve conferir também a experiência real de desinstalação/upgrade e a assinatura dos arquivos instalados. Se a Microsoft exigir assinatura específica do uninstaller interno do Inno Setup, isso deve ser tratado como ajuste de empacotamento da própria Fase 05 antes da tag final, sem alterar o Core.
