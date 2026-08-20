# MonitorIA Agent 1.0.1

Atualização de manutenção do Agent 1.0.0 validado.

## Alteração

- antecipa o envio da primeira imagem logo após a descoberta e vinculação da câmera, reduzindo a espera do onboarding;
- mantém o ciclo periódico de 5 minutos como fallback caso a captura ou o upload imediato falhem.

## Preservado sem alterações funcionais

- descoberta ONVIF + varredura local;
- câmeras de aplicativo e DVR/NVR multicanal;
- recuperação de IP por MAC;
- credenciais armazenadas somente no computador;
- FFmpeg congelado e validado por SHA256;
- serviço Windows `MonitorIAAgent`;
- DPAPI, pareamento, assinatura e desinstalação;
- monitoramento, eventos e clipes.
