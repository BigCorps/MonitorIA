# Partner Center — MonitorIA 1.0.0

Guia para preencher a primeira submissão MSI/EXE do MonitorIA.

## Pré-requisito

Não enviar para certificação antes de existir:

```text
https://github.com/BigCorps/MonitorIA/releases/download/agent-v1.0.0/MonitorIA-Store-Setup.exe
```

A URL precisa baixar diretamente o instalador final assinado.

## Produto

- Nome: `MonitorIA`
- Tipo: aplicativo MSI/EXE
- Publisher: `BIGCORPS TECNOLOGIA LTA`

## Availability

- Price: `Free`
- Discoverability: disponível/pesquisável na Microsoft Store
- Mercado inicial: Brasil
- Trial da Microsoft Store: não usar; o serviço possui seu próprio fluxo de teste no painel

## Properties

- Category: `Business`
- Subcategory: `Security`, se disponível
- Website: `https://monitoria.cam`
- Support: `https://monitoria.cam/contato`
- Privacy policy: `https://monitoria.cam/privacidade`
- Terms: `https://monitoria.cam/termos`

## Age ratings

Responder o questionário IARC conforme o conteúdo real do produto.
Não escolher uma classificação manualmente por público-alvo.

## Packages

### Package URL

```text
https://github.com/BigCorps/MonitorIA/releases/download/agent-v1.0.0/MonitorIA-Store-Setup.exe
```

### Package metadata

- Architecture: `x64`
- App type: `EXE`
- Language: `Português (Brasil)`
- Minimum Windows: `Windows 10 1809 (build 17763)`

### Silent install

```text
/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-
```

### Silent uninstall

```text
/VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

### Custom return codes

Não cadastrar códigos personalizados se o formulário não exigir. Usar o
comportamento padrão do instalador.

## Store listing

### Nome

```text
MonitorIA
```

### Descrição curta

```text
Conecte câmeras IP, DVR e NVR ao MonitorIA e pesquise por texto o que aconteceu no seu negócio.
```

### Descrição longa

Usar a versão de `store-assets/LEIA-ME.md`.

### Search terms

```text
câmera IP, DVR, NVR, RTSP, monitoramento, vigilância, câmeras de segurança, CFTV, eventos, pesquisa por câmera
```

### Logo

Usar primeiro:

```text
store-assets/logo-300x300.png
```

Se o formulário pedir resolução maior:

```text
store-assets/logo-2160x2160.png
```

### Screenshots

Mínimo operacional: 1.
Meta MonitorIA: 4 a 6 screenshots reais após validação final do dashboard.

## Certification notes

O MonitorIA instala um serviço NT/Windows e exige login no painel. Portanto,
as notas de certificação devem explicar claramente como testar.

Conta:

```text
reviewer@monitoria.cam
```

Organização:

```text
MonitorIA Review Demo
```

A senha deve ser preenchida apenas no Partner Center, nunca neste arquivo.

Copiar as notas prontas de:

```text
store-assets/LEIA-ME.md
```

## Depois de enviar

- não substituir `MonitorIA-Store-Setup.exe`;
- não mover/apagar a release `agent-v1.0.0`;
- não alterar a URL enviada;
- acompanhar o status da certificação no Partner Center;
- se o binário precisar mudar, publicar nova versão e nova URL;
- correções apenas de dashboard/backend podem continuar normalmente desde que
  não invalidem o fluxo demonstrado à Microsoft.
