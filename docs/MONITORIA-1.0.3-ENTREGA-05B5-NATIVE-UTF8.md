# MonitorIA 1.0.3 — Entrega 05B.5 — Unicode dos hosts Windows

## Problema observado

Na validação visual do pacote Store, a janela nativa de pareamento exibiu textos como `cÃ³digo`, `conexÃ£o`, `sÃ³` e `instalaÃ§Ã£o`.

O `desktop-host.c` já usa `CreateWindowExW`, `MessageBoxW`, `SetWindowTextW` e literais `wchar_t`. O defeito estava no build: os fontes `.c` são UTF-8, mas o `cl.exe` era chamado sem `/utf-8`, fazendo o MSVC interpretar os bytes pela página ANSI do runner antes de formar os literais Unicode.

O mesmo risco existia no tray 24/7, que contém textos portugueses acentuados.

## Correção

- adiciona `/utf-8` às três compilações MSVC nativas (`dpapi.c`, `tray.c` e `desktop-host.c`);
- mantém as APIs Unicode `W` existentes, sem alterar lógica de UI, pareamento, serviço ou Core;
- após compilar, o workflow procura no PE as sequências UTF-16LE corretas:
  - `código de conexão` no Desktop Host;
  - `atenção: serviço parado` no tray;
- o build falha se encontrar as versões mojibake (`cÃ³digo...`, `atenÃ§Ã£o...`);
- o contrato da RC exige `/utf-8` em todas as três chamadas de `cl.exe`.

## Escopo

Arquivos alterados:

1. `.github/workflows/build-release-candidate-v103.yml`
2. `test/agent-0103-release-candidate-contract.test.ts`

Documento novo:

3. `docs/MONITORIA-1.0.3-ENTREGA-05B5-NATIVE-UTF8.md`

Não altera `agent/src/**`, Supabase, Vercel, timeline RTSP, evidências, filas, pareamento, instaladores Inno ou regras de publicação.

## Validação manual

Gerar um novo RC pelo workflow e instalar apenas o pacote Store atualizado. Na tela inicial, confirmar visualmente:

- `MonitorIA — conectar computador`;
- `código de conexão`;
- `só é usado`;
- `primeira instalação`;
- demais acentos e travessões corretos.

Não parear a edição Store enquanto a edição 24/7 estiver ativa na mesma máquina.
