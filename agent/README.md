# MonitorIA Agent v0.5.1

Primeira versão executável do Agent local para Windows.

## Compatibilidade de CPU

O executável Windows é compilado com:

```text
bun-windows-x64-baseline
```

Essa variante é destinada a computadores x64 sem AVX2. Ela exige SSE4.2.

## O que esta versão faz

- consome o código temporário de pareamento;
- recebe a URL RTSP somente no computador local;
- protege token e RTSP com o DPAPI do Windows;
- localiza o FFmpeg;
- captura um JPEG real;
- envia o primeiro frame ao MonitorIA;
- marca a câmera como online;
- envia heartbeat a cada 60 segundos;
- testa a câmera a cada 5 minutos;
- sincroniza as configurações remotas a cada 5 minutos.

## Comandos

```powershell
.\monitoria-agent.exe
.\monitoria-agent.exe status
.\monitoria-agent.exe reset
```

A configuração é salva, nesta ordem, em:

1. `%PROGRAMDATA%\MonitorIA\agent.json`;
2. `%LOCALAPPDATA%\MonitorIA\agent.json`;
3. `.monitoria\agent.json` como último fallback.

O token e a URL RTSP não são salvos em texto aberto. A proteção usa DPAPI
com escopo do usuário do Windows que executou o pareamento.

## Compilação local

Com Bun instalado:

```powershell
cd agent
npm install
npm run build:win
```

O arquivo será criado em:

```text
agent\dist\monitoria-agent.exe
```
