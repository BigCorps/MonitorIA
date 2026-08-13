# MonitorIA — Handoff para publicação do Agent na Microsoft Store

## Estado atual

* Versão candidata: **0.15.3**
* Instalador: Inno Setup
* Windows x64
* Serviço: `MonitorIAAgent`
* Publicador: `BIGCORPS TECNOLOGIA LTA`
* Assinatura digital já integrada ao GitHub Actions
* Instalação, pareamento e desinstalação validados
* Teste em DVR real ainda pendente
* Promover para **1.0.0 somente após o teste de DVR**

## Caminho recomendado

Usar o caminho oficial **MSI/EXE (Win32)** da Microsoft Store, mantendo o instalador EXE atual.

Requisitos principais da Microsoft:

1. EXE/MSI standalone/offline;
2. instalador e arquivos PE assinados;
3. certificado encadeado a CA aceita pelo Microsoft Trusted Root Program;
4. URL HTTPS direta e versionada;
5. binário imutável depois de submetido;
6. instalação silenciosa;
7. UAC é permitido.

## Instalador da Store

O pacote de implementação prepara um segundo artefato:

`MonitorIA-Store-Setup.exe`

Parâmetros silenciosos para o Partner Center:

```text
/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-
```

O pareamento continua sendo feito depois da instalação, pelo dashboard.

## Teste obrigatório

Em Windows limpo/VM:

```powershell
$p = Start-Process `
  ".\MonitorIA-Store-Setup.exe" `
  -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-" `
  -Wait -PassThru
$p.ExitCode
```

Esperado: `0`.

Validar também:

* nenhuma UI do instalador;
* serviço `MonitorIAAgent` instalado;
* arquivos em `C:\Program Files\MonitorIA`;
* Agent aguardando pareamento;
* pareamento posterior pelo dashboard;
* desinstalação limpa.

Conferir assinatura de todos os PE:

```powershell
Get-ChildItem "C:\Program Files\MonitorIA" -Recurse -Include *.exe,*.dll |
  ForEach-Object {
    [PSCustomObject]@{
      Arquivo = $_.FullName
      Status = (Get-AuthenticodeSignature $_.FullName).Status
    }
  }
```

Todos devem retornar `Valid`.

## URL do pacote

Recomendado:

```text
https://monitoria.com/downloads/windows/0.15.3/MonitorIA-Store-Setup.exe
```

Não sobrescrever esse binário depois de submetido.

## Partner Center

Preparar:

* Nome: MonitorIA
* Publicador: BIGCORPS TECNOLOGIA LTA
* Tipo: EXE
* Arquitetura: x64
* Parâmetros: `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`
* política de privacidade;
* termos;
* suporte;
* screenshots;
* ícone;
* descrição curta e longa;
* conta/instruções de demonstração para certificação.

Texto sugerido para notas de certificação:

> MonitorIA é um agente Windows para conectar câmeras IP/DVR/NVR ao painel web MonitorIA. O instalador da Store é silencioso. Após a instalação, o usuário acessa o dashboard web, gera um código de pareamento e conecta o computador. O software instala o serviço Windows MonitorIAAgent. Nenhuma credencial de câmera é necessária durante a instalação.

## Certificação

A documentação oficial da Microsoft informa que a certificação de aplicativos MSI/EXE pode levar **até 3 dias úteis**.

## Trial de 24 horas

O fluxo atual é:

1. 24h de captura gratuita;
2. período de exploração;
3. expiração.

Ao chegar em `capture_ends_at`, o entitlement deixa de permitir novo monitoramento e o trial entra em `exploration`.

O cron `/api/cron/trials` já roda a cada 5 minutos.

## E-mail ao fim das 24h

O pacote adiciona:

* tabela idempotente `trial_email_notifications`;
* envio via Resend reutilizando `RESEND_API_KEY` e `RESEND_FROM`;
* um único e-mail por trial;
* retry em caso de falha;
* CTA para `/dashboard/plans`.

Mensagem principal:

> Seu período gratuito de monitoramento terminou. A câmera não continuará gerando novos acontecimentos durante o período de exploração. Seus resultados continuam disponíveis até a data indicada. Escolha um plano para continuar o monitoramento.

A migration correspondente já foi aplicada ao Supabase de produção via MCP.

## Ordem para o outro agente

1. aplicar o ZIP no repositório;
2. `npm install`;
3. `npm run check`;
4. `npm test`;
5. revisar `git diff`;
6. commit/push;
7. conferir Vercel;
8. conferir GitHub Actions;
9. baixar `MonitorIA-Store-Setup-0.15.3`;
10. testar modo silencioso;
11. validar Authenticode;
12. hospedar em URL HTTPS versionada;
13. criar submissão no Partner Center;
14. enviar pacote + parâmetros;
15. enviar materiais de listagem;
16. acompanhar certificação;
17. após DVR real, promover para 1.0.0.

## Fontes oficiais Microsoft

* Microsoft Learn: App package requirements for MSI/EXE app
* Microsoft Learn: Upload app packages for MSI/EXE app
* Microsoft Learn: How to distribute your Win32 application through Microsoft Store
* Microsoft Learn: App certification process for MSI/EXE
