# MonitorIA 1.0.1 — reenvio Microsoft Store

## O que mudou no binário

- versão do Agent: **1.0.1**;
- única alteração funcional: após uma câmera ser descoberta e vinculada com RTSP já validado, o Agent solicita imediatamente o primeiro snapshot;
- o ciclo periódico de 5 minutos continua intacto como fallback;
- nenhuma alteração em ONVIF, parsing de DVR/NVR, credenciais, armazenamento local, serviço Windows, FFmpeg, DPAPI, pareamento ou monitoramento contínuo.

## Pacote

- Tipo: `EXE`
- Arquitetura: `x64`
- Idioma: `Português (Brasil)`
- Instalação silenciosa: `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`
- Desinstalação silenciosa: `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART`
- Versão: `1.0.1`

> Use no Partner Center uma **nova URL HTTPS direta, versionada e sem redirecionamento**.
> No envio 1.0.0, a URL que passou pela validação foi hospedada diretamente em Vercel Blob.
> Não substitua o conteúdo da URL 1.0.0. Faça upload do novo arquivo como, por exemplo,
> `MonitorIA-Store-Setup-1.0.1.exe` e informe a nova URL.

## Declaração de serviço NT

Mantenha marcada a declaração de que o produto depende de **non-Microsoft drivers or NT services**, pois o MonitorIA instala o serviço Windows próprio `MonitorIAAgent`.

## Notes for certification (copiar em inglês)

**Clarification regarding policy 10.2.4.2 – non-Microsoft drivers / NT services**

MonitorIA does **not install or depend on any kernel-mode, device, or third-party hardware driver**.

The product installs one first-party Windows NT service named **MonitorIAAgent / MonitorIA Agent**. This service is part of the MonitorIA product and is required for the app's primary functionality: continuous local communication with ONVIF/RTSP security cameras while the web dashboard is closed.

Installed service components:
- Service name: `MonitorIAAgent`
- Service executable/wrapper: `monitoria-service.exe`
- Main application process: `monitoria-agent.exe`
- Publisher: `BIGCORPS TECNOLOGIA LTA`

The service runs locally, communicates with cameras on the customer's local network, and sends MonitorIA application data to our backend. It does not install a kernel driver, filter driver, virtual device, network driver, or hardware driver.

The service is installed and removed by the MonitorIA installer. Uninstalling MonitorIA stops and deletes the `MonitorIAAgent` Windows service and removes its local application data.

We declared “non-Microsoft drivers or NT services” in Partner Center because MonitorIA uses this Windows NT service, not because the product contains a non-Microsoft driver.

Please evaluate the submission as a dependency on the first-party **MonitorIA NT service**, rather than as a non-Microsoft driver. This service is essential for uninterrupted camera monitoring.

Product ID: `58a13316-402e-4bb9-beb3-28d224d02d01`

## Descrição curta da dependência para a listagem

> **Requisito para monitoramento contínuo:** o MonitorIA instala um serviço Windows próprio chamado “MonitorIA Agent”, necessário para manter a conexão local com as câmeras mesmo quando o painel não está aberto.
