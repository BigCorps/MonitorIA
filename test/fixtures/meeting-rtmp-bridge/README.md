# MonitorIA Meeting RTMP Bridge

Sidecar de homologação para uma câmera RTMP/RTMPS da Meeting.

Ele **não altera o Agent MonitorIA**. O bridge converte/proxy a origem RTMP para:

```text
rtsp://127.0.0.1:8554/meeting
```

O Agent 1.0.3 usa esse RTSP local exatamente como usa qualquer outra câmera.

## Requisito

Windows 10/11 ou Windows Server x64, no mesmo computador do Agent MonitorIA.

## Instalar

PowerShell como Administrador:

```powershell
.\Install-MeetingRtmpBridge.ps1
```

Informe a URL de reprodução RTMP ou RTMPS quando solicitado.

## Testar

```powershell
.\Test-MeetingRtmpBridge.ps1
```

## Vincular ao Agent atual

```powershell
monitoria-agent camera --id SEU_CAMERA_ID --rtsp rtsp://127.0.0.1:8554/meeting
```

## Alterar a origem

```powershell
.\Update-MeetingRtmpSource.ps1
```

## Remover

```powershell
.\Uninstall-MeetingRtmpBridge.ps1
```

## Importante

Este pacote implementa **pull**. Peça à Meeting uma URL que possa ser lida por
um cliente RTMP/RTMPS.

Se eles fornecerem apenas uma URL/chave de publicação (push), pare aqui. Não
abra uma porta RTMP pública sem autenticação e filtro de origem.
