# MonitorIA — publicação do Agent 1.0.0 na Microsoft Store

Caminho oficial **MSI/EXE (Win32)**, mantendo o instalador Inno Setup atual.
A Microsoft baixa o instalador a partir de uma URL HTTPS versionada informada
no Partner Center e executa a instalação silenciosa.

## Estado real do 1.0.0

- Versão candidata/final: **1.0.0**
- Agent Windows: **pronto**
- Agent Linux x64/arm64: **pronto**
- DVR real: **testado e aprovado**
- Instalador: Inno Setup 6 (`installer/monitoria.iss`)
- Windows 10 1809+ (`MinVersion=10.0.17763`), x64
- Serviço: `MonitorIAAgent`
- Publicador: `BIGCORPS TECNOLOGIA LTA`
- Assinatura: SSL.com eSigner via GitHub Actions
- Partner Center: **conta aprovada**
- Backend Supabase: produção
- Frontend Vercel: produção
- Próxima etapa: gerar a release imutável `agent-v1.0.0` e enviar ao Partner Center

> `LTA` está correto e deve permanecer idêntico no workflow, instalador,
> certificado e nome de exibição do editor no Partner Center.
>
> Domínio de produção: **monitoria.cam**.

## Requisitos do pacote para a Store

O pacote usado na Store deve continuar obedecendo a estes pontos:

1. instalador `.exe` standalone/offline;
2. todos os arquivos PE instalados assinados;
3. assinatura encadeada a uma autoridade confiável pela Microsoft;
4. URL HTTPS direta e versionada;
5. binário imutável depois do envio à certificação;
6. instalação silenciosa;
7. desinstalação silenciosa;
8. arquitetura x64;
9. elevação UAC permitida porque o Agent instala um serviço Windows.

## Validações já feitas pelo workflow

O workflow `.github/workflows/build-agent.yml` gera:

| Arquivo | Uso |
|---|---|
| `MonitorIA-Setup.exe` | download normal pelo MonitorIA |
| `MonitorIA-Store-Setup.exe` | Microsoft Store |

O passo `Resumo do build` valida os dois instaladores:

- arquivo realmente gerado;
- assinatura Authenticode `Valid`;
- carimbo de tempo;
- editor contendo `BIGCORPS TECNOLOGIA LTA`;
- certificado com validade suficiente;
- SHA256 apresentado no resumo do Actions.

As dependências FFmpeg usadas no Agent 1.0.0 estão congeladas em assets
versionados do próprio repositório MonitorIA e validadas por SHA256.

## Fluxo sem Codespace — somente GitHub web

Não é necessário terminal para publicar a versão.

### 1. Teste manual final do workflow

No GitHub:

1. abra **Actions**;
2. escolha **Build MonitorIA Agent**;
3. clique em **Run workflow**;
4. branch: `main`;
5. execute;
6. confirme que `Instalador Windows x64` termina verde;
7. abra `Resumo do build` e confirme que o instalador Microsoft Store aparece
   com assinatura `Valid` e carimbo de tempo.

Opcionalmente, faça o mesmo em **Build MonitorIA Agent (Linux)** para validar
x64 e arm64 antes da tag oficial.

### 2. Criar tag e release pela interface do GitHub

Depois do workflow manual verde:

1. abra **Releases**;
2. clique em **Draft a new release**;
3. em **Choose a tag**, digite exatamente `agent-v1.0.0`;
4. escolha criar a nova tag a partir de `main`;
5. título: `MonitorIA Agent 1.0.0`;
6. use o texto de `store-assets/RELEASE-NOTES-1.0.0.md`;
7. clique em **Publish release**.

A criação da tag `agent-v1.0.0` dispara automaticamente os workflows oficiais
Windows e Linux.

**Não faça upload manual dos instaladores na release.**
O próprio GitHub Actions adicionará os arquivos após o build.

### 3. Confirmar a release oficial

A release `agent-v1.0.0` deve conter pelo menos:

- `MonitorIA-Setup.exe`
- `MonitorIA-Store-Setup.exe`

O instalador da Store deve estar disponível em:

```text
https://github.com/BigCorps/MonitorIA/releases/download/agent-v1.0.0/MonitorIA-Store-Setup.exe
```

Depois de informar essa URL no Partner Center, **não substitua o arquivo**.
Para qualquer correção futura, use uma nova versão/tag e uma nova URL.

## Validação local do instalador da Store

Baixe `MonitorIA-Store-Setup.exe` da release oficial.

O repositório já contém:

```text
scripts/validar-instalador-store.ps1
```

Validação somente da assinatura:

```powershell
.\scripts\validar-instalador-store.ps1 `
  -Instalador .\MonitorIA-Store-Setup.exe -SomenteAssinatura
```

Validação completa em Windows limpo/VM:

```powershell
.\scripts\validar-instalador-store.ps1 `
  -Instalador .\MonitorIA-Store-Setup.exe
```

Também pode conferir o SHA256:

```powershell
(Get-FileHash .\MonitorIA-Store-Setup.exe -Algorithm SHA256).Hash
```

## Partner Center — pacote

| Campo | Valor |
|---|---|
| Product name | `MonitorIA` |
| Package URL | `https://github.com/BigCorps/MonitorIA/releases/download/agent-v1.0.0/MonitorIA-Store-Setup.exe` |
| App type | `EXE` |
| Architecture | `x64` |
| Language | `Português (Brasil)` |
| Silent install | Sim |
| Installer parameters | `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-` |
| Silent uninstall parameters | `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART` |
| Minimum Windows | Windows 10 1809 / build 17763 |
| Publisher | `BIGCORPS TECNOLOGIA LTA` |

## Partner Center — propriedades

- Categoria principal: **Business**
- Subcategoria: **Security**, se disponível na interface
- Site: `https://monitoria.cam`
- Política de privacidade: `https://monitoria.cam/privacidade`
- Termos: `https://monitoria.cam/termos`
- Suporte: `https://monitoria.cam/contato`

## Pricing and availability

- Preço do aplicativo/Agent: **Free**
- O trial e os planos do serviço MonitorIA continuam no painel web.
- A listagem deve ser pesquisável na Microsoft Store.

## Materiais da Store

Arquivos já existentes:

- `store-assets/logo-300x300.png`
- `store-assets/logo-2160x2160.png`

Ainda precisam ser produzidas as screenshots finais depois da validação visual
do onboarding/dashboard. A Store exige pelo menos 1; usar 4 ou mais é o ideal.

Ver:

```text
store-assets/LEIA-ME.md
store-assets/PARTNER-CENTER-1.0.0.md
```

## Conta de certificação

Conta prevista para revisão:

```text
reviewer@monitoria.cam
```

Organização:

```text
MonitorIA Review Demo
```

Antes de enviar à certificação:

- definir uma senha forte exclusiva;
- não versionar a senha no GitHub;
- confirmar login em janela anônima;
- garantir acesso durante todo o período de certificação;
- garantir que o trial de 24 horas não impeça o avaliador de concluir os testes;
- usar apenas dados sintéticos.

## Ordem final

1. aplicar este ZIP no `main`;
2. aguardar o deploy normal ficar saudável;
3. executar manualmente **Build MonitorIA Agent** em `main`;
4. confirmar assinatura e `MonitorIA-Store-Setup.exe`;
5. criar/publish a tag/release `agent-v1.0.0` pelo GitHub web;
6. aguardar o build por tag terminar verde;
7. confirmar os assets da release;
8. baixar e validar o `MonitorIA-Store-Setup.exe`;
9. confirmar conta `reviewer@monitoria.cam`;
10. preencher o Partner Center;
11. adicionar screenshots finais;
12. enviar para certificação;
13. não alterar o binário/URL submetidos;
14. enquanto a Microsoft certifica, validar onboarding e dashboard em produção;
15. qualquer correção posterior ao binário vira uma nova versão (ex.: `1.0.1`).
