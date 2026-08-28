# MonitorIA 1.0.3 — Fase 05B.3

## Objetivo

Corrigir a perda intermitente de JPEGs de evidência observada no teste real com duas câmeras, preservando a 1.0.2, o transporte durável, o vídeo local, o pareamento e o Core compartilhado da 1.0.3.

## Evidência de campo

O Agent 1.0.3 continuava registrando `ENOENT` ao executar `stat()` no JPEG de `start`, `peak`, `extra` ou `end`. O FFmpeg encerrava com código de sucesso, porém em algumas tentativas nenhum JPEG era materializado. O backend recebia exatamente 1 ou 2 frames nesses eventos; portanto a perda ocorria localmente antes da fila/upload.

A timeline 1.0.2 considera um `.ts` elegível após 400 ms sem alteração de `mtime`. Em RTSP ao vivo isso não comprova que o muxer já fechou o segmento. A captura podia, portanto, tentar ler o arquivo que ainda estava sendo escrito.

## Correção 05B.3

1. A 1.0.3 mantém a reconstrução de duração variável da 05B.2.
2. Para JPEG, um segmento só é elegível quando há prova de fechamento:
   - existe segmento posterior do mesmo processo FFmpeg; ou
   - já existe um novo processo FFmpeg, o que fecha o último segmento do processo anterior.
3. O diretório do ring é consultado apenas para confirmar a existência do sucessor. A 1.0.2 permanece sem alteração.
4. O seek do JPEG passa a ocorrer depois da abertura do input (`-i ... -ss ...`), forçando decodificação a partir do começo do pequeno `.ts` e evitando dependência de fast-seek/keyframe.
5. Se o FFmpeg encerrar sem criar um JPEG utilizável, a 1.0.3 repete a extração com offsets até 350 ms e 900 ms anteriores. O timestamp retornado passa a refletir o offset efetivamente extraído.
6. O seletor não usa mais um segmento apenas por ser o "mais próximo" quando nenhum segmento fechado cobre o instante solicitado; é preferível registrar lacuna do que anexar uma imagem de outro momento.

## Regressões automáticas

`test/agent-0103-timeline-segment-timing.test.ts` agora valida:

- janela variável de GOP;
- segmento atual bloqueado até existir sucessor;
- fechamento do último segmento após restart do FFmpeg;
- seek longo preservado;
- ordem `-i` antes de `-ss`;
- múltiplas tentativas de JPEG;
- contrato agregado da timeline 1.0.3.

O `self-test` do Core também exige as novas garantias e imprime:

```text
Timeline RTSP variável: sim
JPEG após fechamento do segmento: sim
```

## Fora do escopo

Os diretórios antigos `.sources` que apontam para segmentos já removidos do ring continuam sendo tratados separadamente. Eles geram ruído periódico de recovery, mas não causam a perda atual de JPEG. Não foi adicionada remoção automática nesta fase para evitar apagar uma evidência ainda recuperável sem uma política explícita de expiração.

## Restrições preservadas

- sem alteração de Supabase;
- sem alteração de Vercel;
- sem tag `agent-v1.0.3`;
- sem mudança do download público 1.0.2;
- sem `MONITORIA_STORE_PUBLIC_URL`;
- sem `AGENT_RECOMMENDED_VERSION`;
- sem envio à Microsoft Store.
