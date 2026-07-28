# MonitorIA Agent v0.5.5

Agent local para Windows responsável por parear a câmera, proteger o token e a
URL RTSP com DPAPI, capturar o primeiro frame com FFmpeg e manter heartbeat.

## Compatibilidade

O executável é compilado com `bun-windows-x64-baseline`, destinado a CPUs x64
sem AVX2 que possuam SSE4.2.

## Comandos

```powershell
.\monitoria-agent.exe
.\monitoria-agent.exe status
.\monitoria-agent.exe reset
.\monitoria-agent.exe self-test
```

## Configuração local

A configuração é salva preferencialmente em:

```text
%PROGRAMDATA%\MonitorIA\agent.json
```

Caso a pasta exija permissão administrativa, é usado:

```text
%LOCALAPPDATA%\MonitorIA\agent.json
```


## Autoteste do DPAPI

```powershell
.\monitoria-agent.exe self-test
```

Esse comando protege e descriptografa uma frase de teste com o DPAPI do Windows,
incluindo caracteres acentuados. Nenhuma credencial real é usada.
