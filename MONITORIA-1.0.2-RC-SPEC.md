# MonitorIA 1.0.2 — Release Candidate / Especificação Fechada

**Status:** especificação imutável para a próxima versão de produção  
**Data de consolidação:** 2026-08-23  
**Repositório:** `BigCorps/MonitorIA`  
**Base pública atual:** Agent 1.0.1 aguardando Microsoft Store  
**Próxima versão distribuível:** **1.0.2** — sem 1.0.2a, sampler-test, queue-test ou hotfix isolado.

---

## 1. Regra de lançamento

A 1.0.1 fica congelada como a versão já submetida à Microsoft Store.

Toda correção pedida pela Microsoft deve ser aplicada **sobre a base da 1.0.2**, sem bifurcação.

Os links públicos de download permanecem apontando para a versão atual até o gate completo:

1. Microsoft Store aprovada;
2. onboarding comercial real de 60 minutos aprovado;
3. onboarding self-service real de 24 horas aprovado;
4. publicar Agent 1.0.2;
5. trocar links públicos;
6. iniciar divulgação.

A atualização 1.0.1 → 1.0.2 deve preservar pareamento, câmeras, RTSP, perfis, configurações, histórico e identidade do Agent.

---

## 2. Escalabilidade — requisito não negociável

Não existirão limites artificiais de 6, 16, 32, 64 ou qualquer outro número de câmeras na assinatura normal.

Os únicos limites comerciais por quantidade de câmera são:

- trial comercial assistido: **60 minutos, até 6 câmeras**;
- trial self-service: **24 horas, 1 câmera**.

A arquitetura deve crescer por **recursos disponíveis e plano de infraestrutura**, não por bloqueio no código.

Quando a demanda crescer, o aumento de capacidade deve ser feito prioritariamente elevando Supabase/Vercel e limites externos necessários, sem reescrever a arquitetura.

### Regra de sobrecarga

O Agent nunca deve ignorar câmeras silenciosamente.

Se o hardware local não comportar a carga momentânea:

- aplicar backpressure;
- reduzir prioridade de vídeo antes de acontecimentos;
- preservar acontecimentos;
- expor estado degradado na telemetria;
- recuperar automaticamente quando houver recurso;
- nunca descartar uma câmera por ter ultrapassado um número fixo.

---

## 3. Núcleo do Agent 1.0.2 — Windows e Linux

Windows e Linux usam o mesmo núcleo lógico.

### 3.1 Ingestão RTSP unificada por câmera

Substituir processos duplicados de RTSP por um `CameraIngestRuntime` por câmera.

Cada câmera deve preferencialmente usar **uma única sessão RTSP**, responsável por:

- alimentar o sampler de movimento;
- manter a timeline circular de evidência;
- produzir frames do acontecimento;
- alimentar a geração de clipe;
- registrar timestamps/PTS consistentes.

Objetivo: reduzir conexões ao DVR/NVR, processos FFmpeg, CPU, memória e risco de divergência foto↔vídeo.

### 3.2 Sampler RTSP

Incorporar definitivamente à `main` a correção validada no sampler 1.0.2.

O comportamento antigo da 1.0.1 que podia congelar/repetir frames não pode permanecer em nenhum workflow paralelo.

Neutralizar o workflow temporário `build-agent-rtsp-sampler-test.yml` no pacote aplicado via GitHub Web; o sampler corrigido faz parte exclusivamente do código oficial 1.0.2. O arquivo-túmulo pode ser removido fisicamente depois, sem efeito funcional.

### 3.3 Adaptativo

O calibrador não pode aprender movimento real como ruído.

Amostras de calibração só entram quando houver repouso comprovado.

Movimento moderado, pessoa parada/movendo lentamente, alteração localizada e atividade persistente não podem elevar silenciosamente os thresholds.

Persistir telemetria do baseline e alterações efetivas.

### 3.4 DVR/NVR multicanal

- Preferir ONVIF quando completo.
- Preferir substream leve.
- Preferir H.264.
- Quantidade informada pelo usuário é uma **heurística**, nunca teto estrutural.
- Não parar definitivamente após dois canais vazios.
- Tolerar lacunas de canal.
- Não assumir numeração contígua.
- Não perder canais por ordem de descoberta ou por uma única rodada.
- Evitar tempestade de conexões no gravador.
- Registrar compatibilidade bem-sucedida para acelerar instalações futuras.

### 3.5 Fila local de acontecimentos

Fila deve ser:

- persistente;
- idempotente;
- FIFO por câmera;
- justa entre câmeras;
- concorrente;
- com round-robin/weighted fairness;
- com backoff por item;
- sem número máximo de tentativas para falha transitória;
- sem uma câmera muito ativa monopolizar a saída.

Concorrência é controlada por recursos/rede, não por quantidade total de câmeras.

### 3.6 Vídeo é fila independente

A fila de vídeo nunca bloqueia a fila de acontecimentos.

Prioridade local:

1. metadados/recibo do acontecimento;
2. frames necessários à análise;
3. frames de verificação temporal;
4. vídeo.

Falha, lentidão ou compressão de vídeo não pode impedir ACK de acontecimento.

---

## 4. Evidência de vídeo — política 1.0.2

### 4.1 Estado medido em produção em 2026-08-23

Foram encontrados 749 clipes `event-clips` prontos:

- média: **2,01 MB**;
- mediana: **1,45 MB**;
- p90: **4,10 MB**;
- máximo observado: **16,35 MB**;
- duração média: **51,9 s**;
- bitrate médio calculado: aproximadamente **475 kbps**.

O resultado atual é bom, mas hoje ele depende em grande parte do bitrate do stream de origem.

### 4.2 Regra de compressão

O vídeo é prova visual, não gravação forense.

Política:

- sem áudio;
- MP4;
- H.264 preferencial;
- substream preferencial;
- máximo visual desejado: 720p;
- não aumentar resolução/fps/bitrate da fonte;
- passthrough/remux quando o stream já estiver dentro do envelope leve;
- transcode somente quando necessário.

Envelope inicial de produção:

- alvo: ~600 kbps;
- passthrough normalmente permitido até ~900 kbps em H.264 ≤720p;
- acima do envelope, reduzir resolução/fps/bitrate;
- limite final é configurável por política, não hardcoded por plano comercial.

O transcode não pode bloquear acontecimento. Deve ocorrer na fila de vídeo.

O pacote Windows/Linux deve possuir estratégia de encoder compatível com a licença de redistribuição adotada; não trocar todo o projeto para GPL/libx264 apenas para comprimir clipes.

### 4.3 Orçamento global de disco

Remover o conceito de 512 MB independentes multiplicados por câmera.

Criar orçamento global do Agent:

- eventos/frames pendentes têm reserva prioritária;
- buffer de vídeo usa o restante;
- quotas por câmera são dinâmicas;
- câmeras ativas não expulsam completamente as demais;
- quando o disco apertar, reduzir histórico de vídeo antes de perder evento;
- telemetria informa uso, pressão e descartes.

---

## 5. Foto ↔ vídeo ↔ IA — coerência temporal

### 5.1 Regra principal

As imagens enviadas à IA devem, sempre que possível, vir **da mesma timeline RTSP que gera o vídeo**.

Não realizar uma nova captura RTSP independente para `start`, `peak`, `end` se a timeline já contém o quadro correspondente.

Cada evidência deve carregar:

- `camera_id`;
- `agent_event_id`;
- timestamp UTC;
- PTS/timestamp relativo da timeline;
- segmento de origem;
- hash SHA-256;
- papel (`start`, `peak`, `end`, `extra`, `verification`);
- largura/altura;
- tamanho.

O clipe deve possuir manifesto que permita provar que os frames analisados pertencem à janela temporal do próprio vídeo.

### 5.2 IA não recebe MP4

Os modelos atuais usados pelo MonitorIA (`gpt-5-nano` / `gpt-5-mini`) recebem imagens, mas não vídeo como modalidade de entrada.

Portanto, a 1.0.2 não enviará MP4 para a IA.

### 5.3 Verificação temporal inteligente

Fluxo:

1. IA recebe os frames principais vindos da timeline;
2. produz resultado inicial;
3. se houver incerteza/contradição/condição de verificação:
   - usar a reserva de verificação já existente;
   - selecionar frames adicionais da própria timeline de vídeo;
   - enviar somente os frames adicionais necessários;
4. reconciliar resultado inicial e verificação;
5. registrar quais frames sustentaram a decisão.

Isso mantém o mesmo sistema de teto percentual e orçamento financeiro já existente em `analysis_verification_reservations`.

Não aumentar indiscriminadamente a quantidade de imagens em todos os eventos.

### 5.4 Pacote temporal local

O Agent deve poder manter um pequeno conjunto de frames de verificação da timeline por evento até o backend concluir a análise/retenção mínima.

Esses frames não precisam ser enviados à IA nem armazenados a longo prazo se não forem usados.

---

## 6. Backend durável

### 6.1 ACK rápido

A rota do Agent não deve executar a análise pesada antes de responder.

Fluxo:

`Agent → autentica → valida → persiste envelope/idempotência → ACK`

Depois:

`recibo durável no Supabase → disparo pós-ACK (`after()`) → Vercel Function → IA → persistência final → clipe independente → dashboard`

### 6.2 Fonte de verdade

Criar/usar um registro durável de ingestão com chave idempotente por `agent_event_id`.

Estados mínimos:

- received;
- queued;
- processing;
- completed;
- retry;
- failed_terminal.

Falha posterior nunca remove o recibo do acontecimento.

### 6.3 Processamento durável na Vercel

A durabilidade pertence ao Supabase: cada ingestão recebe recibo persistente, estado, lease, retry e checkpoint antes de o Agent receber ACK. O Next.js usa `after()` apenas para iniciar rapidamente uma Vercel Function após a resposta; ele não é a fonte de verdade.

Um cron de recovery executado a cada minuto reivindica recibos abandonados/expirados e retoma o processamento diretamente a partir do Supabase. Queda de Function, redeploy ou falha do disparo pós-ACK pode aumentar o atraso, mas não perde o acontecimento.

Não existe dependência do SDK Vercel Workflows e a conclusão da IA nunca depende da vida da requisição HTTP do Agent.

### 6.4 Erros que são bloqueadores da RC

Eliminar estruturalmente:

- `unsupported Unicode escape sequence`;
- `analysis_job_not_found`;
- qualquer exceção depois do ACK que possa fazer acontecimento desaparecer;
- duplicação por retry;
- job órfão;
- evento sem status recuperável.

Sanitização e parsing devem aceitar Unicode real sem interpolação insegura em JSON/SQL.

---

## 7. Retenção

O bucket atual de vídeo é `event-clips`.

O cron de retenção precisa incluir e remover fisicamente `event-clips`.

Em 2026-08-23 ainda não havia objeto `event-clips` expirado, pois a implantação tem menos de 30 dias; portanto o defeito ainda não se manifestou, mas o código atual não está preparado para quando os primeiros expirarem.

A remoção deve:

1. apagar objeto do Storage;
2. marcar `storage_assets`;
3. limpar metadados quando elegível;
4. ser idempotente;
5. gerar métricas de falha.

---

## 8. Dashboard

Obrigatório para 1.0.2:

- período padrão termina sempre em hoje;
- atualização automática;
- card real `Analisando…` para ingestões persistidas sem resultado final;
- card se transforma no resultado sem exigir reload manual;
- filtros preservados;
- muitas câmeras em uma consulta paginada única/RPC, não N consultas;
- pending/completed ordenados na mesma timeline;
- multi-site correto;
- multi-Agent correto;
- nenhuma câmera de outra filial vinculada ao Agent errado.

---

## 9. Telemetria escalável

### Agent

Registrar/rollup:

- CPU;
- RAM;
- disco total/livre/usado pelo MonitorIA;
- pressão do orçamento global;
- câmeras configuradas/ativas/degradadas;
- processos RTSP;
- reconexões RTSP;
- bitrate/resolução/codec;
- idade da fila;
- profundidade total e por câmera;
- throughput de eventos;
- throughput de clipes;
- uploads em andamento;
- falhas/retries;
- tempo desde último frame por câmera.

### Backend

Registrar/rollup:

- ingestões recebidas;
- ingestões duráveis pendentes/processando/retry e idade do backlog;
- idade do backlog;
- tempo ACK→resultado;
- retries;
- jobs recuperados;
- jobs terminais;
- consumo por modelo;
- custo por câmera/plano/organização;
- storage por classe;
- retenção;
- clipes pendentes/falhos.

Raw telemetry deve ter purge; histórico longo usa rollups.

---

## 10. Compatibilidade 1.0.1 → 1.0.2

A instalação por cima da 1.0.1 não pode:

- apagar `ProgramData/MonitorIA` no Windows;
- apagar `/var/lib/monitoria` no Linux;
- gerar novo Agent sem necessidade;
- invalidar token;
- remover `agent_cameras`;
- alterar RTSP salvo;
- recriar perfil;
- apagar fila;
- apagar histórico.

Desinstalação explícita continua podendo remover dados locais conforme política atual.

---

## 11. Microsoft Store

A 1.0.1 é a submissão em revisão.

Se houver exigência da Store:

- aplicar correção na base 1.0.2;
- se necessário, reapresentar pacote compatível;
- não criar branch funcional divergente.

Se a 1.0.1 for aprovada:

- concluir gates de onboarding;
- solicitar atualização para 1.0.2 imediatamente depois.

Links públicos não mudam antes do gate.

---

## 12. Testes finais — somente aceitação

Não haverá mais build experimental para descobrir comportamento.

O próximo Agent que chegar ao usuário para instalação deve ser o **1.0.2 RC completo**.

### Gate A — comercial assistido

Do zero:

usuário → local → várias câmeras/DVR → Agent 1.0.2 → conectar → detectar → acontecimentos → `Analisando…` → resultado → fotos → vídeo → filtros → fim de 60 min → conversão.

Até 6 câmeras.

### Gate B — self-service

Conta nova → 1 câmera → instalação → 24h → encerramento/exploração → escolha do plano.

### Liberação

`Store OK + Gate A OK + Gate B OK = publicação 1.0.2 + troca de links + divulgação`

---

## 13. Estratégia de entrega

**Não aplicar ZIPs parciais na `main`.**

A 1.0.2 cruza Agent, banco, backend assíncrono, retenção e dashboard; uma etapa parcialmente aplicada pode colocar contratos incompatíveis em produção.

Fluxo adotado:

1. construir internamente em blocos sobre a mesma base 1.0.2;
2. manter esta especificação como checklist;
3. migrations novas são aditivas/idempotentes e versionadas;
4. no fechamento, entregar **um ZIP completo e coerente** com toda a árvore necessária;
5. entregar pasta separada com SQLs/migrations em ordem;
6. incluir `LEIA-ME-1.0.2.md` com ordem exata de aplicação;
7. só então aplicar no GitHub/Supabase;
8. Vercel fará o deploy da base completa;
9. gerar o Agent 1.0.2 oficial;
10. executar somente os dois onboardings de aceitação.

Podem existir checkpoints de desenvolvimento para controle interno, mas não devem ser aplicados pelo responsável nem tratados como versões distribuíveis.

---

## 14. Proibições da 1.0.2

- sem limite artificial de câmeras na assinatura;
- sem fila global serial;
- sem vídeo bloqueando evento;
- sem IA dentro da requisição de ingestão;
- sem captura de foto temporalmente independente quando houver timeline;
- sem MP4 para GPT;
- sem transcode obrigatório de todos os clipes;
- sem 512 MB × câmera;
- sem dois canais vazios como fim absoluto de DVR;
- sem `event-clips` fora da retenção;
- sem N queries por N câmeras no dashboard;
- sem erro técnico fazendo evento desaparecer;
- sem mudança dos links antes do gate;
- sem versão 1.0.2 intermediária.

---

## 15. Decisão final

A 1.0.2 será tratada como o primeiro build de produção preparado para escala comercial real.

Limitações futuras devem ser de capacidade contratada/infraestrutura, observáveis e ampliáveis por plano — nunca um teto oculto de arquitetura.
