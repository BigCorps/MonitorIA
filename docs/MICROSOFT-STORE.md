# MonitorIA — publicação do Agent na Microsoft Store

Caminho oficial **MSI/EXE (Win32)**, mantendo o instalador Inno Setup atual.
A Microsoft **não hospeda** o binário: ela baixa o arquivo da URL informada e o
executa em modo silencioso na máquina do usuário.

## Estado

- Versão candidata: **1.0.0**
- Instalador: Inno Setup 6 (`installer/monitoria.iss`)
- Windows 10 1809+ (`MinVersion=10.0.17763`), x64
- Serviço: `MonitorIAAgent`
- Publicador: `BIGCORPS TECNOLOGIA LTA`
- Assinatura: SSL.com eSigner via GitHub Actions
- Conta do Partner Center: **aprovada**
- Teste em DVR real: **pendente**
- Promover para **1.0.0 somente após o teste de DVR**

> `LTA` está correto. É a razão social registrada, não erro de digitação.
> O domínio de produção é **monitoria.cam**.

## Requisitos da Microsoft

1. EXE/MSI standalone e offline — nada é baixado durante a instalação;
2. instalador e todos os arquivos PE assinados;
3. certificado encadeado a CA do Microsoft Trusted Root Program;
4. URL HTTPS direta e **versionada**;
5. binário **imutável** depois de submetido;
6. instalação silenciosa retornando `0`;
7. UAC é permitido (`PrivilegesRequired=admin`).

## O nome do editor aparece em três lugares

Divergência entre eles reprova a certificação. Ao mudar um, mude os três:

| Onde | Campo |
|---|---|
| `.github/workflows/build-agent.yml` | `env.PUBLISHER_NAME` |
| `installer/monitoria.iss` | `#define AppPublisher` |
| Partner Center | Nome de exibição do editor |

O workflow compara o `Subject` do certificado com `PUBLISHER_NAME` e falha o
build se não bater.

## Artefatos do build

O CI gera dois instaladores a cada execução:

| Arquivo | Uso |
|---|---|
| `MonitorIA-Setup.exe` | download pelo painel (`/dashboard`) |
| `MonitorIA-Store-Setup.exe` | **Microsoft Store** |

Ambos passam pela mesma validação no passo `Resumo do build`: assinatura
`Valid`, carimbo de tempo presente, editor conferido e certificado com mais de
30 dias de validade.

## Publicar a versão

O `Publicar release` só roda em tag. Sem tag, o instalador existe apenas como
artifact do Actions — que expira em 30 dias e exige login, e por isso **não
serve como URL da Store**.

```bash
git tag agent-v1.0.0
git push origin agent-v1.0.0
```

## URL do pacote

```text
https://github.com/BigCorps/MonitorIA/releases/download/agent-v1.0.0/MonitorIA-Store-Setup.exe
```

Gerada por `storeInstallerUrlFor()` em `src/lib/installer-data.ts`, que rejeita
qualquer coisa fora do formato `X.Y.Z`.

**Nunca use `releases/latest/download` aqui.** Esse endereço muda sozinho na
próxima tag, e conteúdo mutável na URL submetida é motivo de remoção do app.
O painel continua usando `latest` de propósito — lá o comportamento desejado é
o oposto.

Mantenha a URL da versão anterior no ar até a nova ser publicada.

## Teste obrigatório

Em VM Windows 10/11 x64 limpa, com snapshot, como Administrador:

```powershell
# Só a assinatura, pode rodar na máquina de trabalho
.\scripts\validar-instalador-store.ps1 `
  -Instalador .\MonitorIA-Store-Setup.exe -SomenteAssinatura

# Completo: instala, valida e desinstala
.\scripts\validar-instalador-store.ps1 -Instalador .\MonitorIA-Store-Setup.exe
```

O script cobre exit code, ausência de UI, serviço `MonitorIAAgent`, arquivos em
`C:\Program Files\MonitorIA`, Authenticode de todos os PE, entrada em Programas
e Recursos, e desinstalação limpa incluindo `ProgramData\MonitorIA`.

Depois, manualmente: gerar código no painel, parear, confirmar que o Agent
conecta.

Confirme o SHA256 baixando a URL de fora da sua rede:

```powershell
Invoke-WebRequest -Uri "https://github.com/BigCorps/MonitorIA/releases/download/agent-v1.0.0/MonitorIA-Store-Setup.exe" -OutFile teste.exe
(Get-FileHash .\teste.exe -Algorithm SHA256).Hash
```

## Partner Center

### Packages

| Campo | Valor |
|---|---|
| Installer URL | `https://github.com/BigCorps/MonitorIA/releases/download/agent-v1.0.0/MonitorIA-Store-Setup.exe` |
| Installer type | EXE |
| Architecture | x64 |
| Silent install | Sim |
| Silent install parameters | `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-` |
| Silent uninstall parameters | `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART` |
| Minimum Windows version | Windows 10 1809 (build 17763) |
| Languages | Português (Brasil) |

### Properties

- Categoria: Business → Security (ou Utilities & tools)
- Política de privacidade: `https://monitoria.cam/privacidade`
- Termos: `https://monitoria.cam/termos`
- Site: `https://monitoria.cam`
- Suporte: `https://monitoria.cam/contato`

### Pricing and availability

Preço **Free**. Apps MSI/EXE não usam o comércio da Store; o trial de 24 h e os
planos continuam no painel, o que é permitido e é a única opção neste caminho.

### Materiais de listagem

Ver `store-assets/LEIA-ME.md`.

## Certificação

Até **3 dias úteis**. Se reprovar, o relatório aponta o motivo exato. Correção
no binário exige nova versão, nova tag, nova URL e nova submissão.

## Trial de 24 horas

1. 24 h de captura gratuita;
2. período de exploração;
3. expiração.

Ao chegar em `capture_ends_at`, o entitlement deixa de permitir novo
monitoramento e o trial entra em `exploration`. O cron `/api/cron/trials` roda
a cada 5 minutos.

O e-mail de fim de trial usa a tabela idempotente `trial_email_notifications`,
envio via Resend (`RESEND_API_KEY`, `RESEND_FROM`), um único e-mail por trial,
retry em falha e CTA para `/dashboard/plans`. Migration já aplicada em produção.

## Ordem de execução

1. aplicar os arquivos corrigidos;
2. `npm install`;
3. `npm run check`;
4. `npm test`;
5. revisar `git diff`;
6. commit e push na `main`;
7. conferir Vercel e GitHub Actions;
8. **teste em DVR real**;
9. `git tag agent-v1.0.0 && git push origin agent-v1.0.0`;
10. conferir a release e a URL do `MonitorIA-Store-Setup.exe`;
11. rodar `scripts/validar-instalador-store.ps1` em VM limpa;
12. preparar materiais de listagem e conta de demonstração;
13. criar a submissão no Partner Center;
14. acompanhar a certificação;
15. após validação em campo, repetir o ciclo para `1.0.0`.

## Fontes oficiais

- Microsoft Learn — App package requirements for MSI/EXE app
- Microsoft Learn — Upload app packages for MSI/EXE app
- Microsoft Learn — How to distribute your Win32 application through Microsoft Store
- Microsoft Learn — App certification process for MSI/EXE
