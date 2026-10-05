> **Fixture de homologação:** este bridge é preservado apenas para testes/pilotos da Meeting. Não faz parte do runtime de produção do MonitorIA nem do Agent 1.0.3.

# MonitorIA — piloto Meeting: RTMP sem alterar o Agent + classificação criança/adulto

Base analisada: `BigCorps/MonitorIA` `main`, commit
`f1a232734e47f2d9ad7585e5ca6ec250e3acd00c`.

Este ZIP é um **overlay do repositório**. Extraia e envie os arquivos mantendo
os mesmos caminhos.

## Decisão de arquitetura

O Agent MonitorIA 1.0.3 existente **não é alterado para RTMP**.

Para a câmera RTMP do piloto, entra um sidecar separado:

```text
Servidor RTMP/RTMPS da Meeting
             │
             │ pull RTMP/RTMPS
             ▼
      MediaMTX sidecar
      (mesmo computador)
             │
             │ RTSP somente em 127.0.0.1
             ▼
   MonitorIA Agent 1.0.3 intacto
             │
             ▼
          MonitorIA
```

Isso preserva o Core homologado do Agent e isola o risco do protocolo novo.

O sidecar usa MediaMTX v1.21.1. A própria documentação do MediaMTX permite
usar uma URL `rtmp://` ou `rtmps://` como fonte e disponibilizar o mesmo path
para leitores RTSP. A configuração do pacote expõe RTSP apenas no loopback.

## Arquivos novos do bridge

`test/fixtures/meeting-rtmp-bridge/`

- `Install-MeetingRtmpBridge.ps1`
- `Start-MeetingRtmpBridge.ps1`
- `Update-MeetingRtmpSource.ps1`
- `Test-MeetingRtmpBridge.ps1`
- `Uninstall-MeetingRtmpBridge.ps1`
- `mediamtx.yml`
- `README.md`

O instalador:

1. baixa a versão fixada do MediaMTX;
2. baixa `checksums.sha256` da mesma release;
3. confere SHA-256 antes de extrair;
4. solicita a URL RTMP/RTMPS sem gravá-la em texto puro;
5. protege a URL com DPAPI `LocalMachine`;
6. restringe a pasta a SYSTEM e Administradores;
7. cria uma tarefa no boot executada como SYSTEM;
8. inicia o bridge;
9. deixa disponível `rtsp://127.0.0.1:8554/meeting`.

## O que pedir à Meeting

Para este fluxo, peça a **URL de reprodução** do stream no servidor deles,
não apenas a URL/chave usada pela câmera para publicar.

Exemplos de formato:

```text
rtmp://servidor/app/camera
rtmps://servidor/app/camera
```

Se a infraestrutura deles só aceitar **push** RTMP e não oferecer endpoint de
reprodução, não abra a porta 1935 no piloto automaticamente. Nesse caso
ajustamos o sidecar para receber publicação com autenticação e restrição de IP.

Para o primeiro teste, prefira vídeo H.264. O Agent atual ignora áudio.

## Instalação do bridge no computador do piloto

Abra PowerShell como Administrador:

```powershell
powershell -ExecutionPolicy Bypass -File .\meeting-rtmp-bridge\Install-MeetingRtmpBridge.ps1
```

A URL RTMP/RTMPS será pedida no terminal.

Depois:

```powershell
powershell -ExecutionPolicy Bypass -File .\meeting-rtmp-bridge\Test-MeetingRtmpBridge.ps1
```

Quando o teste indicar que o RTSP local está disponível, use o Agent atual:

```powershell
monitoria-agent camera --id SEU_CAMERA_ID --rtsp rtsp://127.0.0.1:8554/meeting
```

Nenhuma credencial RTMP é enviada ao backend da MonitorIA.

## Classificação criança/adulto

Também foi incluído um piloto opt-in por câmera, sem reconhecimento facial.

Ative somente uma câmera Meeting adicionando ao perfil ativo o objetivo
interno exato:

```text
PROINF_CHILD_ADULT_CLASSIFICATION
```

Há um SQL manual pronto em:

```text
supabase/manual/meeting-child-safety-camera-TEMPLATE.sql
```

O Structured Output passa a guardar, para cada pessoa:

```json
{
  "apparentAgeGroup": "child | adult | unknown",
  "apparentAgeGroupConfidence": 0.0
}
```

Regras implementadas:

- não informa idade exata;
- não determina maioridade/menoridade legal;
- não identifica pessoa;
- não usa reconhecimento facial;
- não infere parentesco, responsável legal, abandono, abuso ou crime;
- cenas ambíguas devem usar `unknown`;
- provável criança com confiança >= 0,60 força revisão humana;
- câmeras sem o objetivo interno têm o resultado forçado para `unknown`.

Página privada para o piloto:

```text
/dashboard/experiments/child-safety
```

## Piloto comercial de 30 dias

O SQL de liberação está em:

```text
supabase/manual/meeting-pilot-30d-TEMPLATE.sql
```

Ele foi preparado para:

- exatamente 6 câmeras da mesma organização;
- 2 `basic`;
- 2 `standard`;
- 2 `intensive`;
- 30 dias;
- sem criar cobrança;
- 90 interações da Pesquisa IA;
- enforcement comercial mantido ligado.

Preencha o `organization_id` e os seis `camera_id` reais somente depois que as
câmeras estiverem cadastradas.

## Ordem recomendada

1. Enviar este overlay ao GitHub.
2. Aguardar `npm run check`, testes e build do repositório.
3. Não trocar o download público do Agent.
4. Instalar o sidecar apenas no computador da Meeting.
5. Validar `rtsp://127.0.0.1:8554/meeting`.
6. Vincular a câmera RTMP ao Agent 1.0.3 atual.
7. Testar uma câmera RTSP/ONVIF normal no mesmo Agent para confirmar ausência de regressão.
8. Ativar o objetivo infantil em apenas uma câmera.
9. Quando as seis câmeras estiverem prontas, executar o SQL dos 30 dias.
10. Acompanhar os primeiros eventos e ajustar com evidências reais.

## Fontes técnicas

- FFmpeg Protocols — RTMP/RTMPS:
  https://ffmpeg.org/ffmpeg-protocols.html
- MediaMTX — RTMP cameras and servers:
  https://mediamtx.org/docs/publish/rtmp-cameras-and-servers
- MediaMTX — leitura RTMP:
  https://mediamtx.org/docs/read/rtmp
- MediaMTX — configuração por variáveis de ambiente:
  https://mediamtx.org/docs/features/configuration
- MediaMTX — configuração atual:
  https://mediamtx.org/docs/references/configuration-file
- MediaMTX — releases:
  https://github.com/bluenviron/mediamtx/releases
- Intelbras SIM Next — RTMP/RTMPS e preferência por H.264:
  https://manuais.intelbras.com.br/manual-sim-next/simnext.html
