# MonitorIA — Documento de Handoff

**Empresa:** BigCorps Tecnologia LTDA (Brasil)
**Status:** pré-MVP. Fase 0 (medição) em execução.
**Última atualização:** 27/07/2026
**Nome do produto:** provisório — ver §11

---

## 0. Como usar este documento

Este é um handoff para outro agente de IA. Convenções:

| Marca | Significado |
|---|---|
| ✅ **VERIFICADO** | dado de fonte pública citada ou medido no vídeo real |
| ⚠️ **ESTIMATIVA** | inferência; tratar como hipótese, não como fato |
| ❌ **REJEITADO** | já foi avaliado e descartado — não repropor sem argumento novo |
| ⏳ **ABERTO** | não decidido; precisa de dado ou decisão do fundador |

**Instrução ao agente:** o fundador pediu explicitamente rigor sobre precisão — distinguir fato de inferência, não inventar números, dizer "não sei" quando não souber, e corrigir premissas erradas antes de executar a tarefa. Não concordar automaticamente.

---

## 1. O que é o produto

Sistema que transforma vídeo de câmeras de monitoramento **estáticas** em **metadados pesquisáveis**, para que o usuário encontre eventos e extraia métricas sem assistir gravação.

**Fluxo conceitual:**
```
câmera → agente local → detecção de movimento (grátis)
       → VLM descreve o evento (pago, raro)
       → Postgres: evento estruturado + descrição + embedding
       → usuário pergunta em português → LLM lê os dados → responde
```

**O que NÃO é:** não é NVR, não substitui gravação, não é armazenamento em nuvem, não é alerta em tempo real (v1).

**Posicionamento correto:** *"índice pesquisável do seu vídeo"*. O vídeo continua no DVR do cliente. Os metadados dizem **quando**; o DVR entrega os 30 segundos.

### 1.1 Correção crítica de posicionamento

A tese original era *"mais barato que armazenar vídeo"*. **Isso está errado para o público-alvo.** Quem tem DVR já tem o HD pago: custo marginal de armazenamento ≈ R$ 0.

Posicionamento válido, em ordem de força:

1. **Operação/BI** — horário de abertura, pico de movimento, contagem de clientes, comparação entre períodos. Uso diário → sustenta assinatura.
2. **Retenção longa** — 12 meses de metadados vs. 3–30 dias de vídeo. Só tem valor para perguntas de operação (ninguém investiga roubo de 8 meses atrás).
3. **Segurança/busca forense** — consegue a reunião, mas sozinha não retém: incidente acontece 1–2×/ano.

**Regra:** segurança adquire, operação retém. Vender só segurança = churn alto.

---

## 2. Economia — restrições duras

### 2.1 Concorrência com preço público ✅ VERIFICADO

**b-cam** (b-cam.com.br), gravação em nuvem para câmera IP e DVR no Brasil, >10 anos de mercado:
- R$ 19–24/mês por câmera HD (~1000 kbps), retenção de 3 dias
- Primeiras 16 câmeras: R$ 0,33/dia por câmera
- Aceita RTSP, RTMP e MJPEG; um canal de DVR conta como uma câmera

**Consequência:** cobrar R$ 39,90/câmera seria o dobro de um concorrente que entrega o vídeo de verdade. **Modelo por câmera está descartado.**

### 2.2 Referências internacionais ✅ VERIFICADO
- VMS em nuvem (EUA): US$ 15–50/câmera/mês
- Spot AI: a partir de ~US$ 99/câmera/mês
- Plate Recognizer Stream: US$ 35/câmera/mês (ALPR dedicado)

### 2.3 Modelo de preço decidido

**Cobrar por LOCAL, nunca por câmera.** Preço por câmera convida o cliente a multiplicar pelos 16 canais do DVR — número sem relação com o valor entregue. Na prática ele só se importa com 2–4 vistas (entrada, caixa, estoque).

| Plano | Câmeras inteligentes | Preço/mês ⚠️ ESTIMATIVA |
|---|---|---|
| Local P | até 2 | R$ 79 |
| Local M | até 4 | R$ 129 |
| Local G | até 8 | R$ 199 |

**Regra inegociável:** cota de eventos por câmera (ex.: 1.000/dia). Uma câmera apontada para rua movimentada destrói a margem sem cota. Excedente cobrado ou throttled.

⏳ **ABERTO:** o preço acima não foi validado com nenhum cliente. Não há dado público confiável de analítico de IA por câmera no Brasil (mercado é orçamento sob consulta).

---

## 3. Arquitetura decidida

### 3.1 O problema real é alcançabilidade, não protocolo

Câmera de PME brasileira está atrás de **CGNAT**. RTSP, ONVIF, "API aberta" e "stream URL" descrevem *como* falar com a câmera — nenhum resolve *se existe rota até ela*.

ONVIF é protocolo de **LAN**: a câmera é servidor, espera conexão, nunca inicia. O discovery é multicast e não sai do roteador. ONVIF serve para **descobrir** a câmera na rede local, não para alcançá-la de fora.

**Conclusão: é obrigatório algo rodando 24/7 na LAN do cliente.** Não há como contornar.

### 3.2 Agente local (decisão principal)

| Requisito | O agente precisa apenas de |
|---|---|
| Estar na LAN da câmera | wifi ou cabo |
| Ficar ligado | tomada |
| Saída para internet | HTTPS de saída |

**Formatos viáveis:**

| Opção | CAPEX | Confiabilidade | Nota |
|---|---|---|---|
| Docker em PC existente | R$ 0 | média | **v1** |
| .exe Windows | R$ 0 | média | v1, exige assinatura de código |
| Mini PC N100 16GB | R$ 1.100–1.700 ⚠️ | alta | 4–6 câmeras |
| TV box Android | R$ 200–400 | média-alta | **melhor custo/benefício** |
| Celular Android velho | R$ 0 | média | ótimo p/ piloto |

**Sobre TV box vs. celular:** otimização agressiva de bateria existe para poupar bateria. TV box não tem bateria → matadores de background são brandos. Não precisa de tela ligada em nenhum dos dois.
⚠️ TV box genérico de marketplace costuma ter hardware falsificado e às vezes malware. Padronizar um modelo de marca conhecida.

### 3.3 Simplificação importante: snapshot HTTP > RTSP

Como a amostragem é 1 frame a cada 10s, **manter sessão RTSP aberta não traz benefício algum.**

ONVIF expõe `GetSnapshotUri` — URL HTTP que devolve JPEG. Um `GET` simples.

Endpoints por fabricante:
- Dahua e derivados (**inclui Intelbras**): `http://ip/cgi-bin/snapshot.cgi?channel=1`
- Hikvision: `http://ip/ISAPI/Streaming/channels/101/picture`

**Design: tenta snapshot primeiro, cai para RTSP só se a câmera não expuser.**

Impacto no app Android: elimina decodificação de vídeo (`OkHttp` + `BitmapFactory` em vez de Media3/MediaCodec + leitura de SurfaceTexture). ⚠️ O `ffmpeg-kit` foi descontinuado, então evitar dependência de ffmpeg no Android é vantagem dupla.

### 3.4 Pipeline em cascata

| Camada | Onde | O que faz | % dos frames | Custo |
|---|---|---|---|---|
| 0 | Agente | diff de pixel 320×180, com máscara de zona | ~95% morrem aqui | R$ 0 |
| 1 | Agente | agrupa frames consecutivos em 1 evento | — | R$ 0 |
| 2 | Nuvem | VLM descreve o evento (3–4 frames, **1 chamada**) | ~5% | pago |
| 3 | Consulta | LLM lê texto já gravado, sem imagem | por pergunta | ~R$ 0,001 |

A **camada 1 é o que faz a conta fechar**: um carro passando gera 6 frames alterados, mas é **um** evento e **uma** chamada com 4 imagens.

❌ **REJEITADO — cron a cada 1s/10s amostrando por tempo.** Amostragem por tempo é o modo mais caro possível. O correto é event-driven.

### 3.5 Stack

| Peça | Onde |
|---|---|
| Código do agente | GitHub |
| Build multiplataforma | GitHub Actions |
| Distribuição do binário | GitHub Releases |
| Dashboard + API + cron de rollup | Vercel |
| Postgres + Storage + Auth + RLS | Supabase |

✅ **VERIFICADO:** Vercel Cron aceita `* * * * *` (granularidade de 1 minuto). `maxDuration` na casa de centenas de segundos (exemplos de docs mostram 500s). **Não sustenta processo persistente** — daí o agente.

❌ **REJEITADO — GitHub Actions como runtime de ingestão.** O ToS proíbe uso não relacionado a build/teste/deploy do software do repositório. Risco de banimento da conta que hospeda todo o portfólio da empresa.

❌ **REJEITADO — 100% nuvem sem agente.** Não resolve CGNAT, consome upload do cliente (4 câmeras × 2 Mbps = 8 Mbps contínuos) e custa 2–7× mais em compute.

❌ **REJEITADO — engenharia reversa da interface web do DVR.** Auth e streaming proprietários, quebra a cada firmware, provável violação de ToS, esforço por fabricante.

❌ **REJEITADO — `tuya-ipc-terminal` e similares.** Reverse engineering não autorizado de API da Tuya; depende da credencial da conta do cliente; quebra a qualquer atualização. Serve para teste pessoal, não para produto.

### 3.6 Linguagem do agente

**TypeScript**, compilado com `bun build --compile`. Não Go.

Justificativa: o fundador não lê Go. O agente roda em máquina sem acesso SSH; a capacidade de debugar às 23h vale mais que 40 MB de binário. Ele já domina TS (Next.js).

⏳ v2 Android: Kotlin, ~600–800 linhas + 3–4 telas (pareamento, lista de câmeras, status).
❌ **REJEITADO — TWA/Bubblewrap para o app Android.** TWA é aba do Chrome numa casca; não consegue foreground service próprio, socket UDP para descoberta ONVIF, nem rodar com a página fechada. Limitação de arquitetura.

---

## 4. Onboarding do usuário final

**Princípio: o usuário nunca digita um IP.** O agente varre a rede e descobre as câmeras.

```
1. Dashboard → "Adicionar local" → gera código: 4F7K-92
2. Cliente baixa MonitorIA.exe → duplo clique → digita o código
3. Agente liga em casa, recebe token. Local pareado.
4. Agente varre a LAN:
   • ONVIF WS-Discovery (multicast 239.255.255.250:3702)
   • portas 554 / 8554 / 6554 / 8080
5. Dashboard: "Encontramos 4 câmeras" + miniatura de cada
6. Cliente informa usuário/senha da câmera
7. Primeiro frame → IA descreve a cena → cliente corrige o texto
8. Cliente desenha as zonas por cima do print
```

O passo 7 é a ideia original do fundador e **sobreviveu a toda a análise** — continua sendo a melhor parte do produto.

⚠️ **O passo 6 é onde o onboarding morre.** O cliente frequentemente não sabe a senha da câmera (instalador sumiu há 4 anos). Mitigações, nesta ordem:
1. Tentar defaults automaticamente antes de perguntar: `admin/admin`, `admin/123456`, `admin` sem senha, `admin/12345`
2. Botão "não sei a senha" → gera link com instruções para o cliente mandar ao instalador dele
3. Aceitar que uma fatia precisa de reset do DVR

**Métrica a medir no piloto:** taxa de onboarding concluído sem intervenção humana. Decide se o produto é self-service ou precisa de canal.

**Argumento de segurança:** a credencial da câmera fica no config do agente, **dentro da loja**. Nunca sobe ao servidor. Se a BigCorps for invadida, nenhuma câmera de cliente é acessível.

### 4.1 Por que não dá "só IP e senha no site"

Página HTTPS não consegue `fetch` para `http://192.168.x.x` — bloqueio de conteúdo misto + restrições de Private Network Access do Chrome. Navegador não fala RTSP.

**Mas o atrito nunca foi instalar — foi o terminal.** Instalador com GUI ≠ programação. Quem instalou WhatsApp Desktop dá conta.

⚠️ **Custo escondido:** assinatura de código no Windows. Binário não assinado dispara SmartScreen ("aplicativo não reconhecido") e o lojista não clica em "executar mesmo assim". Certificado custa algumas centenas de dólares/ano e leva tempo para construir reputação. **Por isso o piloto começa por Docker e TV box, adiando o Windows.**

### 4.2 Caminho alternativo sem agente (só para validação)

Quase todo DVR tem, nas configurações de alarme, **FTP no movimento** e **e-mail no movimento**. Ambos são conexão de **saída** → CGNAT não atrapalha. Zero software instalado.

| | |
|---|---|
| ✅ | sem agente, sem hardware |
| ❌ | detecção é do DVR: crua, sem zonas nos modelos baratos |
| ❌ | **sem controle de cadência → COGS sem teto** |
| ❌ | FTP simples manda senha em texto claro |

Legítimo para pegar 3 clientes rápido e validar demanda. Não é produção.

---

## 5. Modelo de dados

**Metadados vão para tabela. Storage guarda apenas thumbnail.** Nunca gravar JSON em bucket — não se consulta.

```sql
create table events (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null,
  camera_id     uuid not null,
  ts_start      timestamptz not null,
  ts_end        timestamptz not null,
  frame_count   int,
  description   text,                    -- gerado pelo VLM
  objects       jsonb,                   -- {"pessoa":2,"carro":1}
  zone          text,
  anomaly_score real,
  thumb_path    text,
  embedding     vector(768),
  model_version text
);

create index on events (tenant_id, camera_id, ts_start desc);
create index on events using ivfflat (embedding vector_cosine_ops);

alter table events enable row level security;
create policy tenant_isolation on events for select
  using (tenant_id in (select id from companies where user_id = auth.uid()));

create table period_summaries (
  tenant_id uuid, camera_id uuid,
  bucket_start timestamptz, granularity text,  -- '15min' | 'hour' | 'day'
  summary text, counts jsonb, embedding vector(768),
  primary key (camera_id, bucket_start, granularity)
);

create table agent_health (
  agent_id uuid primary key, tenant_id uuid,
  last_seen_at timestamptz, version text, cameras_online int
);
```

**Convenção do projeto:** RLS usa `companies.user_id = auth.uid()` (padrão dos outros produtos da BigCorps).

### 5.1 Recuperação — correção arquitetural importante

❌ **REJEITADO — busca vetorial pura.** A query-âncora do produto é *"dia X entre 15h e 18h houve um roubo, identifica a hora?"*. Isso é **query temporal estruturada**. Vetor puro sobre 200 mil eventos devolve lixo.

**Ordem correta: filtro SQL por tempo/câmera PRIMEIRO, rerank semântico dentro da janela.** Nunca o inverso.

Os `period_summaries` são o que torna consulta longa barata (evita jogar 40 mil eventos no contexto) e são também o artefato que o usuário copia para usar em qualquer IA externa — diferencial declarado pelo fundador. Formato: JSON para máquina, Markdown renderizado para o humano.

❌ **REJEITADO — text-to-SQL livre na v1.** Geração de SQL contra banco multi-tenant é risco de vazamento entre clientes e difícil de debugar. Usar **function calling com 5–6 ferramentas fixas** (`contar_eventos`, `buscar_periodo`, `resumir_dia`, `buscar_semantica`), cada uma query parametrizada com `tenant_id` forçado no servidor. É o padrão que o fundador já usa no minhAi.

### 5.2 Dimensionamento ✅ VERIFICADO (cotas Supabase Pro)

Supabase Pro: US$ 25/mês. Inclui 8 GB de disco por projeto (depois US$ 0,125/GB), 100 GB de Storage (depois US$ 0,021/GB), 250 GB de egress (depois US$ 0,09/GB), 2M invocações de Edge Function.

⚠️ Estimativa com 400 eventos/dia/câmera:

| | Por câmera/mês | Estoura a cota em |
|---|---|---|
| Linhas em `events` | ~10 MB | ~70 câmeras-ano |
| Thumbnails (25 KB) | ~300 MB | ~27 câmeras-ano |

**Storage estoura primeiro.**

### 5.3 Retenção — obrigatória desde a v1

```
0–90 dias    → eventos completos + thumbnails
90–365 dias  → dropa thumbnail, mantém evento
365+ dias    → dropa evento bruto, mantém só rollup horário
```

Se isso for adicionado no mês 8, o resultado é um banco de 200 GB e uma migração cara. Também alinha com a LGPD (retenção limitada à finalidade).

---

## 6. Modelos de IA

### 6.1 Divisão decidida

| Camada | Modelo | Motivo |
|---|---|---|
| **Visão (ingestão)** | **GPT tier nano + `detail: "low"`** | escolha do fundador (teve má experiência com Gemini) e é o mais barato nesta config |
| **Consulta (texto)** | **Groq** | já usado no minhAi; ~R$ 0,001/consulta |

✅ **VERIFICADO — a chave é a contagem de tokens de imagem:**
- OpenAI `detail: "low"` = **85 tokens fixos**, independente das dimensões
- Gemini = tiles de 768×768 a **258 tokens** cada

⚠️ Groq não serve para visão: os modelos com imagem (Llama 4 Scout) seguem em Preview, com aviso explícito de não usar em produção.

⚠️ **Preços de julho/2026 conflitam entre fontes agregadoras.** Verificar em `openai.com/api/pricing` antes de fechar conta. Uma fonte cita GPT-4.1 nano a $0,10/$0,40 como o mais barato da linha; outra cita GPT-5 nano a $0,05 de entrada.

### 6.2 Custo por câmera/mês ⚠️ ESTIMATIVA

Base: 400 eventos/dia, 12.000 chamadas/mês, 4 imagens por chamada, ~450 tokens de prompt, ~180 de saída. Câmbio assumido R$ 5,40.

| Configuração | US$/mês | R$/mês |
|---|---|---|
| **GPT nano + `detail: low`** | **~1,80** | **~10** ✅ |
| Gemini 2.5 Flash-Lite | ~2,60 | ~14 |
| GPT nano + `detail: high` | ~5,10 | ~27 |
| GPT tier intermediário + low | ~22 | ~121 ❌ |

**A armadilha é o tier, não o fornecedor.** Nano: R$ 10. Intermediário: R$ 121. Doze vezes, mesma tarefa.

### 6.3 Otimizações a implementar na v1

1. **Duas passadas** — `detail: low` no evento rotineiro; escala para `high` só quando a passada barata sinalizar algo (pessoa, fora do horário, anomalia).
2. **Prompt caching** — system prompt e contexto da câmera são idênticos em toda chamada. Leitura de cache com desconto de 90% sobre a entrada.
3. **Fatos vs. descrição** — o detector local produz contagens (determinístico). O VLM só descreve. **Nunca deixar o VLM contar** — ele erra e alucina.

### 6.4 Alucinação — risco de produto

Em contexto de segurança, evento fabricado é perigoso. Mitigações obrigatórias:
- Toda descrição fica ligada ao thumbnail; o usuário sempre pode verificar
- Nunca apresentar saída de VLM como fato sem a imagem ao lado
- Metadado **nunca** é o único registro: o vídeo fica no DVR pelo prazo legal
- Testar especificamente **à noite** — é onde modelos de visão desmoronam, e é quando o cliente de segurança mais precisa

### 6.5 Placas (ALPR) — fora da v1

Reconhecimento de placa a partir de câmera panorâmica é problema de **geometria e óptica**, não de modelo. Exige câmera dedicada, ângulo <30°, placa com ~100–150px de largura, iluminador IR.

Tratar como **add-on pago com câmera dedicada**, nunca feature incluída.
✅ Referência: Plate Recognizer Stream US$ 35/mês/câmera, sem limite de leituras; Snapshot grátis até 2.500 leituras/mês.

---

## 7. Achados empíricos ✅ VERIFICADO

Medidos em 30s de vídeo real da loja do fundador (Casa Verde, São Paulo). Câmera Novadigital (ecossistema Tuya) com RTSP habilitado via ONVIF.

### 7.1 Especificação do arquivo
| | |
|---|---|
| Resolução | 2560×1440 |
| Codec | H.265 (HEVC) |
| Taxa | 15 fps |
| Bitrate | ~1,1 Mbps |
| Vídeo contínuo equivalente | ~12 GB/dia, ~357 GB/mês |

### 7.2 dHash 8×8 NÃO funciona nesta câmera

| Método | Repouso | Evento real | Separação |
|---|---|---|---|
| dHash 8×8 | 0–5 | **5** | **nenhuma** ❌ |
| dHash 16×16 | 0–5 | 13–17 | fraca |
| dHash 32×32 | 3–25 | 58–73 | ruidosa |
| **% pixels alterados (320×180)** | **0,02–1,5%** | **4,9–6,2%** | **~4×, limpa** ✅ |

**Motivo:** reduzir 2560×1440 para 9×8 pixels apaga qualquer objeto que não ocupe um terço do quadro. Numa cena de loja com interior estático dominando, isso é tudo.

**Decisão: usar diferença percentual de pixels em 320×180, limiar ~2,5%, delta por pixel 25.**

### 7.3 O pico foi movimento real, não exposição

Teste de normalização de brilho: 6,24% → 6,11%. Praticamente idêntico. A câmera não gera falso positivo por auto-exposição neste cenário.

### 7.4 88% do quadro nunca se mexe

Em 30s, só 11,8% dos pixels tiveram qualquer mudança.

Mapa de atividade (% dos frames com movimento, grade 6 linhas × 8 colunas):
```
        C1    C2    C3    C4    C5    C6    C7    C8
L1     5.8   4.2   0.7   0.1   0.0   0.0   0.0   0.0   <- rua/calçada
L2     8.0   0.5   0.0   0.0   0.0   0.0   0.0   0.0   <- rua/calçada
L3     0.4   0.0   0.0   0.0   1.6   0.0   0.0   0.0
L4     0.0   0.0   0.0   1.0   4.4   0.0   0.0   0.0
L5     0.0   0.0   0.0   5.5   4.4   0.7   0.0   0.0   <- balcão
L6     0.0   0.2   0.7   6.3   3.7   0.2   0.1   0.1   <- balcão
```

**Duas conclusões:**
1. O terço direito (C6–C8) é **zona morta** — porta e parede, 0,0–0,2%. Consome tokens sem nunca gerar evento útil.
2. O canto superior esquerdo (rua) é a **maior fonte de ruído** — 4–8% de atividade constante, valor zero de segurança.

**Isso valida zonas como configuração de primeira classe, não filtro opcional.** Na câmera testada, mascarar rua + zona morta provavelmente corta metade dos eventos.

### 7.5 Correção registrada

Havia previsão de que o timestamp queimado no canto dispararia hash em todo frame. **Exagero.** Piso de ruído medido: 0,02%. Mascarar por higiene, não é problema real.

### 7.6 O que NÃO foi possível concluir

**Taxa de eventos por dia.** 30 segundos não é amostra. 1 evento em 30s extrapolaria para 1.440/dia (3,6× a estimativa de trabalho de 400), mas o número não tem validade estatística.

**É exatamente isso que a medição de 24h vai responder.**

---

## 8. Análise do CSV de 24h — instruções

### 8.1 O que o arquivo contém

`frames.csv`, gerado por `medir-eventos.py` rodando ~24h contra a câmera real:

| Coluna | Significado |
|---|---|
| `ts` | timestamp ISO do frame |
| `pct_cheio` | % pixels alterados, só mascarando o relógio |
| `pct_sem_rua` | idem, mascarando também rua/calçada |
| `pct_foco` | idem, mascarando também a zona morta |
| `brilho` | brilho médio do frame (0–255) |
| `thumb` | caminho do thumbnail, se salvo |

**O script grava medição bruta por frame, não eventos.** Isso é proposital: permite testar vários limiares e zonas offline, sem repetir a captura.

### 8.2 Perguntas que a análise precisa responder

1. **Quantos eventos/dia** em cada uma das 3 máscaras, para limiares 1,5% / 2,5% / 4,0%?
2. **Quanto o mascaramento de zona economiza?** → diferença entre `pct_cheio` e `pct_foco`. Este número é o ROI direto da feature de zonas.
3. **Qual limiar separa melhor sinal de ruído?** → histograma bimodal; o vale entre os modos é o limiar.
4. **Curva de movimento por hora do dia** → embrião da métrica de horário de pico que será vendida.
5. **COGS real por câmera/mês** → eventos/dia × 30 × custo por chamada.
6. **Comportamento noturno** → o brilho cai; a taxa de falso positivo sobe? (IR e ruído de sensor)
7. **Estabilidade** → houve buracos no `ts`? Quantas vezes o RTSP caiu?

### 8.3 Script de análise

```python
#!/usr/bin/env python3
"""Analise do frames.csv da Fase 0.  uso: python analisar.py frames.csv"""
import sys, pandas as pd, numpy as np

df = pd.read_csv(sys.argv[1], parse_dates=["ts"]).sort_values("ts")
horas = (df.ts.max() - df.ts.min()).total_seconds() / 3600
print(f"periodo: {df.ts.min()}  ->  {df.ts.max()}  ({horas:.1f}h, {len(df)} frames)\n")

# --- buracos: RTSP caiu? ---
gaps = df.ts.diff().dt.total_seconds()
print(f"intervalo mediano: {gaps.median():.0f}s | buracos >60s: {(gaps>60).sum()}")
if (gaps > 60).any():
    print(f"  maior buraco: {gaps.max()/60:.1f} min")
print(f"cobertura: {len(df)*10/3600:.1f}h de {horas:.1f}h reais "
      f"({100*len(df)*10/3600/horas:.0f}%)\n")

# --- eventos por limiar e mascara ---
GAP_S = 30   # quietude que fecha um evento
def contar(serie, limiar):
    ativo = serie >= limiar
    # novo evento quando ativa apos >=GAP_S de silencio
    t = df.ts.values.astype("datetime64[s]").astype(float)
    ev, ultimo = 0, -1e9
    for a, ti in zip(ativo, t):
        if a:
            if ti - ultimo > GAP_S: ev += 1
            ultimo = ti
    return ev

print("EVENTOS/DIA por limiar e mascara")
print(f"{'limiar':>8} | {'cheio':>8} {'sem_rua':>8} {'foco':>8} | economia zona")
for lim in (1.0, 1.5, 2.5, 4.0, 6.0):
    c = contar(df.pct_cheio,  lim) / horas * 24
    s = contar(df.pct_sem_rua, lim) / horas * 24
    f = contar(df.pct_foco,   lim) / horas * 24
    eco = 100*(1 - f/c) if c else 0
    print(f"{lim:7.1f}% | {c:8.0f} {s:8.0f} {f:8.0f} | {eco:5.0f}%")

# --- distribuicao: onde esta o vale? ---
print("\nDISTRIBUICAO de pct_foco (percentis)")
for p in (50, 75, 90, 95, 97.5, 99, 99.5, 99.9):
    print(f"  p{p:<5} {np.percentile(df.pct_foco, p):7.2f}%")

# --- por hora do dia ---
df["h"] = df.ts.dt.hour
LIM = 2.5
print(f"\nATIVIDADE POR HORA (limiar {LIM}%, mascara foco)")
for h, g in df.groupby("h"):
    pct = 100 * (g.pct_foco >= LIM).mean()
    print(f"  {h:02d}h  {'#'*int(pct/2):<25} {pct:5.1f}%  (brilho {g.brilho.mean():5.1f})")

# --- COGS ---
ev_dia = contar(df.pct_foco, LIM) / horas * 24
IN_TOK, OUT_TOK = 4*85 + 450, 180        # GPT nano, detail:low, 4 imgs
usd = ev_dia*30 * (IN_TOK*0.10 + OUT_TOK*0.40) / 1e6
print(f"\nCOGS: {ev_dia:.0f} eventos/dia -> US$ {usd:.2f}/mes "
      f"(~R$ {usd*5.4:.2f}) por camera")
print(f"margem no plano R$129 (4 cameras): "
      f"{100*(1 - 4*usd*5.4/129):.0f}%")
```

### 8.4 Como interpretar

| Resultado | Significa |
|---|---|
| < 300 eventos/dia no `foco` | economia excelente; COGS < R$ 8/câmera; margem folgada |
| 300–800 | dentro do previsto; modelo de preço por local fecha |
| 800–1.500 | apertado; a cota de eventos vira obrigatória, não opcional |
| > 1.500 | rever zonas ou aumentar o limiar antes de qualquer código de nuvem |
| Economia de zona < 30% | as coordenadas das zonas estão mal ajustadas — refazer olhando o print |
| Cobertura < 90% | RTSP instável; investigar antes de confiar no número |
| Atividade noturna alta com brilho baixo | ruído de sensor/IR — precisa de limiar dinâmico por período |

⚠️ **Um dia útil não é a semana inteira.** Sábado e domingo têm perfil diferente. O número de terça não deve ser tratado como média sem ressalva.

---

## 9. LGPD

Imagem é dado pessoal. Sanções vão de advertência a **multa de 2% do faturamento, limitada a R$ 50 milhões por infração** ✅ VERIFICADO.

**Não construir reconhecimento facial na v1.** Reconhecimento facial e análises biométricas tratam dado pessoal **sensível** (art. 5º, II), com bases legais restritas. A ANPD instaurou em 2025 processos contra 23 clubes de futebol por irregularidades no uso em estádios ✅ VERIFICADO.

Descrever *"homem de camisa vermelha, ~1,80m"* **não** é biometria. Identificar **quem** é, sim — e muda todo o regime jurídico.

**Checklist mínimo:**
- Base legal: legítimo interesse (art. 7º, IX), documentada em LIA
- Aviso visível no local
- Política de retenção (prática de mercado: 15–90 dias para vídeo)
- RIPD
- **Transferência internacional declarada** — frames vão para a OpenAI, nos EUA

**Argumento comercial:** *"seu vídeo não sai do estabelecimento; só metadados vão para a nuvem"*. É privacy-by-design real e vende bem pós-LGPD.

---

## 10. Roadmap

| Fase | Escopo | Duração |
|---|---|---|
| **0** ⏳ **EM EXECUÇÃO** | Medição de 24h com `medir-eventos.py`. Sem IA, sem custo. | 1 dia |
| 0.1 | Testar qualidade das descrições: 30 frames reais no GPT e no Gemini, mesmo prompt, **incluindo frames noturnos** | 1 dia |
| 1 | Schema no Supabase, `POST /api/ingest` na Vercel, cron de rollup. Alimentado à mão. | 1 semana |
| 2 | Agente v1 em TypeScript, só Docker. Config remota, snapshot/RTSP, diff, agrupamento, POST, heartbeat, buffer offline. | 2 semanas |
| 3 | Dashboard Next.js, timeline, busca em português via function calling no Groq. | 1–2 semanas |
| 4 | Piloto com 3 clientes, 30 dias. | 1 mês |
| depois | Windows assinado, auto-update, alertas, app Android, placas | — |

### 10.1 Métricas do piloto (as que decidem o produto)

1. **Eventos/dia real por câmera** → define o COGS
2. **Taxa de onboarding sem intervenção humana** → self-service ou canal?
3. **Clientes que abrem o sistema espontaneamente após 30 dias** → existe produto?
4. **Quantos prospects conseguem fornecer acesso à câmera** → mede CGNAT na base real

---

## 11. Questões abertas

| # | Questão | Impacto |
|---|---|---|
| 1 | ⏳ Preço nunca validado com cliente real | alto — todo o modelo depende disso |
| 2 | ⏳ Nome "MonitorIA": `monitoria.app`, `.com`, `.io`, `.tech` **indisponíveis**; só `monitoria.ai` livre (US$ 160/2 anos) ✅. Colisão semântica com "monitoria" = tutoria acadêmica → briga de SEO contra universidades | médio |
| 3 | ⏳ Canal: fundador escolheu **direto ao usuário final**. Análise indica payback de 15–31 meses no direto vs. 1–3 meses via integrador ⚠️ | alto |
| 4 | ⏳ Escopo: fundador escolheu **segurança + operação**. Tecnicamente quase de graça (mesma tabela); comercialmente são compradores diferentes. Recomendação: construir os dois, **vender operação** | médio |
| 5 | ⏳ Cliente piloto: existe local para instalar e errar por 90 dias? A loja própria da Casa Verde serve para teste, não como validação de mercado | alto |
| 6 | ⏳ ToS do tier gratuito da Cloudflare Tunnel quanto a tráfego de mídia — não verificado | baixo (só se usar túnel) |
| 7 | ⏳ Custo e prazo do certificado de assinatura de código Windows | médio |

---

## 12. Erros já cometidos e corrigidos

Registrados para o próximo agente não repetir:

| Erro | Correção |
|---|---|
| Recomendar dHash 8×8 | Não separa nada nesta câmera. Usar % de pixels alterados em 320×180 |
| Prever que o timestamp queimado dominaria o ruído | Exagero. Piso medido: 0,02% |
| Aceitar "mais barato que guardar vídeo" como posicionamento | Falso para quem tem DVR: o HD já está pago. Reposicionar em busca + operação + retenção |
| Sugerir Go como linguagem do agente | O fundador não lê Go e não tem SSH na máquina do cliente. TypeScript |
| Sugerir `docker run` como onboarding de usuário final | Terminal é o atrito. Instalador com GUI |
| Precificar por câmera (R$ 39,90) | Convida a multiplicar por 16 canais. Cobrar por local |
| Não considerar que snapshot HTTP substitui RTSP | Amostrando a 10s, sessão RTSP não traz benefício. Simplifica muito o Android |

---

## 13. Contexto do fundador

- **Ith**, fundador e dev principal da BigCorps Tecnologia LTDA
- Stack dominado: **Next.js (App Router) + Supabase + Vercel**, TypeScript, trabalha via GitHub web e Codespaces
- Produtos existentes: minhAi, VigIA Trade, ArteFinal, zerovicio.app, eAi, Vixus
- **Não domina:** Go, Kotlin, desenvolvimento Android nativo (só TWA/Bubblewrap)
- Opera loja física de serviços gráficos (Casa Verde, São Paulo) — é onde está a câmera de teste
- Comunica-se em **português**, prefere **código e diffs a relatórios**
- Pediu explicitamente: honestidade, rigor, correção de premissas erradas, sem elogio automático, distinguir fato de inferência
