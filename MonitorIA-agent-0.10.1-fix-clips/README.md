# MonitorIA Agent 0.10.1 — correção dos clipes H.264

## Causa confirmada

O buffer circular funciona, mas o Agent 0.10.0 força `libx264`.
A build FFmpeg distribuída pelo MonitorIA é LGPL e não contém esse encoder.

Erro observado:

`Unknown encoder 'libx264'`

## Correção

- Detecta encoders H.264 disponíveis no FFmpeg.
- Prioriza `h264_mf` no Windows.
- Mantém `libopenh264` e `libx264` como alternativas quando existirem.
- Não troca a distribuição LGPL do FFmpeg.
- Ignora o segmento `.ts` ainda aberto/zerado.
- Mantém MP4/H.264, 720p e 15 segundos.
- Registra no log qual encoder foi usado.

## Aplicar

Extraia a pasta na raiz do repositório e execute:

```bash
node MonitorIA-agent-0.10.1-fix-clips/apply-agent-0.10.1.mjs
npx tsc --noEmit -p agent/tsconfig.json
git diff
```

Depois:

```bash
git add .
git commit -m "fix: usar encoder H264 disponivel nos clipes do Agent"
git push
```

O push dispara o workflow Windows. Instale o novo `MonitorIA-Setup.exe` 0.10.1
sobre a versão 0.10.0. O instalador preserva pareamento e RTSP.

Não há SQL adicional.

## Validação local após instalar 0.10.1

Depois de gerar um acontecimento novo:

```powershell
Get-Content "$env:ProgramData\MonitorIA\logs\agent.log" -Tail 120 |
  Select-String -Pattern "encoder|clipe|buffer|upload" -CaseSensitive:$false
```

Esperado:

- `Encoder(es) H.264 disponível(is): h264_mf...`
- `Clipe H.264 gerado com h264_mf...`
- `Clipe do evento ... enviado diretamente ao Storage.`

Eventos cujo clipe já falhou no 0.10.0 não são reconstruídos automaticamente.
