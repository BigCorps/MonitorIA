# MonitorIA v0.5.2

Corrige o workflow do Agent que estava usando o `tsconfig.json` do webapp.

## Alterações

- restaura `agent/tsconfig.json`;
- limita a verificação a `agent/src/**/*.ts`;
- obriga os scripts `check` e `build:js` a usar o tsconfig do Agent;
- mantém a compilação `bun-windows-x64-baseline`;
- renomeia o artifact para v0.5.2.

O código completo do Agent passou em `tsc --noEmit -p agent/tsconfig.json`.
