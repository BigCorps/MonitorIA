# MonitorIA v0.5.3

Corrige o workflow que encontrava o `agent/tsconfig.json`, mas não encontrava
nenhum arquivo em `agent/src`.

## Incluído neste patch

- `agent/src/index.ts`
- `agent/src/api.ts`
- `agent/src/cli.ts`
- `agent/src/config.ts`
- `agent/src/dpapi.ts`
- `agent/src/ffmpeg.ts`
- `agent/src/system.ts`
- `agent/src/types.ts`
- `agent/package.json` v0.5.3
- `agent/tsconfig.json`
- workflow com verificação explícita de `src/index.ts`
- `actions/checkout@v5`

O TypeScript do Agent foi validado localmente com sucesso.
