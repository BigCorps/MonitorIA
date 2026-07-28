# MonitorIA v0.6.1

Corrige a resolução dos módulos de visão no Next.js/Turbopack.

## Causa

Os arquivos TypeScript importavam módulos internos usando nomes terminados em
`.js`. Esse padrão era usado pelos scripts Node/TSX, mas o Turbopack procurou
literalmente arquivos JavaScript que não existem no código-fonte.

## Correção

Os imports internos alcançados pelo webapp passaram a usar caminhos sem
extensão, compatíveis com `moduleResolution: "bundler"`:

- `src/vision/create-provider.ts`
- `src/vision/openai-provider.ts`
- `src/vision/prompt.ts`
- `src/vision/profile-prompt.ts`
- `src/vision/types.ts`

Não há alteração de banco, Agent ou variáveis de ambiente.
